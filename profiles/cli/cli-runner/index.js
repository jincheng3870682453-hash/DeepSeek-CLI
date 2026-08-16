// dsh cli profile — interactive terminal runner with a startup config wizard.
//
// Flow:
//   1. Print the DSH whale + brand banner
//   2. Show a startup wizard (permission mode / working directory / model /
//      reasoning display). On terminals that support ANSI cursor control the
//      menu is navigated with ↑/↓ + Enter (like Codex/Claude Code); otherwise
//      it falls back to numbered input.
//   3. Create ONE Agent with the chosen settings and chat, keeping context
//      across turns; stream assistant tokens live to stdout
//   4. /config reopens the wizard; /mode /model /cd /think adjust quickly
//
// Choices persist to $DSH_HOME/cli-settings.json so the next launch starts
// with the last configuration. Input uses a line queue so piped multi-line
// input is processed turn by turn.

import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import z from "@deepseek-ai/schemastery";
import { installModelSelection } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";

/** Stable Cordis plugin name. */
const name = "cli-runner";
/** Core services required before the interactive loop can start. */
const inject = ["agentDefaultModel", "agents", "sessions", "llm", "permissionPresets"];

const Config = z.object({
	/** Show the startup wizard on launch (set false to go straight to chat). */
	showWizard: z.boolean().default(true),
	/**
	 * Play the whale intro animation on launch. Off by default: frame
	 * redraw relies on ANSI cursor-home, which some terminals (classic
	 * conhost setups) do not honour, and the frames stack up instead.
	 */
	showIntro: z.boolean().default(false),
	/** Input prompt shown before each message (TTY only). */
	prompt: z.string().default("❯ ")
});

/** The process streams the runner writes to; tests substitute captures. */
const internals = {
	stdin: process.stdin,
	stdout: process.stdout,
	stderr: process.stderr
};

/** DeepSeek brand palette (truecolor; safe on Windows Terminal / VS Code / Win10+ conhost). */
const PALETTE = {
	blue: "\x1b[38;2;77;107;254m",
	sky: "\x1b[38;2;110;180;255m",
	cyan: "\x1b[38;2;90;200;250m",
	white: "\x1b[38;2;232;237;255m",
	dim: "\x1b[38;2;130;142;170m",
	green: "\x1b[38;2;95;220;160m",
	yellow: "\x1b[38;2;235;200;120m",
	red: "\x1b[38;2;255;120;120m",
	reset: "\x1b[0m"
};

/**
 * The DSH whale — rendered from the official DeepSeek Harness favicon SVG
 * (luminance → half-block ASCII), so it is literally the real logo.
 */
const WHALE = `                                            ▄▄▄▄▄▄              ███
                                      ▄▄▄████████▀▀            ▄████
                  ▄▄▄███████████████████████████               ██████▄                      ▄
              ▄████████████████████████████████                █████████▄▄                ▄███
           ▄████████████████████████████████████               ████████████▄      ▄▄▄▄▄▄██████
         ▄███████████████████████████████████████▄▄            █████████████  ▄██████████████
       ▄████████████████████████████████████████████▄           █████████████████████████████
      ████████████████████████████████████████████████▄         ▀███████████████████████████
    ▄███████████████████████████████████████████████████▄        ▀████████████████████████▀
   ▄██████████████████████████████████████████████████████▄        ▀█████████████████████▀
   █████████████████████████████████████████████████████████▄        ▀████████████████▀
  ████████████████████████████████████████████████████████████▄       ██████████▀▀▀▀
  █████▀▀▀▀▀▀▀▀▀▀▀▀██████████████████████████████████████████████▄    █████████
 ██████               ▀▀███████████████████████████▀▀▀█████████████████████████
 ██████                    ▀█████████████████████       ▀██████████████████████
 ███████                      ▀█████████████████████▄▄    ▀███████████████████
 ███████                         ▀████████████████  ██      ██████████████████
 ███████                           ▀██████████████████       ▀███████████████▀
 ████████                            ▀████████████████▄       ███████████████
 ▀███████▄                             ████████████████▄▄     ▄█████████████
  ████████▄                             ▀██████████████████████████████████▀
  ▀████████▄                              ████████████████████████████████▀
   █████████▄                              ▀█████████████████████████████▀
    █████████▄                              ▀███████████████████████████▀
     ██████████                               █████████████████████████
      ██████████▄              ▄█▄▄▄           ▀█████████████████████▀
       ▀██████████▄            ██████▄▄         ▀██████████████████▀
         ███████████▄           ████████▄▄        ▀███████████████▀
          ▀████████████▄         ██████████▄        ▀███████████████▄▄
            ▀█████████████▄▄▄▄▄▄█████████████▄▄       ▀██████████████████▄
              ▀██████████████████████████████████▄▄▄▄▄▄▄▄█████████████████▀
                 ▀███████████████████████████████████████▀  ▀▀▀▀▀████▀▀▀▀
                    ▀█████████████████████████████████▀
                        ▀▀███████████████████████▀▀▀
                              ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀`;

/** "DEEPSEEK" in figlet standard font (block letters). */
const TITLE = `██████╗ ███████╗███████╗██████╗ ███████╗███████╗███████╗██╗  ██╗
██╔══██╗██╔════╝██╔════╝██╔══██╗██╔════╝██╔════╝██╔════╝██║ ██╔╝
██║  ██║█████╗  █████╗  ██████╔╝█████╗  ███████╗███████╗█████╔╝
██║  ██║██╔══╝  ██╔══╝  ██╔══██╗██╔══╝  ╚════██║╚════██║██╔═██╗
██████╔╝███████╗███████╗██║  ██║███████╗███████║███████║██║  ██╗
╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝`;

/**
 * Play the whale intro: a gentle side-to-side swim, using ANSI cursor-home +
 * per-line clear so frames overwrite in place. TTY only; off by default.
 * @param io - process-facing effects.
 * @param c - active color palette.
 * @param rows - the whale art lines.
 */
async function playIntro(io, c, rows) {
	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	const paint = (offset) => {
		io.stdout.write("\x1b[H");
		for (const line of rows) {
			io.stdout.write(`${c.blue(" ".repeat(offset) + line)}\x1b[K\n`);
		}
	};
	io.stdout.write("\x1b[?25l");
	for (let t = 0; t < 28; t++) {
		const offset = Math.round(6 + 6 * Math.sin((t / 28) * Math.PI * 4));
		paint(offset);
		await sleep(75);
	}
	io.stdout.write("\x1b[2J\x1b[H");
	io.stdout.write("\x1b[?25h");
}

const HELP = `
${"─".repeat(46)}
  /config  打开配置向导      /mode   切换权限模式
  /cd      切换工作目录      /model  切换模型
  /think   显示思考过程      /new    开启新会话
  /exit    退出（Ctrl+C 也可）
${"─".repeat(46)}
  直接输入任意文字即可对话 · 同一会话会记住上下文
`;

/** Localized labels for the permission presets (internal values stay English). */
const MODE_LABELS = {
	"read-only": { name: "只读", desc: "只能读取，不能修改文件" },
	"workspace-write": { name: "工作区写入", desc: "可读写工作区内文件，更大范围操作需确认" },
	"danger-full-access": { name: "完全访问", desc: "全权限操作，不再询问" }
};
const modeName = (m) => MODE_LABELS[m]?.name ?? m;
const modeDesc = (m) => MODE_LABELS[m]?.desc ?? "";

/** Settings persistence under $DSH_HOME (the CLI owns its own store; web-only services are not present here). */
function settingsPath() {
	const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
	return join(home, "cli-settings.json");
}

function loadSettings() {
	try {
		const raw = JSON.parse(readFileSync(settingsPath(), "utf8"));
		return {
			mode: typeof raw.mode === "string" ? raw.mode : "workspace-write",
			cwd: typeof raw.cwd === "string" && existsSync(raw.cwd) ? raw.cwd : process.cwd(),
			provider: typeof raw.provider === "string" ? raw.provider : "deepseek-official",
			model: typeof raw.model === "string" ? raw.model : "deepseek-v4-flash",
			showReasoning: raw.showReasoning === true,
			cwdHistory: Array.isArray(raw.cwdHistory) ? raw.cwdHistory.filter((p) => typeof p === "string" && existsSync(p)).slice(0, 10) : []
		};
	} catch {
		return { mode: "workspace-write", cwd: process.cwd(), provider: "deepseek-official", model: "deepseek-v4-flash", showReasoning: false, cwdHistory: [] };
	}
}

function saveSettings(s) {
	try {
		const file = settingsPath();
		mkdirSync(join(file, ".."), { recursive: true });
		writeFileSync(file, JSON.stringify(s, null, 2), "utf8");
	} catch {
		// persistence is best-effort
	}
}

/** The credentials document path (same store the web Models page writes). */
function credentialsPath() {
	const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
	return join(home, ".credentials.yaml");
}

/** Whether a DEEPSEEK_API_KEY is present in the credentials document. */
function apiKeyConfigured() {
	try {
		const raw = readFileSync(credentialsPath(), "utf8");
		return /\bDEEPSEEK_API_KEY\s*:\s*["']?[^\s"']+/.test(raw);
	} catch {
		return false;
	}
}

/** Write (or replace) the DEEPSEEK_API_KEY in the credentials document. */
function saveApiKey(key) {
	const file = credentialsPath();
	mkdirSync(dirname(file), { recursive: true });
	let content = "";
	if (existsSync(file)) {
		content = readFileSync(file, "utf8")
			.split("\n")
			.filter((line) => {
				const t = line.trim();
				return !t.startsWith("DEEPSEEK_API_KEY") && !t.startsWith("#");
			})
			.join("\n")
			.trim();
		if (content !== "") content += "\n";
	}
	content += `DEEPSEEK_API_KEY: "${key}"\n`;
	writeFileSync(file, content, "utf8");
}

/** Short masked preview of a key for display ("sk-…abcd"). */
function maskKey(key) {
	if (key.length <= 8) return "*".repeat(key.length);
	return `${key.slice(0, 3)}${"*".repeat(6)}${key.slice(-4)}`;
}

/** Expand a user-entered directory path. */
function expandPath(input) {
	let p = input.trim();
	if (p === "~") p = homedir();
	else if (p.startsWith("~/") || p.startsWith("~\\")) p = join(homedir(), p.slice(2));
	return resolve(p);
}

/** Terminal display width of a string (CJK/wide chars count as 2 columns). */
function displayWidth(text) {
	let w = 0;
	for (const ch of text) w += ch.charCodeAt(0) > 0x2e7f ? 2 : 1;
	return w;
}

/** Pad a string to a display width with spaces (CJK-aware, unlike padEnd). */
function padCjk(text, width) {
	return text + " ".repeat(Math.max(0, width - displayWidth(text)));
}

function isDirectory(p) {
	try {
		return statSync(p).isDirectory();
	} catch {
		return false;
	}
}

/** Color helpers — no-op when not a TTY. */
function makePalette(tty) {
	const wrap = (code) => (tty ? (text) => `${code}${text}${PALETTE.reset}` : (text) => text);
	return {
		blue: wrap(PALETTE.blue),
		sky: wrap(PALETTE.sky),
		cyan: wrap(PALETTE.cyan),
		white: wrap(PALETTE.white),
		dim: wrap(PALETTE.dim),
		green: wrap(PALETTE.green),
		yellow: wrap(PALETTE.yellow),
		red: wrap(PALETTE.red)
	};
}

/** Report an unexpected failure and request a failing exit. */
function fail(io, error) {
	io.stderr.write(`dsh: ${error instanceof Error ? error.message : String(error)}\n`);
	io.exit(1);
}

/**
 * Run the interactive loop: config wizard, then one Agent, many turns.
 * @param ctx - plugin context carrying the Agent, default model, Session, and launcher IO services.
 * @param config - validated runner config.
 * @param io - process-facing effects.
 */
async function run(ctx, config, io) {
	await ctx.get("loader")?.await();
	const agents = ctx.get("agents");
	const defaultModel = ctx.get("agentDefaultModel");
	const sessions = ctx.get("sessions");
	const llm = ctx.get("llm");
	const permissionPresets = ctx.get("permissionPresets");
	if (agents === void 0 || defaultModel === void 0 || sessions === void 0) return;

	const tty = io.stdout.isTTY === true && io.stdin.isTTY === true;
	const c = makePalette(tty);

	let settings = loadSettings();

	// ---- input queue -------------------------------------------------------
	const rl = createInterface({ input: io.stdin, output: io.stdout });
	const pendingLines = [];
	let waiter = null;
	let closed = false;
	let exiting = false;
	let busy = false;
	let menuActive = false;
	let swallowLines = false;

	const settle = (line) => {
		if (menuActive && tty) return; // menu mode swallows typed lines
		if (swallowLines && tty && line !== null) {
			// The Enter that confirmed a menu choice also emits a 'line'
			// event; drop it so it cannot be consumed as the next choice.
			swallowLines = false;
			return;
		}
		if (waiter !== null) {
			const w = waiter;
			waiter = null;
			w.resolve(line);
		} else if (line !== null) {
			pendingLines.push(line);
		}
	};
	rl.on("line", (line) => settle(line));
	rl.on("close", () => {
		closed = true;
		settle(null);
	});

	/** Interrupt the in-flight turn (agent keeps queued input), then resume chatting. */
	let interrupted = false;
	const interruptTurn = () => {
		interrupted = true;
		if (agent !== null && agent !== void 0 && typeof agent.cancel === "function") {
			try {
				agent.cancel("interrupted", { keepInbox: true });
			} catch {
				// best-effort interrupt
			}
		}
	};
	/** Clear the current input line and redraw the prompt (normal CLI Ctrl+C). */
	const clearInputLine = () => {
		io.stdout.write("\r\x1b[K");
		if (tty) io.stdout.write(c.cyan(config.prompt));
	};

	// ---- VT capability probe -------------------------------------------------
	// The arrow-key menu redraws in place with ANSI cursor movement. Probe with
	// a Device Status Report; a terminal that answers gets the menu, everything
	// else (pipes, ancient conhost) falls back to numbered input.
	let vt = false;
	const probeVt = () => new Promise((resolve) => {
		let done = false;
		const finish = (ok) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			rl.input.removeListener("data", onData);
			rl.input.removeListener("keypress", onKey);
			resolve(ok);
		};
		const onData = (chunk) => {
			const s = chunk.toString("utf8");
			if (s.includes("\x1b[") && s.includes("R")) finish(true);
		};
		const onKey = (str, key) => {
			// readline may parse the DSR reply into a keypress with sequence
			if (key !== void 0 && key.sequence !== void 0 && key.sequence.startsWith("\x1b[") && key.sequence.endsWith("R")) finish(true);
			if (key !== void 0 && key.name === "R" && str === void 0) finish(true);
		};
		const timer = setTimeout(() => finish(false), 150);
		rl.input.on("data", onData);
		rl.input.on("keypress", onKey);
		io.stdout.write("\x1b[6n");
	});

	// ---- arrow-key menu -------------------------------------------------------
	// State for one open menu. pickFromMenu() opens it; keypress drives it.
	let menuTitle = "";
	let menuOptions = [];
	let menuCursor = 0;
	let menuResolve = null;
	let menuLines = 0;
	/** askSecret() owns the keypress stream while active. */
	let secretMode = false;

	/** Hidden single-line input (API keys): echoes asterisks; null on ESC. */
	const askSecret = (prompt) => new Promise((resolve) => {
		if (!tty) {
			io.stdout.write(prompt);
			nextLine().then((line) => resolve(line ?? null));
			return;
		}
		secretMode = true;
		menuActive = true; // swallow 'line' events during secret input
		let buf = "";
		const redraw = () => {
			io.stdout.write(`\r\x1b[K${c.dim(prompt)}${c.white("*".repeat(buf.length))}`);
		};
		const cleanup = () => {
			rl.input.removeListener("keypress", onKey);
			secretMode = false;
			menuActive = false;
		};
		const onKey = (str, key) => {
			if (key.name === "return" || key.name === "enter") {
				cleanup();
				io.stdout.write("\n");
				resolve(buf);
			} else if (key.name === "backspace") {
				buf = buf.slice(0, -1);
				redraw();
			} else if (key.name === "escape") {
				cleanup();
				io.stdout.write("\n");
				resolve(null);
			} else if (str !== void 0 && !key.ctrl && !key.meta) {
				buf += str;
				redraw();
			}
		};
		rl.input.on("keypress", onKey);
		redraw();
	});

	const buildMenuLines = () => {
		const lines = [];
		if (menuTitle !== "") lines.push(c.white(menuTitle));
		for (const opt of menuOptions) {
			const selected = menuOptions.indexOf(opt) === menuCursor;
			const arrow = selected ? c.cyan("❯") : c.dim(" ");
			lines.push(` ${arrow} ${opt.label}`);
		}
		lines.push(c.dim("↑↓ 选择 · Enter 确认 · 数字直接选 · q 返回"));
		return lines;
	};
	const clearMenuArea = () => {
		if (menuLines > 0) {
			io.stdout.write(`\x1b[${menuLines}A\r`);
			for (let i = 0; i < menuLines; i++) io.stdout.write("\x1b[K\n");
			io.stdout.write(`\x1b[${menuLines}A\r`);
			menuLines = 0;
		}
	};
	const drawMenu = () => {
		clearMenuArea();
		const lines = buildMenuLines();
		menuLines = lines.length;
		for (const line of lines) io.stdout.write(line + "\n");
	};
	const redrawMenu = () => drawMenu();

	/** Open a VT menu; resolves to the picked option or null on cancel. */
	const pickFromMenu = (title, options) => new Promise((resolve) => {
		menuTitle = title;
		menuOptions = options;
		menuCursor = 0;
		menuResolve = resolve;
		menuActive = true;
		drawMenu();
	});
	/** Close the open menu, clearing its area; returns the picked option. */
	const closeMenu = (picked) => {
		const resolve = menuResolve;
		menuResolve = null;
		menuActive = false;
		clearMenuArea();
		if (resolve !== null) resolve(picked);
	};

	rl.input.on("keypress", (str, key) => {
		if (key === void 0) return;
		if (secretMode) return; // askSecret() owns the stream
		if (menuResolve !== null) {
			// --- menu navigation ---
			if (key.name === "up") {
				menuCursor = (menuCursor - 1 + menuOptions.length) % menuOptions.length;
				redrawMenu();
			} else if (key.name === "down") {
				menuCursor = (menuCursor + 1) % menuOptions.length;
				redrawMenu();
			} else if (key.name === "return" || key.name === "enter") {
				// Enter also emits a 'line' event right after; drop it so it
				// cannot be consumed as the next input.
				swallowLines = true;
				closeMenu(menuOptions[menuCursor] ?? null);
			} else if (key.name === "escape" || key.name === "q") {
				closeMenu(null);
			} else if (str !== void 0 && /^[1-9]$/.test(str)) {
				const idx = Number(str) - 1;
				if (menuOptions[idx] !== void 0) closeMenu(menuOptions[idx]);
			}
			return; // consume every key while a menu is open
		}
		// --- normal chat mode: ESC behaves like Ctrl+C ---
		if (key.name === "escape" && !exiting) {
			if (busy) {
				interruptTurn();
			} else if (tty && rl.line !== void 0 && rl.line.trim() !== "") {
				clearInputLine();
			} else {
				exiting = true;
				settle(null);
			}
		}
	});

	rl.on("SIGINT", () => {
		if (exiting) return;
		if (menuResolve !== null) {
			// Ctrl+C while configuring: quit.
			closeMenu(null);
			exiting = true;
			settle(null);
			return;
		}
		if (busy) {
			// Mid-turn: interrupt the reply, do not quit the chat.
			interruptTurn();
			return;
		}
		// Idle: with text in the input line, wipe the line and keep chatting;
		// on an empty line, quit.
		if (tty && rl.line !== void 0 && rl.line.trim() !== "") {
			clearInputLine();
			return;
		}
		exiting = true;
		settle(null);
	});

	/** Next input line, or null on EOF / exit request. */
	const nextLine = () => {
		if (pendingLines.length > 0) return Promise.resolve(pendingLines.shift());
		if (closed || exiting) return Promise.resolve(null);
		return new Promise((resolve) => {
			waiter = { resolve };
		});
	};

	/** nextLine with a timeout; resolves null when no line arrives in ms. */
	const nextLineTimed = (ms) => {
		if (pendingLines.length > 0) return Promise.resolve(pendingLines.shift());
		if (closed || exiting) return Promise.resolve(null);
		return new Promise((resolve) => {
			const entry = { resolve: (value) => {
				clearTimeout(timer);
				resolve(value);
			} };
			const timer = setTimeout(() => {
				if (waiter === entry) {
					waiter = null;
					resolve(null);
				}
			}, ms);
			waiter = entry;
		});
	};

	/**
	 * Next chat message. On a TTY, lines that arrive back-to-back (a paste)
	 * within a short window are merged into one message with newlines, so
	 * pasting a block of code/text stays a single turn. Commands and piped
	 * input are handled line by line as before.
	 */
	const nextMessage = async () => {
		const first = await nextLine();
		if (first === null || exiting) return first;
		if (!tty) return first;
		if (first.trim().startsWith("/")) return first;
		const parts = [first];
		while (true) {
			const next = await nextLineTimed(120);
			if (next === null) break;
			parts.push(next);
		}
		return parts.join("\n");
	};

	/** Ask one line with an optional prompt; null on EOF. */
	const ask = async (prompt) => {
		if (tty && prompt !== void 0) io.stdout.write(prompt);
		return nextLine();
	};

	// ---- agent lifecycle ---------------------------------------------------
	let agent = null;

	async function createAgentFor() {
		const selection = {
			provider: settings.provider,
			model: settings.model
		};
		const { agent: next } = await agents.create({
			sessionId: SessionId(`session-${randomUUID()}`),
			meta: { cwd: settings.cwd },
			agentOptions: selection,
			setup: (agentCtx) => {
				installModelSelection(agentCtx, { current: selection, assembled: void 0 });
			}
		});
		await next.whenIdle();
		if (permissionPresets !== void 0 && permissionPresets.names.includes(settings.mode)) {
			try {
				permissionPresets.set(next.session, settings.mode);
			} catch {
				// best-effort; session continues with defaults
			}
		}
		agent = next;
		return next;
	}

	/** Recreate the agent after cwd/model changes (old session is flushed and kept). */
	async function rebuildAgent() {
		if (creating !== null) {
			// wait for the background creation to settle first, so only one
			// agent is live at a time
			await creating.catch(() => {});
			creating = null;
		}
		if (agent !== void 0 && agent !== null) {
			try {
				await sessions.flush(agent.session);
			} catch {
				// best-effort
			}
		}
		await createAgentFor();
	}

	async function finish(code) {
		try {
			rl.close();
			if (agent !== void 0 && agent !== null) await sessions.flush(agent.session);
		} catch {
			// best-effort flush; exit code still wins
		}
		io.exit(code);
		// The launcher's graceful shutdown waits for the event loop to drain,
		// but lingering service handles (fs watchers, sockets) keep it alive
		// forever. Force the exit once the session flush has been written.
		setTimeout(() => process.exit(code), 300);
	}

	// ---- banner -------------------------------------------------------------
	if (tty && config.showIntro) {
		try {
			await playIntro(io, c, WHALE.split("\n"));
		} catch {
			// animation is decorative; fall back to the static banner
		}
	}
	io.stdout.write(c.blue(WHALE) + "\n");
	io.stdout.write(c.blue(TITLE) + "\n");
	io.stdout.write(`${c.sky("DeepSeek Harness")}${c.dim(" · 交互式命令行 · v0.1.0-rc.6")}\n`);
	io.stdout.write(`${c.dim("─".repeat(52))}\n`);
	io.stdout.write(`${c.dim("输入消息直接对话 ·  /config 配置 ·  /help 帮助 ·  /exit 退出")}\n\n`);

	// Probe for ANSI cursor control before the wizard (TTY only).
	if (tty) vt = await probeVt();
	if (tty && !vt) {
		io.stdout.write(`${c.dim("（当前终端未响应光标控制，已使用数字输入菜单；推荐 Windows Terminal / VS Code 体验方向键）")}\n`);
	}

	// ---- first-run: API key ---------------------------------------------------
	if (!apiKeyConfigured()) {
		io.stdout.write(`\n${c.yellow("首次使用：需要先配置 API Key 才能对话")}\n`);
		const key = await askSecret("请输入 DeepSeek API Key（sk-...）：");
		if (key !== null && key.trim() !== "") {
			if (key.trim().startsWith("sk-")) {
				saveApiKey(key.trim());
				io.stdout.write(`${c.green(`✓ API Key 已保存（${maskKey(key.trim())}）`)}\n`);
			} else {
				io.stdout.write(`${c.red("✗ Key 格式不正确（应以 sk- 开头）")}${c.dim("，可重跑 dsh-chat 重新配置")}\n`);
			}
		} else {
			io.stdout.write(`${c.dim("已跳过；之后可用 /config 重新配置")}\n`);
		}
	}

	// ---- startup wizard -----------------------------------------------------
	const runWizard = async () => {
		let models = [];
		try {
			if (llm !== void 0) {
				models = await llm.listModels(settings.provider);
			}
		} catch {
			models = [];
		}
		const availableModes = permissionPresets !== void 0 ? permissionPresets.names : ["workspace-write", "danger-full-access"];
		const modelLabel = (id) => models.find((m) => m.id === id)?.name ?? id;

		// -------- arrow-key wizard (VT terminals) --------
		if (vt) {
			while (true) {
				const mainPick = await pickFromMenu("启动配置", [
					{ label: `${padCjk("权限模式", 12)}${modeName(settings.mode)}`, value: "mode" },
					{ label: `${padCjk("工作目录", 12)}${settings.cwd}`, value: "cwd" },
					{ label: `${padCjk("模型", 14)}${modelLabel(settings.model)} (${settings.model})`, value: "model" },
					{ label: `${padCjk("显示思考过程", 14)}${settings.showReasoning ? "开" : "关"}`, value: "think" },
					{ label: `${padCjk("API Key", 12)}${apiKeyConfigured() ? "已配置" : "未配置"}`, value: "apikey" },
					{ label: "▶ 开始对话", value: "start" }
				]);
				if (mainPick === null) {
					exiting = true;
					await finish(0);
					return null;
				}
				if (mainPick.value === "start") return settings;

				if (mainPick.value === "mode") {
					const modePick = await pickFromMenu("是否允许工作区之外的操作？", availableModes.map((m) => ({
						label: `${padCjk(modeName(m), 12)}${c.dim(m)}${modeDesc(m) ? c.dim(`  ${modeDesc(m)}`) : ""}`,
						value: m
					})));
					if (modePick === null) continue;
					settings.mode = modePick.value;
					saveSettings(settings);
					io.stdout.write(`${c.green(`✓ 权限模式：${modeName(settings.mode)}`)}${c.dim(`（${settings.mode}）`)}\n`);
					if (agent !== void 0 && agent !== null && permissionPresets !== void 0) {
						try {
							permissionPresets.set(agent.session, settings.mode);
						} catch {
							// best-effort
						}
					}
				} else if (mainPick.value === "cwd") {
					const cwdPick = await pickFromMenu("工作目录（是否在此目录工作？）", [
						{ label: `使用当前目录：${process.cwd()}`, value: process.cwd() },
						...settings.cwdHistory.filter((p) => p !== process.cwd()).map((p) => ({
							label: `${p}${p === settings.cwd ? "  ← 当前" : ""}`,
							value: p
						})),
						{ label: "✎ 输入新路径…", value: "__input__" }
					]);
					if (cwdPick === null) continue;
					let target;
					if (cwdPick.value === "__input__") {
						io.stdout.write(c.dim("输入路径（支持 ~）："));
						const raw = await nextLine();
						if (raw === null) {
							exiting = true;
							await finish(0);
							return null;
						}
						target = expandPath(raw);
					} else {
						target = cwdPick.value;
					}
					if (isDirectory(target)) {
						if (target !== settings.cwd) {
							settings.cwd = target;
							settings.cwdHistory = [target, ...settings.cwdHistory.filter((p) => p !== target)].slice(0, 10);
							saveSettings(settings);
							await rebuildAgent();
							io.stdout.write(`${c.green(`✓ 工作目录：${settings.cwd}`)}\n`);
						}
					} else {
						io.stdout.write(`${c.red(`✗ 目录不存在：${target}`)}\n`);
					}
				} else if (mainPick.value === "model") {
					if (models.length === 0) {
						io.stdout.write(`${c.red("模型列表不可用")}\n`);
						continue;
					}
					const modelPick = await pickFromMenu("模型", models.map((m) => ({
						label: `${m.name}  ${m.id}${m.id === settings.model ? "  ← 当前" : ""}`,
						value: m
					})));
					if (modelPick === null) continue;
					const next = modelPick.value;
					if (next.id !== settings.model) {
						settings.model = next.id;
						settings.provider = next.provider;
						saveSettings(settings);
						await rebuildAgent();
						io.stdout.write(`${c.green(`✓ 模型：${next.name} (${next.id})`)}\n`);
					}
				} else if (mainPick.value === "think") {
					settings.showReasoning = !settings.showReasoning;
					saveSettings(settings);
					io.stdout.write(`${c.green(`✓ 显示思考过程：${settings.showReasoning ? "开" : "关"}`)}\n`);
				} else if (mainPick.value === "apikey") {
					const key = await askSecret("请输入 DeepSeek API Key（sk-...，ESC 取消）：");
					if (key !== null && key.trim() !== "") {
						if (key.trim().startsWith("sk-")) {
							saveApiKey(key.trim());
							io.stdout.write(`${c.green(`✓ API Key 已保存（${maskKey(key.trim())}）`)}\n`);
						} else {
							io.stdout.write(`${c.red("✗ Key 格式不正确（应以 sk- 开头）")}\n`);
						}
					} else {
						io.stdout.write(`${c.dim("已取消")}\n`);
					}
				}
			}
		}

		// -------- numbered-input wizard (non-VT / piped) --------
		while (true) {
			io.stdout.write(`\n${c.dim("┌─")}${c.white(" 启动配置 ")}${c.dim("─".repeat(36))}${c.dim("┐")}\n`);
			io.stdout.write(`${c.dim("│")} ${c.cyan("1.")} ${c.white(padCjk("权限模式", 12))}${c.yellow(modeName(settings.mode))}${c.dim(`  ${settings.mode}`)}\n`);
			io.stdout.write(`${c.dim("│")} ${c.cyan("2.")} ${c.white(padCjk("工作目录", 12))}${c.sky(settings.cwd)}\n`);
			io.stdout.write(`${c.dim("│")} ${c.cyan("3.")} ${c.white(padCjk("模型", 14))}${c.sky(`${modelLabel(settings.model)} (${settings.model})`)}\n`);
			io.stdout.write(`${c.dim("│")} ${c.cyan("4.")} ${c.white(padCjk("显示思考过程", 14))}${settings.showReasoning ? c.green("开") : c.dim("关")}\n`);
			io.stdout.write(`${c.dim("│")} ${c.cyan("5.")} ${c.white(padCjk("API Key", 12))}${apiKeyConfigured() ? c.green("已配置") : c.red("未配置")}\n`);
			io.stdout.write(`${c.dim("│")} ${c.dim("─".repeat(40))}\n`);
			io.stdout.write(`${c.dim("│")} ${c.cyan("6.")} ${c.green("▶ 开始对话")}\n`);
			io.stdout.write(`${c.dim("└")}${c.dim("─".repeat(42))}${c.dim("┘")}\n`);
			io.stdout.write(`${c.dim("选择 1-6，回车直接开始对话：")}`);

			const raw = await nextLine();
			if (raw === null) {
				exiting = true;
				await finish(0);
				return null;
			}
			const choice = raw.trim();
			if (choice === "") return settings;
			const num = Number.parseInt(choice, 10);
			if (!Number.isNaN(num) && num >= 1 && num <= 6) {
				if (num === 6) return settings;
				if (num === 1) {
					io.stdout.write(`\n${c.dim("是否允许工作区之外的操作？")}\n`);
					availableModes.forEach((m, i) => {
						io.stdout.write(`  ${c.cyan(`${i + 1}.`)} ${c.white(modeName(m))}${c.dim(`  ${m}`)}${modeDesc(m) ? c.dim(`  ${modeDesc(m)}`) : ""}\n`);
					});
					const pick = (await ask(c.dim("选择编号：")) ?? "").trim();
					const idx = Number.parseInt(pick, 10) - 1;
					if (availableModes[idx] !== void 0) {
						settings.mode = availableModes[idx];
						saveSettings(settings);
						io.stdout.write(`${c.green(`✓ 权限模式：${modeName(settings.mode)}`)}${c.dim(`（${settings.mode}）`)}\n`);
						if (agent !== void 0 && agent !== null && permissionPresets !== void 0) {
							try {
								permissionPresets.set(agent.session, settings.mode);
							} catch {
								// best-effort
							}
						}
					}
				} else if (num === 2) {
					io.stdout.write(`\n${c.dim("工作目录（是否在此目录工作？）：")}\n`);
					io.stdout.write(`  ${c.cyan("0.")} ${c.sky(`使用当前目录：${process.cwd()}`)}\n`);
					settings.cwdHistory.filter((p) => p !== process.cwd()).forEach((p, i) => {
						io.stdout.write(`  ${c.cyan(`${i + 1}.`)} ${c.sky(p)}${p === settings.cwd ? c.dim("  ← 当前") : ""}\n`);
					});
					io.stdout.write(`  ${c.dim("或直接输入新路径，回车跳过")}\n`);
					const pick = (await ask(c.dim("路径/编号：")) ?? "").trim();
					let target = null;
					if (pick !== "") {
						const hidx = Number.parseInt(pick, 10);
						if (pick === "0") {
							target = process.cwd();
						} else if (!Number.isNaN(hidx) && settings.cwdHistory.filter((p) => p !== process.cwd())[hidx - 1] !== void 0) {
							target = settings.cwdHistory.filter((p) => p !== process.cwd())[hidx - 1];
						} else {
							target = expandPath(pick);
						}
					}
					if (target !== null && isDirectory(target)) {
						if (target !== settings.cwd) {
							settings.cwd = target;
							settings.cwdHistory = [target, ...settings.cwdHistory.filter((p) => p !== target)].slice(0, 10);
							saveSettings(settings);
							await rebuildAgent();
							io.stdout.write(`${c.green(`✓ 工作目录：${settings.cwd}`)}\n`);
						}
					} else if (target !== null) {
						io.stdout.write(`${c.red(`✗ 目录不存在：${target}`)}\n`);
					}
				} else if (num === 3) {
					if (models.length === 0) {
						io.stdout.write(`${c.red("模型列表不可用")}\n`);
						continue;
					}
					io.stdout.write(`\n${c.dim("模型：")}\n`);
					models.forEach((m, i) => {
						io.stdout.write(`  ${c.cyan(`${i + 1}.`)} ${c.white(m.name)}${c.dim(`  ${m.id}`)}${m.id === settings.model ? c.dim("  ← 当前") : ""}\n`);
					});
					const pick = (await ask(c.dim("选择编号：")) ?? "").trim();
					const idx = Number.parseInt(pick, 10) - 1;
					const next = models[idx];
					if (next !== void 0 && next.id !== settings.model) {
						settings.model = next.id;
						settings.provider = next.provider;
						saveSettings(settings);
						await rebuildAgent();
						io.stdout.write(`${c.green(`✓ 模型：${next.name} (${next.id})`)}\n`);
					}
				} else if (num === 4) {
					settings.showReasoning = !settings.showReasoning;
					saveSettings(settings);
					io.stdout.write(`${c.green(`✓ 显示思考过程：${settings.showReasoning ? "开" : "关"}`)}\n`);
				} else if (num === 5) {
					const key = (await ask(c.dim("请输入 DeepSeek API Key（sk-...，直接回车取消）：")) ?? "").trim();
					if (key !== "") {
						if (key.startsWith("sk-")) {
							saveApiKey(key);
							io.stdout.write(`${c.green(`✓ API Key 已保存（${maskKey(key)}）`)}\n`);
						} else {
							io.stdout.write(`${c.red("✗ Key 格式不正确（应以 sk- 开头）")}\n`);
						}
					} else {
						io.stdout.write(`${c.dim("已取消")}\n`);
					}
				}
				continue;
			}
			// Exit commands work from the wizard too.
			if (choice === "/exit" || choice === "/quit" || choice === "/q") {
				exiting = true;
				await finish(0);
				return null;
			}
			// Non-menu input: start chatting and treat it as the first message.
			pendingLines.unshift(choice);
			return settings;
		}
	};

	// Pre-create the agent in the background while the wizard runs so choosing
	// "start" is instant. cwd/model changes inside the wizard wait for this
	// creation to settle, then rebuild with the new settings.
	let creating = null;
	if (config.showWizard && (agent === void 0 || agent === null)) {
		creating = createAgentFor().catch(() => {
			creating = null;
		});
	}
	if (config.showWizard) {
		const result = await runWizard();
		if (result === null) return;
	}
	if (creating !== null) {
		await creating.catch(() => {});
		creating = null;
	}
	if (agent === void 0 || agent === null) await createAgentFor();

	// ---- live streamer ------------------------------------------------------
	const toolNames = new Map();
	const onEvent = (session, event) => {
		if (agent === null || session.id !== agent.session.id) return;
		if (event.type === "assistant/chunk") {
			const chunk = event.data.chunk;
			if (chunk.type === "text-delta" && chunk.text !== "") {
				io.stdout.write(chunk.text);
			} else if (chunk.type === "reasoning-delta" && settings.showReasoning && chunk.text !== "") {
				io.stdout.write(c.dim(chunk.text));
			}
		} else if (event.type === "tool/call") {
			toolNames.set(event.data.callId, event.data.name);
			io.stdout.write(`\n${c.cyan(`  ◈ ${event.data.name}`)}${c.dim(" …")}\n`);
		} else if (event.type === "tool/result") {
			const toolName = toolNames.get(event.data.message?.source?.callId) ?? "工具";
			io.stdout.write(`${c.green(`  ✓ ${toolName}`)}\n`);
		}
	};
	ctx.on("session/event", onEvent);

	async function submitTurn(text) {
		busy = true;
		try {
			const firstSeq = agent.session.seq;
			agent.followup(createUserMessage({
				content: [{ type: "text", text }],
				source: { kind: "user" }
			}));
			await agent.whenIdle();
			io.stdout.write("\n");
			if (interrupted) {
				io.stdout.write(`${c.dim("（已中断）")}\n`);
				interrupted = false;
			}
			let reason;
			for (const event of agent.session.events) {
				if (event.seq < firstSeq) continue;
				if (event.type === "turn/end") reason = event.data.reason;
			}
			if (reason?.kind === "error") {
				io.stderr.write(`${c.red(`dsh: ${reason.error.code}: ${reason.error.message}`)}\n`);
			}
		} finally {
			busy = false;
		}
	}

	// ---- main chat loop -----------------------------------------------------
	while (!exiting) {
		if (tty) io.stdout.write(c.cyan(config.prompt));
		const line = await nextMessage();
		if (line === null) break;
		const text = line.trim();
		if (text === "") continue;

		if (text.startsWith("/")) {
			const [cmd, ...rest] = text.slice(1).split(/\s+/);
			const arg = rest.join(" ").trim();
			switch (cmd) {
				case "exit":
				case "quit":
				case "q":
					exiting = true;
					await finish(0);
					return;
				case "help":
				case "h":
					io.stdout.write(HELP);
					continue;
				case "config": {
					busy = true;
					try {
						const result = await runWizard();
						if (result === null) return;
					} finally {
						busy = false;
					}
					continue;
				}
				case "mode": {
					const available = permissionPresets !== void 0 ? permissionPresets.names : [];
					if (arg === "") {
						io.stdout.write(`${c.dim("当前权限模式")} ${c.yellow(modeName(settings.mode))}${c.dim(`（${settings.mode}）`)}\n`);
						io.stdout.write(`${c.dim(`可选：${available.map((m) => `${modeName(m)}（${m}）`).join(" / ")}`)}\n`);
						continue;
					}
					if (available.includes(arg)) {
						settings.mode = arg;
						saveSettings(settings);
						if (permissionPresets !== void 0) {
							try {
								permissionPresets.set(agent.session, arg);
							} catch {
								// best-effort
							}
						}
						io.stdout.write(`${c.green(`✓ 权限模式：${modeName(arg)}`)}${c.dim(`（${arg}）`)}\n`);
					} else {
						io.stdout.write(`${c.red(`✗ 未知模式：${arg}`)}${c.dim(`（可选：${available.map((m) => modeName(m)).join(" / ")}）`)}\n`);
					}
					continue;
				}
				case "cd": {
					if (arg === "") {
						io.stdout.write(`${c.dim("当前工作目录")} ${c.sky(settings.cwd)}\n`);
						io.stdout.write(`${c.dim("用法：/cd <路径>")}\n`);
						continue;
					}
					const target = expandPath(arg);
					if (isDirectory(target)) {
						settings.cwd = target;
						settings.cwdHistory = [target, ...settings.cwdHistory.filter((p) => p !== target)].slice(0, 10);
						saveSettings(settings);
						await rebuildAgent();
						io.stdout.write(`${c.green(`✓ 工作目录：${settings.cwd}`)}${c.dim("（已开启新会话）")}\n`);
					} else {
						io.stdout.write(`${c.red(`✗ 目录不存在：${target}`)}\n`);
					}
					continue;
				}
				case "model": {
					if (arg === "") {
						io.stdout.write(`${c.dim("当前模型")} ${c.sky(settings.model)}${c.dim(`（${settings.provider}）`)}\n`);
						io.stdout.write(`${c.dim("用法：/model <模型id>，或 /model list 查看列表")}\n`);
						continue;
					}
					if (arg === "list" || arg === "?") {
						try {
							const models = await llm.listModels(settings.provider);
							models.forEach((m) => io.stdout.write(`  ${c.white(m.name)}${c.dim(`  ${m.id}`)}\n`));
						} catch {
							io.stdout.write(`${c.red("模型列表不可用")}\n`);
						}
						continue;
					}
					settings.model = arg;
					saveSettings(settings);
					await rebuildAgent();
					io.stdout.write(`${c.green(`✓ 模型：${arg}`)}${c.dim("（已开启新会话）")}\n`);
					continue;
				}
				case "think": {
					const on = arg === "on" || arg === "1" || arg === "true";
					const off = arg === "off" || arg === "0" || arg === "false";
					if (on) settings.showReasoning = true;
					else if (off) settings.showReasoning = false;
					else settings.showReasoning = !settings.showReasoning;
					saveSettings(settings);
					io.stdout.write(`${c.green(`✓ 显示思考过程：${settings.showReasoning ? "开" : "关"}`)}\n`);
					continue;
				}
				case "new": {
					await rebuildAgent();
					io.stdout.write(`${c.dim("—— 已开启新会话 ——")}\n`);
					continue;
				}
				default:
					io.stdout.write(`${c.red(`未知命令：/${cmd}`)}${c.dim("（输入 /help 查看命令列表）")}\n`);
					continue;
			}
		}

		try {
			await submitTurn(text);
		} catch (error) {
			io.stderr.write(`${c.red(`dsh: ${error instanceof Error ? error.message : String(error)}`)}\n`);
		}
	}

	if (!exiting) {
		exiting = true;
		await finish(0);
	}
}

/**
 * Mount the interactive direct driver.
 * @param ctx - plugin context carrying core services and the launcher-provided exit request.
 * @param config - validated runner config.
 */
function apply(ctx, config) {
	const exit = ctx.get("appExit");
	if (exit === void 0) throw new Error("cli-runner: the launcher must provide ctx.appExit before the tree mounts");
	const io = {
		stdin: internals.stdin,
		stdout: internals.stdout,
		stderr: internals.stderr,
		exit
	};
	run(ctx, config, io).catch((error) => {
		fail(io, error);
	});
}

export { Config, apply, inject, internals, name };
