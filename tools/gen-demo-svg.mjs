// Generate a terminal-window SVG demo for the README.
// Renders the captured deepseek output as a styled terminal window with a
// CSS-animated menu cursor (works on GitHub, no recording tools needed).
//
// Usage: node tools/gen-demo-svg.mjs   (reads capture.txt, writes demo.svg)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const captured = readFileSync(join(root, "capture.txt"), "utf8").replace(/^\uFEFF/, "").split("\n");

// Keep everything above the numbered-input menu; replace the menu itself with
// the arrow-key wizard look (nicer for the demo, and it shows the animated ❯).
const menuIdx = captured.findIndex((l) => l.includes("启动配置"));
const bannerRows = menuIdx >= 0 ? captured.slice(0, menuIdx) : captured;
while (bannerRows.length && bannerRows[bannerRows.length - 1].trim() === "") bannerRows.pop();

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
const lines = [...bannerRows, ...MENU];

const FONT = "Consolas, 'Courier New', monospace";
const FONT_SIZE = 11;
const CHAR_W = FONT_SIZE * 0.62; // approx advance width for monospace
const LINE_H = FONT_SIZE * 1.45;
const PAD_X = 22;
const PAD_Y = 42; // below the title bar
const BG = "#0d1117";
const FG = "#e6edf3";
const DIM = "#8b949e";
const BLUE = "#4d6bfe";
const CYAN = "#5ac8fa";
const GREEN = "#5fdcff".slice(0, 7) === "#5fdcff" ? "#5fdca0" : "#5fdca0";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Drop trailing empty lines; compute width by display columns (CJK=2).
const rows = [...lines];
while (rows.length && rows[rows.length - 1].trim() === "") rows.pop();
const displayWidth = (s) => {
	let w = 0;
	for (const ch of s) w += ch.charCodeAt(0) > 0x2e7f ? 2 : 1;
	return w;
};
const maxCols = Math.max(...rows.map(displayWidth));
const W = PAD_X * 2 + maxCols * CHAR_W;
const H = PAD_Y + rows.length * LINE_H + 18;

// Locate the wizard menu region for the animated cursor.
const menuStart = rows.findIndex((l) => l.includes("启动配置"));
const menuEnd = rows.findIndex((l) => l.includes("开始对话"));
const menuRows = menuEnd >= menuStart && menuStart >= 0 ? menuEnd - menuStart - 1 : 3;
const cursorStartY = PAD_Y + (menuStart + 1) * LINE_H - LINE_H / 2;
const cursorStep = LINE_H;
const cursorTravel = Math.max(1, menuRows - 1) * cursorStep;

const texts = rows
	.map((line, i) => {
		const y = PAD_Y + i * LINE_H;
		const cls = line.trim().startsWith("│") || line.trim().startsWith("┌") || line.trim().startsWith("└")
			? "dim"
			: line.includes("▶")
				? "green"
				: line.includes("DeepSeek Harness")
					? "sky"
					: "";
		const clsAttr = cls ? ` class="${cls}"` : "";
		return `<text x="${PAD_X}" y="${y}"${clsAttr}>${esc(line)}</text>`;
	})
	.join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W)}" height="${Math.round(H)}" viewBox="0 0 ${Math.round(W)} ${Math.round(H)}" font-family="${FONT}" font-size="${FONT_SIZE}">
  <defs>
    <style>
      text { fill: ${FG}; }
      text.dim { fill: ${DIM}; }
      text.sky { fill: #8ab4ff; }
      text.green { fill: ${GREEN}; }
      .cursor {
        fill: ${CYAN};
        animation: nav 1.6s ease-in-out infinite alternate;
      }
      .blink {
        fill: ${FG};
        animation: blink 1.1s step-end infinite;
      }
      @keyframes nav {
        from { transform: translateY(0); }
        to   { transform: translateY(${cursorTravel}px); }
      }
      @keyframes blink {
        0%, 49%  { opacity: 1; }
        50%, 100% { opacity: 0; }
      }
      .dot { opacity: 0.9; }
    </style>
  </defs>

  <!-- window frame -->
  <rect x="2" y="2" width="${Math.round(W - 4)}" height="${Math.round(H - 4)}" rx="10" fill="${BG}" stroke="#30363d" stroke-width="1.5"/>

  <!-- title bar -->
  <circle cx="${PAD_X + 6}" cy="16" r="5" fill="#ff5f56" class="dot"/>
  <circle cx="${PAD_X + 22}" cy="16" r="5" fill="#ffbd2e" class="dot"/>
  <circle cx="${PAD_X + 38}" cy="16" r="5" fill="#27c93f" class="dot"/>
  <text x="${PAD_X + 52}" y="20" class="dim" font-size="10">deepseek — DeepSeek CLI</text>

  <!-- content -->
  ${texts}

  <!-- animated menu cursor -->
  <text x="${PAD_X}" y="${Math.round(cursorStartY)}" class="cursor" font-weight="bold">❯</text>

  <!-- blinking input cursor next to the prompt -->
  <rect x="${PAD_X + 2 * CHAR_W}" y="${PAD_Y + rows.length * LINE_H - LINE_H + 2}" width="${Math.round(CHAR_W)}" height="${Math.round(FONT_SIZE)}" class="blink"/>
</svg>
`;

writeFileSync(join(root, "demo.svg"), svg, "utf8");
console.log(`demo.svg written: ${Math.round(W)}x${Math.round(H)}, ${rows.length} rows, ${maxCols} cols`);
