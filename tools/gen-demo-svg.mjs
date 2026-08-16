// Generate a terminal-window demo for the README.
// Shows the startup config wizard (the interactive heart of the CLI) in a
// clean terminal window. Inline styles (GitHub strips <style>) + SMIL animation.
//
// Usage: node tools/gen-demo-svg.mjs   (writes demo.svg)

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// The scene: a terminal window showing the arrow-key config wizard.
const MENU = [
	"启动配置",
	" ❯ 权限模式      工作区写入",
	"   工作目录      C:\\Users\\69215\\Desktop",
	"   模型          DeepSeek-V4-Flash",
	"   显示思考过程  关",
	"   API Key      已配置",
	"   ▶ 开始对话",
	"↑↓ 选择 · Enter 确认 · 数字直接选 · q 返回"
];
const PROMPT = "❯ ";

const FONT = "Consolas, 'Microsoft YaHei', 'PingFang SC', monospace";
const FONT_SIZE = 14;
const CHAR_W = FONT_SIZE * 0.62;
const LINE_H = Math.round(FONT_SIZE * 1.5);
const PAD_X = 24;
const PAD_Y = 48;
const BG = "#0d1117";
const FG = "#e6edf3";
const DIM = "#8b949e";
const SKY = "#8ab4ff";
const CYAN = "#5ac8fa";
const GREEN = "#5fdca0";
const HILITE = "rgba(77,107,254,0.28)";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const displayWidth = (s) => {
	let w = 0;
	for (const ch of s) w += ch.charCodeAt(0) > 0x2e7f ? 2 : 1;
	return w;
};

const rows = [...MENU, PROMPT];
const maxCols = Math.max(...rows.map(displayWidth));
const W = PAD_X * 2 + maxCols * CHAR_W + 12;
const H = PAD_Y + rows.length * LINE_H + 16;

// Menu item rows start after the title line.
const menuTop = PAD_Y + 1 * LINE_H;          // first item ("权限模式") baseline
const itemCount = 6;                          // 权限/目录/模型/思考/APIKey/开始
const cursorY0 = menuTop;
const cursorTravel = (itemCount - 1) * LINE_H;

const texts = rows
	.map((line, i) => {
		const y = PAD_Y + i * LINE_H;
		let fill = FG;
		const t = line.trim();
		if (i === rows.length - 1) fill = CYAN;          // prompt
		else if (t.startsWith("↑↓")) fill = DIM;          // nav hint
		else if (line.includes("▶")) fill = GREEN;
		else if (i === 0) fill = FG;                       // title
		return `<text x="${PAD_X}" y="${y}" fill="${fill}">${esc(line)}</text>`;
	})
	.join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W)}" height="${Math.round(H)}" viewBox="0 0 ${Math.round(W)} ${Math.round(H)}" font-family="${FONT}" font-size="${FONT_SIZE}">
  <rect x="2" y="2" width="${Math.round(W - 4)}" height="${Math.round(H - 4)}" rx="12" fill="${BG}" stroke="#30363d" stroke-width="1.5"/>

  <circle cx="${PAD_X + 6}" cy="17" r="5.5" fill="#ff5f56"/>
  <circle cx="${PAD_X + 23}" cy="17" r="5.5" fill="#ffbd2e"/>
  <circle cx="${PAD_X + 40}" cy="17" r="5.5" fill="#27c93f"/>
  <text x="${PAD_X + 56}" y="22" fill="${DIM}" font-size="12">deepseek — DeepSeek CLI</text>

  <!-- selection highlight bar (animated) -->
  <rect x="${PAD_X - 8}" y="${Math.round(cursorY0 - FONT_SIZE + 2)}" width="${Math.round(maxCols * CHAR_W + 16)}" height="${Math.round(LINE_H)}" rx="4" fill="${HILITE}">
    <animate attributeName="y" from="${Math.round(cursorY0 - FONT_SIZE + 2)}" to="${Math.round(cursorY0 - FONT_SIZE + 2 + cursorTravel)}" dur="1.6s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1; 0.4 0 0.6 1" keyTimes="0;0.5;1" values="${Math.round(cursorY0 - FONT_SIZE + 2)};${Math.round(cursorY0 - FONT_SIZE + 2 + cursorTravel)};${Math.round(cursorY0 - FONT_SIZE + 2)}"/>
  </rect>

  <!-- menu cursor (animated) -->
  <text x="${PAD_X}" y="${Math.round(cursorY0)}" fill="${CYAN}" font-weight="bold">
    ❯
    <animate attributeName="y" from="${Math.round(cursorY0)}" to="${Math.round(cursorY0 + cursorTravel)}" dur="1.6s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1; 0.4 0 0.6 1" keyTimes="0;0.5;1" values="${Math.round(cursorY0)};${Math.round(cursorY0 + cursorTravel)};${Math.round(cursorY0)}"/>
  </text>

  ${texts}

  <!-- blinking input caret next to the prompt -->
  <rect x="${PAD_X + 2 * CHAR_W}" y="${PAD_Y + rows.length * LINE_H - LINE_H + 2}" width="${Math.round(CHAR_W)}" height="${Math.round(FONT_SIZE - 3)}" fill="${CYAN}">
    <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.4;0.5;1" dur="1.1s" repeatCount="indefinite"/>
  </rect>
</svg>
`;

writeFileSync(join(root, "demo.svg"), svg, "utf8");
console.log(`demo.svg written: ${Math.round(W)}x${Math.round(H)} (${rows.length} rows, ${maxCols} cols)`);
