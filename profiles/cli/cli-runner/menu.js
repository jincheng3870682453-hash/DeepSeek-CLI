// menu.js — arrow-key menu for the CLI: render + navigation state machine.
// The controller owns its own state and keypress handling, so the runner only
// forwards keys; everything is written through injected io / colors / strings.
// Because navigation is driven by onKey() (not by readline itself), the whole
// controller is unit-testable with a capture stdout and no-op colors.

/** DeepSeek brand palette (truecolor; safe on Windows Terminal / VS Code / Win10+ conhost). */
export const PALETTE = {
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

/** Color helpers — no-op when not a TTY. */
export function makePalette(tty) {
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

/**
 * Create one VT menu controller.
 * @param io - { stdin, stdout } process-facing effects (stdout needs .isTTY and .write).
 * @param c - color helpers (see makePalette).
 * @param t - i18n translator (menu hint line).
 * @param tty - whether the session is an interactive terminal.
 * @returns
 *   pick(title, options)   — open the menu; resolves to the picked option or null.
 *   close(picked)          — close the open menu, clearing its area.
 *   onKey(str, key)        — forward a keypress; returns true if the menu consumed it.
 *   isOpen()               — whether a menu is currently open.
 *   consumeLine(line)      — true once, right after Enter confirmed a choice (drops the
 *                            'line' event that readline emits for that Enter).
 */
export function createMenuController(io, c, t, tty, getCursorRow) {
	let title = "";
	let options = [];
	let cursor = 0;
	let resolve = null;
	let lines = 0;
	let swallow = false;
	/** 框打开时的绝对行号（DSR 查询）；null 则退回相对定位 */
	let anchorRow = null;

	const isOpen = () => resolve !== null;

	/** Drop exactly one 'line' event after Enter confirmed a choice. */
	const consumeLine = (line) => {
		if (!swallow || !tty || line === null) return false;
		swallow = false;
		return true;
	};

	const buildLines = () => {
		const out = [];
		if (title !== "") out.push(c.white(title));
		options.forEach((opt, i) => {
			const arrow = i === cursor ? c.cyan("❯") : c.dim(" ");
			out.push(` ${arrow} ${opt.label}`);
		});
		out.push(c.dim(t("navHint")));
		return out;
	};

	const clearArea = () => {
		if (lines <= 0) return;
		if (anchorRow !== null) {
			// 绝对定位：只清框占用的行，绝不误伤其他内容
			for (let i = 0; i < lines; i++) io.stdout.write(`\x1b[${anchorRow + i};1H\x1b[K`);
			io.stdout.write(`\x1b[${anchorRow};1H`);
			lines = 0;
			return;
		}
		// 相对定位兜底（无 VT 探测结果时）
		io.stdout.write(`\x1b[${lines}A\r`);
		for (let i = 0; i < lines; i++) io.stdout.write("\x1b[K\n");
		io.stdout.write(`\x1b[${lines}A\r`);
		// 顺带清掉框下方残留（readline 回显、退格擦除等可能留下的字符）
		io.stdout.write("\x1b[J");
		lines = 0;
	};

	const draw = () => {
		clearArea();
		const rendered = buildLines();
		lines = rendered.length;
		if (anchorRow !== null) {
			// 绝对定位重绘：逐行定位 + 清尾，框体固定在同一位置，不会漂移
			for (let i = 0; i < rendered.length; i++) {
				io.stdout.write(`\x1b[${anchorRow + i};1H\x1b[K${rendered[i]}`);
			}
			io.stdout.write(`\x1b[${anchorRow + rendered.length - 1};1H`);
		} else {
			for (const line of rendered) io.stdout.write(line + "\n");
		}
	};

	const close = (picked) => {
		const r = resolve;
		resolve = null;
		clearArea();
		if (r !== null) r(picked);
	};

	const pick = (titleText, opts) => new Promise(async (res) => {
		title = titleText;
		options = opts;
		cursor = 0;
		resolve = res;
		// 打开瞬间查询光标行号，把框钉在绝对位置（之后任何重绘都不依赖相对移动）
		anchorRow = getCursorRow ? await getCursorRow() : null;
		draw();
	});

	const onKey = (str, key) => {
		if (key === void 0 || resolve === null) return false;
		if (key.name === "up") {
			cursor = (cursor - 1 + options.length) % options.length;
			draw();
		} else if (key.name === "down") {
			cursor = (cursor + 1) % options.length;
			draw();
		} else if (key.name === "return" || key.name === "enter") {
			// Enter also emits a 'line' event right after; drop it so it
			// cannot be consumed as the next input.
			swallow = true;
			close(options[cursor] ?? null);
		} else if (key.name === "escape" || key.name === "q") {
			close(null);
		} else if (str !== void 0 && /^[1-9]$/.test(str)) {
			const idx = Number(str) - 1;
			if (options[idx] !== void 0) close(options[idx]);
		} else {
			// 未处理键（退格/Delete/普通字符等）：readline 可能已在框下方
			// 回显/擦除字符，重绘菜单框覆盖，保持框体完整（自愈）
			draw();
		}
		return true; // consume every key while a menu is open
	};

	return { pick, close, onKey, isOpen, consumeLine };
}
