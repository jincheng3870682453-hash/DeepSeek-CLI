// Generate a terminal-window demo for the README.
// - demo.svg: inline styles (survives GitHub's SVG sanitizer) + SMIL animation
// - demo.png: static preview rendered via sharp (always displays on GitHub)
//
// Usage: node tools/gen-demo-svg.mjs   (reads capture.txt, writes demo.svg/png)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

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

const FONT = "Consolas, 'Microsoft YaHei', 'PingFang SC', monospace";
const FONT_SIZE = 11;
const CHAR_W = FONT_SIZE * 0.62;
const LINE_H = FONT_SIZE * 1.45;
const PAD_X = 22;
const PAD_Y = 42;
const BG = "#0d1117";
const FG = "#e6edf3";
const DIM = "#8b949e";
const SKY = "#8ab4ff";
const CYAN = "#5ac8fa";
const GREEN = "#5fdca0";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

const menuStart = rows.findIndex((l) => l.includes("启动配置"));
const menuEnd = rows.findIndex((l) => l.includes("开始对话"));
const menuRows = menuEnd >= menuStart && menuStart >= 0 ? menuEnd - menuStart - 1 : 3;
const cursorStartY = PAD_Y + (menuStart + 1) * LINE_H - LINE_H / 2;
const cursorTravel = Math.max(1, menuRows - 1) * LINE_H;

// Inline styles only — GitHub strips <style> from SVGs, which would leave every
// <text> black on the dark background (looks like a blob).
const texts = rows
	.map((line, i) => {
		const y = Math.round(PAD_Y + i * LINE_H);
		let fill = FG;
		const t = line.trim();
		if (t.startsWith("│") || t.startsWith("┌") || t.startsWith("└")) fill = DIM;
		else if (line.includes("▶")) fill = GREEN;
		else if (line.includes("DeepSeek Harness")) fill = SKY;
		return `<text x="${PAD_X}" y="${y}" fill="${fill}">${esc(line)}</text>`;
	})
	.join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W)}" height="${Math.round(H)}" viewBox="0 0 ${Math.round(W)} ${Math.round(H)}" font-family="${FONT}" font-size="${FONT_SIZE}">
  <rect x="2" y="2" width="${Math.round(W - 4)}" height="${Math.round(H - 4)}" rx="10" fill="${BG}" stroke="#30363d" stroke-width="1.5"/>

  <circle cx="${PAD_X + 6}" cy="16" r="5" fill="#ff5f56"/>
  <circle cx="${PAD_X + 22}" cy="16" r="5" fill="#ffbd2e"/>
  <circle cx="${PAD_X + 38}" cy="16" r="5" fill="#27c93f"/>
  <text x="${PAD_X + 52}" y="20" fill="${DIM}" font-size="10">deepseek — DeepSeek CLI</text>

  ${texts}

  <!-- animated menu cursor (SMIL: no <style>, survives GitHub sanitization) -->
  <text x="${PAD_X}" y="${Math.round(cursorStartY)}" fill="${CYAN}" font-weight="bold">
    ❯
    <animate attributeName="y" from="${Math.round(cursorStartY)}" to="${Math.round(cursorStartY + cursorTravel)}" dur="1.6s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1; 0.4 0 0.6 1" keyTimes="0;0.5;1" values="${Math.round(cursorStartY)};${Math.round(cursorStartY + cursorTravel)};${Math.round(cursorStartY)}"/>
  </text>

  <!-- blinking input cursor -->
  <rect x="${PAD_X + 2 * CHAR_W}" y="${PAD_Y + rows.length * LINE_H - LINE_H + 2}" width="${Math.round(CHAR_W)}" height="${Math.round(FONT_SIZE)}" fill="${FG}">
    <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.4;0.5;1" dur="1.1s" repeatCount="indefinite"/>
  </rect>
</svg>
`;

writeFileSync(join(root, "demo.svg"), svg, "utf8");
console.log(`demo.svg written: ${Math.round(W)}x${Math.round(H)}`);

// Render a static PNG so GitHub always shows the terminal window even when the
// animated SVG is not supported.
try {
	const require = createRequire(import.meta.url);
	const sharp = require("C:/Users/69215/.dsh/profiles/node_modules/sharp");
	await sharp(Buffer.from(svg)).png().toFile(join(root, "demo.png"));
	console.log("demo.png written");
} catch (err) {
	console.log(`demo.png skipped: ${err.message}`);
}
