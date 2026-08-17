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
import { existsSync } from "node:fs";
import z from "@deepseek-ai/schemastery";
import { installModelSelection } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import {
	VERSION,
	makeT,
	MODE_LABELS,
	displayWidth,
	padCjk,
	expandPath,
	isDirectory,
	maskKey,
	dshHome,
	customSkillDir,
	customPresetDir,
	createSkillTemplate,
	listCustomPresets
} from "./utils.js";
import {
	loadSettings,
	saveSettings,
	apiKeyConfigured,
	saveApiKey
} from "./config.js";
import { makePalette, createMenuController } from "./menu.js";
import { parseCommand } from "./commands.js";

/** Stable Cordis plugin name. */
const name = "cli-runner";
/** Core services required before the interactive loop can start. */
const inject = ["agentDefaultModel", "agents", "sessions", "llm", "permissionPresets", "agentPresets", "skills"];

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

	// ---- launch arguments (from `dsh --profile cli --flag ...`) ----
	const argv = ctx.get("cmdlineArgs")?.get?.() ?? [];
	const opts = {
		noInput: argv.includes("--no-input") || argv.includes("-n"),
		verbose: argv.includes("--verbose") || argv.includes("--debug") || argv.includes("-v"),
		autoFix: argv.includes("--auto-fix")
	};
	// --no-input: headless/scripted mode — skip the wizard entirely.
	if (opts.noInput) config.showWizard = false;

	// ---- proxy support: honor HTTP(S)_PROXY env automatically ----
	// DeepSeek requests use the built-in undici fetch, which does not read
	// proxy env vars by itself; install a global ProxyAgent when configured.
	try {
		const { ProxyAgent, setGlobalDispatcher } = await import("undici");
		const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
		if (ProxyAgent !== void 0 && setGlobalDispatcher !== void 0 && proxy) {
			setGlobalDispatcher(new ProxyAgent(proxy));
			if (opts.verbose) io.stderr.write(`[debug] 代理已启用: ${proxy}\n`);
		}
	} catch {
		// proxy setup is best-effort
	}

	const tty = io.stdout.isTTY === true && io.stdin.isTTY === true;
	const c = makePalette(tty);

	let settings = loadSettings();
	let t = makeT(settings.language);
	/** Language-aware labels for permission presets. */
	const modeName = (m) => MODE_LABELS[m]?.[settings.language === "en" ? "en" : "zh"] ?? m;
	const modeDesc = (m) => MODE_LABELS[m]?.[settings.language === "en" ? "enDesc" : "zhDesc"] ?? "";
	/** Language-aware option labels used by the wizard and commands. */
	const effortName = (e) => ({ off: t("effortOff"), high: t("effortHigh"), max: t("effortMax") })[e] ?? e;
	const langName = (l) => (l === "zh" ? "中文" : "English");
	const busyName = (b) => (b === "queue" ? t("busyQueue") : t("busyInterrupt"));

	// ---- input queue -------------------------------------------------------
	const rl = createInterface({ input: io.stdin, output: io.stdout });
	const pendingLines = [];
	let waiter = null;
	let closed = false;
	let exiting = false;
	let busy = false;
	let secretMode = false; // askSecret() owns the keypress stream while active

	const settle = (line) => {
		if (menu.isOpen() && tty) return; // menu mode swallows typed lines
		if (menu.consumeLine(line)) return; // drop the Enter that confirmed a menu choice
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
	// One menu controller instance for the whole session; the wizard opens
	// pickers with menu.pick() and the keypress handler forwards keys to it.
	const menu = createMenuController(io, c, t, tty);

	/** Hidden single-line input (API keys): echoes asterisks; null on ESC. */
	const askSecret = (prompt) => new Promise((resolve) => {
		if (!tty) {
			io.stdout.write(prompt);
			nextLine().then((line) => resolve(line ?? null));
			return;
		}
		secretMode = true;
		let buf = "";
		const redraw = () => {
			io.stdout.write(`\r\x1b[K${c.dim(prompt)}${c.white("*".repeat(buf.length))}`);
		};
		const cleanup = () => {
			rl.input.removeListener("keypress", onKey);
			secretMode = false;
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

	rl.input.on("keypress", (str, key) => {
		if (key === void 0) return;
		if (secretMode) return; // askSecret() owns the stream
		if (menu.onKey(str, key)) {
			// 菜单打开时 readline 会把字符收进自己的行缓冲（并回显到框下方）；
			// 立即清空，防止残留混进菜单关闭后的下一条输入，也避免回显破坏框体
			if (rl.line !== "" || rl.cursor !== 0) {
				rl.line = "";
				rl.cursor = 0;
			}
			return;
		}
		// --- busy mode: interrupt-on-input (when configured) ---
		if (busy && settings.busyAction === "interrupt") {
			interruptTurn();
			return;
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
		if (menu.isOpen()) {
			// Ctrl+C while configuring: quit.
			menu.close(null);
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
			model: settings.model,
			reasoningEffort: settings.effort === "off" ? "off" : settings.effort
		};
		const { agent: next } = await agents.create({
			sessionId: SessionId(`session-${randomUUID()}`),
			meta: { cwd: settings.cwd },
			agentOptions: selection,
			setup: async (agentCtx) => {
				installModelSelection(agentCtx, { current: selection, assembled: void 0 });
				// Apply the chosen agent preset (tools + prompt sections) if the
				// roster is composed.
				const presets = ctx.get("agentPresets");
				if (presets !== void 0) {
					try {
						const preset = await presets.resolve(settings.preset);
						if (preset !== void 0 && preset.broken === void 0) {
							await presets.mount(agentCtx, settings.preset);
						}
					} catch {
						// unknown/broken preset: fall back to the roster default
						try {
							await presets.mount(agentCtx);
						} catch {
							// no roster at all
						}
					}
				}
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
	io.stdout.write(`${c.sky(t("bannerSub", VERSION))}\n`);
	io.stdout.write(`${c.dim("─".repeat(52))}\n`);
	io.stdout.write(`${c.dim(t("bannerHint"))}\n\n`);

	// Probe for ANSI cursor control before the wizard (TTY only).
	if (tty) vt = await probeVt();
	if (tty && !vt) {
		io.stdout.write(`${c.dim(t("vtFallback"))}\n`);
	}

	// ---- first-run: API key ---------------------------------------------------
	if (!apiKeyConfigured()) {
		io.stdout.write(`\n${c.yellow(t("firstRun"))}\n`);
		const key = await askSecret(t("askKey"));
		if (key !== null && key.trim() !== "") {
			if (key.trim().startsWith("sk-")) {
				saveApiKey(key.trim());
				io.stdout.write(`${c.green(t("keySaved", maskKey(key.trim())))}\n`);
			} else {
				io.stdout.write(`${c.red(t("keyBad"))}${c.dim(t("keyBadHint"))}\n`);
			}
		} else {
			io.stdout.write(`${c.dim(t("keySkipped"))}\n`);
		}
	}

	// ---- startup wizard -----------------------------------------------------
	const runWizard = async () => {
		// Discover models across every configurable provider (deepseek-official,
		// pi-ai, …), tagged with their provider for the picker.
		let models = [];
		try {
			if (llm !== void 0) {
				const providers = llm.listConfigurableProviders();
				for (const p of providers) {
					try {
						const ms = await llm.listModels(p.provider);
						models.push(...ms.map((m) => ({
							provider: p.provider,
							providerName: p.displayName ?? p.provider,
							id: m.id,
							name: m.name
						})));
					} catch {
						// provider without a live adapter — skip its models
					}
				}
				// Fallback: make sure the current provider's models are always
				// listed even if the configurable-provider directory is empty.
				if (models.length === 0) {
					const ms = await llm.listModels(settings.provider);
					models.push(...ms.map((m) => ({
						provider: settings.provider,
						providerName: settings.provider,
						id: m.id,
						name: m.name
					})));
				}
			}
		} catch {
			models = [];
		}
		const availableModes = permissionPresets !== void 0 ? permissionPresets.names : ["workspace-write", "danger-full-access"];
		const modelLabel = (id) => models.find((m) => m.id === id)?.name ?? id;

		// -------- arrow-key wizard (VT terminals) --------
		if (vt) {
			const listPlugins = () => {
				const loader = ctx.get("loader");
				if (loader === void 0 || typeof loader.entries !== "function") {
					io.stdout.write(`${c.dim(t("pluginsUnavailable"))}\n`);
					return;
				}
				const names = [...loader.entries()].map((e) => e.options.name).filter(Boolean);
				io.stdout.write(`${c.dim(t("loadedPlugins", names.length))}\n`);
				names.forEach((n) => io.stdout.write(`  ${c.white(n)}\n`));
			};
			const listSkills = async () => {
				const skills = ctx.get("skills");
				if (skills === void 0) {
					io.stdout.write(`${c.dim(t("skillsUnavailable"))}\n`);
					return;
				}
				try {
					const items = await skills.list({ cwd: settings.cwd });
					if (items.length === 0) {
						io.stdout.write(`${c.dim(t("noSkills"))}\n`);
						return;
					}
					io.stdout.write(`${c.dim(t("availableSkillsColon"))}\n`);
					items.forEach((s) => io.stdout.write(`  ${c.white(s.name)}${s.description ? c.dim(`  ${s.description}`) : ""}\n`));
				} catch {
					io.stdout.write(`${c.dim(t("skillsListUnavailable"))}\n`);
				}
			};

			while (true) {
				const mainPick = await menu.pick(t("menuTitle"), [
					{ label: `${padCjk(t("menuMode"), 12)}${modeName(settings.mode)}`, value: "mode" },
					{ label: `${padCjk(t("menuCwd"), 12)}${settings.cwd}`, value: "cwd" },
					{ label: `${padCjk(t("menuModel"), 14)}${modelLabel(settings.model)} (${settings.model})`, value: "model" },
					{ label: `${padCjk(t("menuThink"), 14)}${settings.showReasoning ? t("on") : t("off")}`, value: "think" },
					{ label: `${padCjk(t("menuKey"), 12)}${apiKeyConfigured() ? t("configured") : t("notConfigured")}`, value: "apikey" },
					{ label: t("menuAdvanced"), value: "advanced" },
					{ label: t("menuStart"), value: "start" }
				]);
				if (mainPick === null) {
					exiting = true;
					await finish(0);
					return null;
				}
				if (mainPick.value === "start") return settings;

				if (mainPick.value === "advanced") {
					const advPick = await menu.pick(t("advTitle"), [
						{ label: `${padCjk(t("advEffort"), 12)}${effortName(settings.effort)}`, value: "effort" },
						{ label: `${padCjk(t("advPreset"), 12)}${settings.preset}`, value: "preset" },
						{ label: `${padCjk(t("advLang"), 14)}${langName(settings.language)}`, value: "language" },
						{ label: `${padCjk(t("advBusy"), 12)}${busyName(settings.busyAction)}`, value: "busy" },
						{ label: t("advCustomSkill"), value: "custom-skill" },
						{ label: t("advCustomPreset"), value: "custom-preset" },
						{ label: t("advPlugins"), value: "plugins" },
						{ label: t("advSkills"), value: "skills" }
					]);
					if (advPick === null) continue;
					if (advPick.value === "effort") {
						const effPick = await menu.pick(t("effortTitle"), [
							{ label: `${padCjk(t("effortOff"), 12)}${t("effortOffDesc")}`, value: "off" },
							{ label: `${padCjk(t("effortHigh"), 12)}${t("effortHighDesc")}`, value: "high" },
							{ label: `${padCjk(t("effortMax"), 12)}${t("effortMaxDesc")}`, value: "max" }
						]);
						if (effPick === null) continue;
						settings.effort = effPick.value;
						saveSettings(settings);
						io.stdout.write(`${c.green(t("effortSet", effortName(settings.effort)))}\n`);
					} else if (advPick.value === "preset") {
						const presets = ctx.get("agentPresets");
						let items = [{ label: `${t("presetDefault")}  ${c.dim("standard")}`, value: "standard" }];
						if (presets !== void 0) {
							try {
								const list = await presets.list();
								if (list.length > 0) {
									items = list.map((p) => ({
										label: `${p.name ?? p.id}${c.dim(`  ${p.id}`)}${p.broken !== void 0 ? c.red(t("presetBroken", p.broken)) : ""}${p.id === settings.preset ? `  ← ${t("curLabel")}` : ""}`,
										value: p.id
									}));
								}
							} catch {
								// fall back to default list
							}
						}
						const presetPick = await menu.pick(t("presetTitle"), items);
						if (presetPick === null) continue;
						settings.preset = presetPick.value;
						saveSettings(settings);
						await rebuildAgent();
						io.stdout.write(`${c.green(t("presetSet", settings.preset))}${c.dim(t("newSessionHint"))}\n`);
					} else if (advPick.value === "language") {
						const langPick = await menu.pick(t("langTitle"), [
							{ label: "中文（简体）", value: "zh" },
							{ label: "English", value: "en" }
						]);
						if (langPick === null) continue;
						settings.language = langPick.value;
						t = makeT(settings.language);
						saveSettings(settings);
						io.stdout.write(`${c.green(t("langSet", langName(settings.language)))}\n`);
					} else if (advPick.value === "busy") {
						const busyPick = await menu.pick(t("busyTitle"), [
							{ label: `${padCjk(t("busyQueue"), 12)}${t("busyQueueDesc")}`, value: "queue" },
							{ label: `${padCjk(t("busyInterrupt"), 12)}${t("busyInterruptDesc")}`, value: "interrupt" }
						]);
						if (busyPick === null) continue;
						settings.busyAction = busyPick.value;
						saveSettings(settings);
						io.stdout.write(`${c.green(t("busySet", busyName(settings.busyAction)))}\n`);
					} else if (advPick.value === "custom-skill") {
						const custom = (() => {
							try {
								const dir = customSkillDir();
								if (!existsSync(dir)) return [];
								return readdirSync(dir).filter((child) => existsSync(join(dir, child, "SKILL.md")) || existsSync(join(dir, `${child}.md`)));
							} catch {
								return [];
							}
						})();
						io.stdout.write(`${c.dim(t("customSkillDirLabel", c.sky(customSkillDir())))}\n`);
						io.stdout.write(`${c.dim(t("customSkillFormat"))}\n`);
						io.stdout.write(`${c.dim(t("customSkillHas", custom.length > 0 ? custom.join(", ") : t("none")))}\n`);
						const name = (await ask(c.dim(t("customSkillAsk"))) ?? "").trim();
						if (name !== "") {
							const result = createSkillTemplate(name);
							io.stdout.write(result.ok
								? `${c.green(t("customSkillCreated", result.path))}${c.dim(t("customSkillCreatedHint"))}\n`
								: `${c.red(`✗ ${result.message}`)}\n`);
						}
					} else if (advPick.value === "custom-preset") {
						const custom = listCustomPresets();
						io.stdout.write(`${c.dim(t("customPresetDirLabel", c.sky(customPresetDir())))}\n`);
						io.stdout.write(`${c.dim(t("customPresetFormat"))}\n`);
						io.stdout.write(`${c.dim(t("customPresetHas", custom.length > 0 ? custom.join(", ") : t("none")))}\n`);
						const name = (await ask(c.dim(t("customPresetAsk"))) ?? "").trim();
						if (name !== "") {
							const presets = ctx.get("agentPresets");
							if (presets !== void 0 && typeof presets.copy === "function") {
								try {
									await presets.copy("standard", name, name);
									io.stdout.write(`${c.green(t("customPresetCreated", customPresetDir() + "\\" + name))}${c.dim(t("customPresetCreatedHint"))}\n`);
								} catch (err) {
									io.stdout.write(`${c.red(t("createFailed", err.message))}\n`);
								}
							} else {
								io.stdout.write(`${c.red(t("presetUnavailable"))}\n`);
							}
						}
					} else if (advPick.value === "plugins") {
						listPlugins();
					} else if (advPick.value === "skills") {
						await listSkills();
					}
					continue;
				}

				if (mainPick.value === "mode") {
					const modePick = await menu.pick(t("modeTitle"), availableModes.map((m) => ({
						label: `${padCjk(modeName(m), 12)}${c.dim(m)}${modeDesc(m) ? c.dim(`  ${modeDesc(m)}`) : ""}`,
						value: m
					})));
					if (modePick === null) continue;
					settings.mode = modePick.value;
					saveSettings(settings);
					io.stdout.write(`${c.green(t("modeSet", modeName(settings.mode)))}${c.dim(`（${settings.mode}）`)}\n`);
					if (agent !== void 0 && agent !== null && permissionPresets !== void 0) {
						try {
							permissionPresets.set(agent.session, settings.mode);
						} catch {
							// best-effort
						}
					}
				} else if (mainPick.value === "cwd") {
					const cwdPick = await menu.pick(t("cwdTitle"), [
						{ label: t("cwdUseCurrent", process.cwd()), value: process.cwd() },
						...settings.cwdHistory.filter((p) => p !== process.cwd()).map((p) => ({
							label: `${p}${p === settings.cwd ? `  ← ${t("curLabel")}` : ""}`,
							value: p
						})),
						{ label: t("cwdInput"), value: "__input__" }
					]);
					if (cwdPick === null) continue;
					let target;
					if (cwdPick.value === "__input__") {
						io.stdout.write(c.dim(t("cwdInputPrompt")));
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
							io.stdout.write(`${c.green(t("cwdSet", settings.cwd))}\n`);
						}
					} else {
						io.stdout.write(`${c.red(t("cwdNotExist", target))}\n`);
					}
				} else if (mainPick.value === "model") {
					if (models.length === 0) {
						io.stdout.write(`${c.red(t("modelListUnavailable"))}\n`);
						continue;
					}
					const modelPick = await menu.pick(t("modelTitle"), models.map((m) => ({
						label: `${m.name}  ${c.dim(`${m.id}`)}${c.dim(`  [${m.providerName}]`)}${m.provider === settings.provider && m.id === settings.model ? c.dim(`  ← ${t("curLabel")}`) : ""}`,
						value: m
					})));
					if (modelPick === null) continue;
					const next = modelPick.value;
					if (next.id !== settings.model || next.provider !== settings.provider) {
						settings.model = next.id;
						settings.provider = next.provider;
						saveSettings(settings);
						await rebuildAgent();
						io.stdout.write(`${c.green(t("modelSet", next.name, next.id))}${c.dim(`  [${next.providerName}]`)}\n`);
					}
				} else if (mainPick.value === "think") {
					settings.showReasoning = !settings.showReasoning;
					saveSettings(settings);
					io.stdout.write(`${c.green(t("thinkSet", settings.showReasoning ? t("on") : t("off")))}\n`);
				} else if (mainPick.value === "apikey") {
					const key = await askSecret(t("askKeyEsc"));
					if (key !== null && key.trim() !== "") {
						if (key.trim().startsWith("sk-")) {
							saveApiKey(key.trim());
							io.stdout.write(`${c.green(t("keySaved", maskKey(key.trim())))}\n`);
						} else {
							io.stdout.write(`${c.red(t("keyBad"))}\n`);
						}
					} else {
						io.stdout.write(`${c.dim(t("cancelled"))}\n`);
					}
				}
			}
		}

		// -------- numbered-input wizard (non-VT / piped) --------
		while (true) {
			io.stdout.write(`\n${c.dim("┌─")}${c.white(` ${t("menuTitle")} `)}${c.dim("─".repeat(36))}${c.dim("┐")}\n`);
			io.stdout.write(`${c.dim("│")} ${c.cyan("1.")} ${c.white(padCjk(t("menuMode"), 12))}${c.yellow(modeName(settings.mode))}${c.dim(`  ${settings.mode}`)}\n`);
			io.stdout.write(`${c.dim("│")} ${c.cyan("2.")} ${c.white(padCjk(t("menuCwd"), 12))}${c.sky(settings.cwd)}\n`);
			io.stdout.write(`${c.dim("│")} ${c.cyan("3.")} ${c.white(padCjk(t("menuModel"), 14))}${c.sky(`${modelLabel(settings.model)} (${settings.model})`)}\n`);
			io.stdout.write(`${c.dim("│")} ${c.cyan("4.")} ${c.white(padCjk(t("menuThink"), 14))}${settings.showReasoning ? c.green(t("on")) : c.dim(t("off"))}\n`);
			io.stdout.write(`${c.dim("│")} ${c.cyan("5.")} ${c.white(padCjk(t("menuKey"), 12))}${apiKeyConfigured() ? c.green(t("configured")) : c.red(t("notConfigured"))}\n`);
			io.stdout.write(`${c.dim("│")} ${c.cyan("6.")} ${c.white(t("menuAdvanced"))}\n`);
			io.stdout.write(`${c.dim("│")} ${c.dim("─".repeat(40))}\n`);
			io.stdout.write(`${c.dim("│")} ${c.cyan("7.")} ${c.green(t("menuStart"))}\n`);
			io.stdout.write(`${c.dim("└")}${c.dim("─".repeat(42))}${c.dim("┘")}\n`);
			io.stdout.write(`${c.dim(t("wizardPrompt"))}`);

			const raw = await nextLine();
			if (raw === null) {
				exiting = true;
				await finish(0);
				return null;
			}
			const choice = raw.trim();
			if (choice === "") return settings;
			const num = Number.parseInt(choice, 10);
			if (!Number.isNaN(num) && num >= 1 && num <= 7) {
				if (num === 7) return settings;
				if (num === 1) {
					io.stdout.write(`\n${c.dim(t("modeTitle"))}\n`);
					availableModes.forEach((m, i) => {
						io.stdout.write(`  ${c.cyan(`${i + 1}.`)} ${c.white(modeName(m))}${c.dim(`  ${m}`)}${modeDesc(m) ? c.dim(`  ${modeDesc(m)}`) : ""}\n`);
					});
					const pick = (await ask(c.dim(t("selectNum"))) ?? "").trim();
					const idx = Number.parseInt(pick, 10) - 1;
					if (availableModes[idx] !== void 0) {
						settings.mode = availableModes[idx];
						saveSettings(settings);
						io.stdout.write(`${c.green(t("modeSet", modeName(settings.mode)))}${c.dim(`（${settings.mode}）`)}\n`);
						if (agent !== void 0 && agent !== null && permissionPresets !== void 0) {
							try {
								permissionPresets.set(agent.session, settings.mode);
							} catch {
								// best-effort
							}
						}
					}
				} else if (num === 2) {
					io.stdout.write(`\n${c.dim(t("cwdTitle"))}:\n`);
					io.stdout.write(`  ${c.cyan("0.")} ${c.sky(t("cwdUseCurrent", process.cwd()))}\n`);
					settings.cwdHistory.filter((p) => p !== process.cwd()).forEach((p, i) => {
						io.stdout.write(`  ${c.cyan(`${i + 1}.`)} ${c.sky(p)}${p === settings.cwd ? c.dim(`  ← ${t("curLabel")}`) : ""}\n`);
					});
					io.stdout.write(`  ${c.dim(t("cwdInputPrompt"))}\n`);
					const pick = (await ask(c.dim(t("selectNum"))) ?? "").trim();
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
							io.stdout.write(`${c.green(t("cwdSet", settings.cwd))}\n`);
						}
					} else if (target !== null) {
						io.stdout.write(`${c.red(t("cwdNotExist", target))}\n`);
					}
				} else if (num === 3) {
					if (models.length === 0) {
						io.stdout.write(`${c.red(t("modelListUnavailable"))}\n`);
						continue;
					}
					io.stdout.write(`\n${c.dim(t("modelTitle"))}:\n`);
					models.forEach((m, i) => {
						io.stdout.write(`  ${c.cyan(`${i + 1}.`)} ${c.white(m.name)}${c.dim(`  ${m.id}`)}${m.id === settings.model ? c.dim(`  ← ${t("curLabel")}`) : ""}\n`);
					});
					const pick = (await ask(c.dim(t("selectNum"))) ?? "").trim();
					const idx = Number.parseInt(pick, 10) - 1;
					const next = models[idx];
					if (next !== void 0 && next.id !== settings.model) {
						settings.model = next.id;
						settings.provider = next.provider;
						saveSettings(settings);
						await rebuildAgent();
						io.stdout.write(`${c.green(t("modelSet", next.name, next.id))}\n`);
					}
				} else if (num === 4) {
					settings.showReasoning = !settings.showReasoning;
					saveSettings(settings);
					io.stdout.write(`${c.green(t("thinkSet", settings.showReasoning ? t("on") : t("off")))}\n`);
				} else if (num === 5) {
					const key = (await ask(c.dim(t("askKeyEnter"))) ?? "").trim();
					if (key !== "") {
						if (key.startsWith("sk-")) {
							saveApiKey(key);
							io.stdout.write(`${c.green(t("keySaved", maskKey(key)))}\n`);
						} else {
							io.stdout.write(`${c.red(t("keyBad"))}\n`);
						}
					} else {
						io.stdout.write(`${c.dim(t("cancelled"))}\n`);
					}
				} else if (num === 6) {
					// Advanced settings (numbered form)
					io.stdout.write(`\n${c.white(t("advancedTitle"))}\n`);
					io.stdout.write(`  ${c.cyan("1.")} ${c.white(t("advEffort"))} ${c.dim(`(${t("curLabel")}: ${effortName(settings.effort)})`)}\n`);
					io.stdout.write(`  ${c.cyan("2.")} ${c.white(t("advPreset"))} ${c.dim(`(${t("curLabel")}: ${settings.preset})`)}\n`);
					io.stdout.write(`  ${c.cyan("3.")} ${c.white(t("advLang"))} ${c.dim(`(${t("curLabel")}: ${langName(settings.language)})`)}\n`);
					io.stdout.write(`  ${c.cyan("4.")} ${c.white(t("advBusy"))} ${c.dim(`(${t("curLabel")}: ${busyName(settings.busyAction)})`)}\n`);
					io.stdout.write(`  ${c.cyan("5.")} ${c.white(t("advPlugins"))}\n`);
					io.stdout.write(`  ${c.cyan("6.")} ${c.white(t("advSkills"))}\n`);
					const adv = (await ask(c.dim(t("selectNum"))) ?? "").trim();
					if (adv === "1") {
						io.stdout.write(`\n${c.dim(t("effortTitle"))}:\n  ${c.cyan("1.")} ${c.white(t("effortOff"))} — ${t("effortOffDesc")}\n  ${c.cyan("2.")} ${c.white(t("effortHigh"))} — ${t("effortHighDesc")}\n  ${c.cyan("3.")} ${c.white(t("effortMax"))} — ${t("effortMaxDesc")}\n`);
						const pick = (await ask(c.dim(t("selectNum"))) ?? "").trim();
						const map = { 1: "off", 2: "high", 3: "max" };
						if (map[pick] !== void 0) {
							settings.effort = map[pick];
							saveSettings(settings);
							await rebuildAgent();
							io.stdout.write(`${c.green(t("effortSet", effortName(settings.effort)))}${c.dim(t("newSessionHint"))}\n`);
						}
					} else if (adv === "2") {
						const presets = ctx.get("agentPresets");
						io.stdout.write(`\n${c.dim(t("presetTitle"))}:\n`);
						if (presets !== void 0) {
							try {
								const list = await presets.list();
								list.forEach((p) => io.stdout.write(`  ${c.white(p.name ?? p.id)}${c.dim(`  ${p.id}`)}${p.broken !== void 0 ? c.red(t("presetBroken", p.broken)) : ""}\n`));
							} catch {
								// ignore
							}
						}
						io.stdout.write(`  ${c.white("standard")}\n`);
						const pick = (await ask(c.dim(t("presetTitle") + " id: ")) ?? "").trim();
						if (pick !== "") {
							settings.preset = pick;
							saveSettings(settings);
							await rebuildAgent();
							io.stdout.write(`${c.green(t("presetSet", pick))}${c.dim(t("newSessionHint"))}\n`);
						}
					} else if (adv === "3") {
						const pick = (await ask(c.dim("zh / en: ")) ?? "").trim();
						if (pick === "zh" || pick === "en") {
							settings.language = pick;
							t = makeT(settings.language);
							saveSettings(settings);
							io.stdout.write(`${c.green(t("langSet", langName(settings.language)))}\n`);
						}
					} else if (adv === "4") {
						const pick = (await ask(c.dim("queue / interrupt: ")) ?? "").trim();
						if (pick === "queue" || pick === "interrupt") {
							settings.busyAction = pick;
							saveSettings(settings);
							io.stdout.write(`${c.green(t("busySet", busyName(settings.busyAction)))}\n`);
						}
					} else if (adv === "5") {
						const loader = ctx.get("loader");
						if (loader !== void 0 && typeof loader.entries === "function") {
							const names = [...loader.entries()].map((e) => e.options.name).filter(Boolean);
							io.stdout.write(`${c.dim(t("loadedPlugins", names.length))}\n`);
							names.forEach((n) => io.stdout.write(`  ${c.white(n)}\n`));
						} else {
							io.stdout.write(`${c.dim(t("pluginsUnavailable"))}\n`);
						}
					} else if (adv === "6") {
						const skills = ctx.get("skills");
						if (skills !== void 0) {
							try {
								const items = await skills.list({ cwd: settings.cwd });
								if (items.length === 0) io.stdout.write(`${c.dim(t("noSkills"))}\n`);
								else {
									io.stdout.write(`${c.dim(t("availableSkills", items.length))}\n`);
									items.forEach((s) => io.stdout.write(`  ${c.white(s.name)}${s.description ? c.dim(`  ${s.description}`) : ""}\n`));
								}
							} catch {
								io.stdout.write(`${c.dim(t("skillsListUnavailable"))}\n`);
							}
						} else {
							io.stdout.write(`${c.dim(t("skillsUnavailable"))}\n`);
						}
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

	// 先等引擎 / Agent 初始化完全完成，再显示配置向导——
	// 避免初始化较慢时蓝色配置框提前弹出（向导内改 cwd/model 会用 rebuildAgent 重建）
	let creating = null;
	if (agent === void 0 || agent === null) {
		if (tty) io.stdout.write(`${c.dim(t("starting"))}\n`);
		creating = createAgentFor().catch(() => {
			creating = null;
		});
	}
	if (creating !== null) {
		await creating.catch(() => {});
		creating = null;
	}
	if (config.showWizard) {
		const result = await runWizard();
		if (result === null) return;
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
			const toolName = toolNames.get(event.data.message?.source?.callId) ?? t("toolName");
			io.stdout.write(`${c.green(`  ✓ ${toolName}`)}\n`);
		}
	};
	ctx.on("session/event", onEvent);

	async function submitTurn(text) {
		busy = true;
		const turnStart = Date.now();
		try {
			const firstSeq = agent.session.seq;
			agent.followup(createUserMessage({
				content: [{ type: "text", text }],
				source: { kind: "user" }
			}));
			await agent.whenIdle();
			io.stdout.write("\n");
			if (interrupted) {
				io.stdout.write(`${c.dim(t("interrupted"))}\n`);
				interrupted = false;
			}
			// ---- verbose diagnostics: turn timing + token usage ----
			if (opts.verbose) {
				const elapsedMs = Date.now() - turnStart;
				let usage;
				let toolCalls = 0;
				for (const event of agent.session.events) {
					if (event.seq < firstSeq) continue;
					if (event.type === "assistant/message" && event.data.usage !== void 0) usage = event.data.usage;
					if (event.type === "tool/call") toolCalls++;
				}
				const parts = [`回合耗时 ${(elapsedMs / 1000).toFixed(2)}s`];
				if (usage !== void 0) {
					parts.push(`prompt ${usage.promptTokens ?? usage.inputTokens ?? "?"} tok`);
					parts.push(`output ${usage.outputTokens ?? "?"} tok`);
					if (usage.cacheReadTokens) parts.push(`cache-read ${usage.cacheReadTokens}`);
					if (usage.cacheWriteTokens) parts.push(`cache-write ${usage.cacheWriteTokens}`);
				}
				if (toolCalls > 0) parts.push(`工具 ${toolCalls} 次`);
				io.stderr.write(`[debug] ${parts.join(" · ")}\n`);
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
			const parsed = parseCommand(text);
			if (parsed === null) continue;
			const { cmd, arg, rest } = parsed;
			switch (cmd) {
				case "exit":
				case "quit":
				case "q":
					exiting = true;
					await finish(0);
					return;
				case "help":
				case "h":
					io.stdout.write(t("help"));
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
						io.stdout.write(`${c.dim(t("currentMode"))} ${c.yellow(modeName(settings.mode))}${c.dim(`（${settings.mode}）`)}\n`);
						io.stdout.write(`${c.dim(t("modeOptional", available.map((m) => `${modeName(m)}（${m}）`).join(" / ")))}\n`);
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
						io.stdout.write(`${c.green(t("modeSet", modeName(arg)))}${c.dim(`（${arg}）`)}\n`);
					} else {
						io.stdout.write(`${c.red(t("unknownMode", arg))}${c.dim(`（${t("modeOptional", available.map((m) => modeName(m)).join(" / "))}）`)}\n`);
					}
					continue;
				}
				case "cd": {
					if (arg === "") {
						io.stdout.write(`${c.dim(t("currentCwd"))} ${c.sky(settings.cwd)}\n`);
						io.stdout.write(`${c.dim(t("cdUsage"))}\n`);
						continue;
					}
					const target = expandPath(arg);
					if (isDirectory(target)) {
						settings.cwd = target;
						settings.cwdHistory = [target, ...settings.cwdHistory.filter((p) => p !== target)].slice(0, 10);
						saveSettings(settings);
						await rebuildAgent();
						io.stdout.write(`${c.green(t("cwdSet", settings.cwd))}${c.dim(t("newSessionHint"))}\n`);
					} else {
						io.stdout.write(`${c.red(t("cwdNotExist", target))}\n`);
					}
					continue;
				}
				case "model": {
					if (arg === "") {
						io.stdout.write(`${c.dim(t("currentModel"))} ${c.sky(settings.model)}${c.dim(`（${settings.provider}）`)}\n`);
						io.stdout.write(`${c.dim(t("modelUsage"))}\n`);
						continue;
					}
					if (arg === "list" || arg === "?") {
						try {
							const models = await llm.listModels(settings.provider);
							models.forEach((m) => io.stdout.write(`  ${c.white(m.name)}${c.dim(`  ${m.id}`)}\n`));
						} catch {
							io.stdout.write(`${c.red(t("modelListUnavailable"))}\n`);
						}
						continue;
					}
					settings.model = arg;
					saveSettings(settings);
					await rebuildAgent();
					io.stdout.write(`${c.green(t("modelSet", arg, ""))}${c.dim(t("newSessionHint"))}\n`);
					continue;
				}
				case "think": {
					const on = arg === "on" || arg === "1" || arg === "true";
					const off = arg === "off" || arg === "0" || arg === "false";
					if (on) settings.showReasoning = true;
					else if (off) settings.showReasoning = false;
					else settings.showReasoning = !settings.showReasoning;
					saveSettings(settings);
					io.stdout.write(`${c.green(t("thinkSet", settings.showReasoning ? t("on") : t("off")))}\n`);
					continue;
				}
				case "effort": {
					if (arg === "") {
						io.stdout.write(`${c.dim(t("currentEffort"))} ${c.white(effortName(settings.effort))}${c.dim(t("effortOptional"))}\n`);
						continue;
					}
					if (arg === "off" || arg === "high" || arg === "max") {
						settings.effort = arg;
						saveSettings(settings);
						await rebuildAgent();
						io.stdout.write(`${c.green(t("effortSet", effortName(arg)))}${c.dim(t("newSessionHint"))}\n`);
					} else {
						io.stdout.write(`${c.red(t("unknownEffort", arg))}${c.dim(t("effortOptional"))}\n`);
					}
					continue;
				}
				case "preset": {
					const presets = ctx.get("agentPresets");
					if (rest[0] === "new") {
						const name = (rest.slice(1).join("-") || (await ask(c.dim(t("presetNeedName") + " ")) ?? "").trim()).trim();
						if (name === "") {
							io.stdout.write(`${c.red(t("presetNeedName"))}\n`);
							continue;
						}
						if (presets === void 0 || typeof presets.copy !== "function") {
							io.stdout.write(`${c.red(t("presetNoService"))}\n`);
							continue;
						}
						try {
							await presets.copy("standard", name, name);
							io.stdout.write(`${c.green(t("presetCreated", `${customPresetDir()}\\${name}`))}\n`);
							io.stdout.write(`${c.dim(t("presetCreatedHint"))}\n`);
						} catch (err) {
							io.stdout.write(`${c.red(t("createFailed", err.message))}\n`);
						}
						continue;
					}
					if (arg === "") {
						io.stdout.write(`${c.dim(t("currentPreset"))} ${c.white(settings.preset)}\n`);
						io.stdout.write(`${c.dim(t("customPresetDirLabel", c.sky(customPresetDir())))}\n`);
						io.stdout.write(`${c.dim(t("presetTemplateHint"))}\n`);
						io.stdout.write(`${c.dim("示例结构（或 /preset new 复制 standard 起步）：")}\n`);
						io.stdout.write(`${c.dim("  my-agent/")}\n`);
						io.stdout.write(`${c.dim("  ├── agent.cordis.yml   # 自定义人设/工具")}\n`);
						io.stdout.write(`${c.dim("  └── preset.yml         # 可选：name/description")}\n`);
						const custom = listCustomPresets();
						if (custom.length > 0) {
							io.stdout.write(`${c.dim(t("customPresetsList", custom.map((p) => c.white(p)).join(", ")))}\n`);
						}
						if (presets !== void 0) {
							try {
								const list = await presets.list();
								io.stdout.write(`${c.dim(t("allPresets", list.map((p) => `${p.name ?? p.id}${c.dim(`(${p.id})`)}`).join(" / ")))}\n`);
							} catch {
								// ignore
							}
						}
						continue;
					}
					settings.preset = arg;
					saveSettings(settings);
					await rebuildAgent();
					io.stdout.write(`${c.green(t("presetSet", arg))}${c.dim(t("newSessionHint"))}\n`);
					continue;
				}
				case "lang":
				case "language": {
					if (arg === "") {
						io.stdout.write(`${c.dim(t("currentLang"))} ${c.white(langName(settings.language))}\n`);
						continue;
					}
					if (arg === "zh" || arg === "en") {
						settings.language = arg;
						t = makeT(settings.language);
						saveSettings(settings);
						io.stdout.write(`${c.green(t("langSet", langName(settings.language)))}\n`);
					} else {
						io.stdout.write(`${c.red(t("unknownLang", arg))}${c.dim(t("langOptional"))}\n`);
					}
					continue;
				}
				case "busy": {
					if (arg === "") {
						io.stdout.write(`${c.dim(t("currentBusy"))} ${c.white(busyName(settings.busyAction))}${c.dim(t("busyOptional"))}\n`);
						continue;
					}
					if (arg === "queue" || arg === "interrupt") {
						settings.busyAction = arg;
						saveSettings(settings);
						io.stdout.write(`${c.green(t("busySet", busyName(arg)))}\n`);
					} else {
						io.stdout.write(`${c.red(t("unknownBusy", arg))}${c.dim(t("busyOptional"))}\n`);
					}
					continue;
				}
				case "plugins": {
					const loader = ctx.get("loader");
					if (loader === void 0 || typeof loader.entries !== "function") {
						io.stdout.write(`${c.dim(t("pluginsUnavailable"))}\n`);
						continue;
					}
					const names = [...loader.entries()].map((e) => e.options.name).filter(Boolean);
					io.stdout.write(`${c.dim(t("loadedPlugins", names.length))}\n`);
					names.forEach((n) => io.stdout.write(`  ${c.white(n)}\n`));
					continue;
				}
				case "skills": {
					if (rest[0] === "new") {
						const name = (rest.slice(1).join("-") || (await ask(c.dim(t("skillNeedName") + " ")) ?? "").trim()).trim();
						if (name === "") {
							io.stdout.write(`${c.red(t("skillNeedName"))}\n`);
							continue;
						}
						const result = createSkillTemplate(name);
						if (result.ok) {
							io.stdout.write(`${c.green(t("skillCreated", result.path))}\n`);
							io.stdout.write(`${c.dim(t("skillCreatedHint"))}\n`);
						} else {
							io.stdout.write(`${c.red(`✗ ${result.message}`)}\n`);
						}
						continue;
					}
					const skills = ctx.get("skills");
					io.stdout.write(`${c.dim(t("customSkillDirLabel", c.sky(customSkillDir())))}\n`);
					io.stdout.write(`${c.dim(t("skillTemplateHint"))}\n`);
					io.stdout.write(`${c.dim("示例结构：")}\n`);
					io.stdout.write(`${c.dim("  my-skill/")}\n`);
					io.stdout.write(`${c.dim("  └── SKILL.md")}\n`);
					io.stdout.write(`${c.dim("      ---")}\n`);
					io.stdout.write(`${c.dim("      name: my-skill")}\n`);
					io.stdout.write(`${c.dim("      description: 一句话描述这个 skill")}\n`);
					io.stdout.write(`${c.dim("      ---")}\n`);
					io.stdout.write(`${c.dim("      在这里写 skill 的指令内容...")}\n`);
					if (skills === void 0) {
						io.stdout.write(`${c.dim(t("skillsUnavailable"))}\n`);
						continue;
					}
					try {
						const items = await skills.list({ cwd: settings.cwd });
						if (items.length === 0) {
							io.stdout.write(`${c.dim(t("noSkillsHint"))}\n`);
							continue;
						}
						io.stdout.write(`${c.dim(t("availableSkills", items.length))}\n`);
						items.forEach((s) => io.stdout.write(`  ${c.white(s.name)}${s.description ? c.dim(`  ${s.description}`) : ""}\n`));
					} catch {
						io.stdout.write(`${c.dim(t("skillsListUnavailable"))}\n`);
					}
					continue;
				}
				case "new": {
					await rebuildAgent();
					io.stdout.write(`${c.dim(t("newSessionLine"))}\n`);
					continue;
				}
				default:
					io.stdout.write(`${c.red(t("unknownCmd", cmd))}${c.dim(t("unknownCmdHint"))}\n`);
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
