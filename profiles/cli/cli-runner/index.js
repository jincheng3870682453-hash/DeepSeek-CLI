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
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import z from "@deepseek-ai/schemastery";
import { installModelSelection } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";

/** Stable Cordis plugin name. */
const name = "cli-runner";
/** The CLI's own semantic version, shown in the banner and README. */
const VERSION = "1.1.0";
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

/** UI strings for the two supported languages. Values may use {0}/{1} placeholders. */
const I18N = {
	zh: {
		bannerSub: "DeepSeek Harness · 交互式命令行 · v{0}",
		bannerHint: "输入消息直接对话 ·  /config 配置 ·  /help 帮助 ·  /exit 退出",
		menuTitle: "启动配置",
		menuMode: "权限模式",
		menuCwd: "工作目录",
		menuModel: "模型",
		menuThink: "显示思考过程",
		menuKey: "API Key",
		menuAdvanced: "⚙ 高级设置",
		menuStart: "▶ 开始对话",
		advTitle: "高级设置",
		advEffort: "思考强度",
		advPreset: "Agent 预设",
		advLang: "语言",
		advBusy: "繁忙时行为",
		advPlugins: "插件列表（只读）",
		advSkills: "Skill 列表（只读）",
		advCustomSkill: "自定义 Skill（目录 / 新建）",
		advCustomPreset: "自定义 Agent 预设（目录 / 新建）",
		navHint: "↑↓ 选择 · Enter 确认 · 数字直接选 · q 返回",
		curLabel: "当前",
		on: "开",
		off: "关",
		configured: "已配置",
		notConfigured: "未配置",
		none: "（无）",
		vtFallback: "（当前终端未响应光标控制，已使用数字输入菜单；推荐 Windows Terminal / VS Code 体验方向键）",
		firstRun: "首次使用：需要先配置 API Key 才能对话",
		askKey: "请输入 DeepSeek API Key（sk-...）：",
		askKeyEsc: "请输入 DeepSeek API Key（sk-...，ESC 取消）：",
		askKeyEnter: "请输入 DeepSeek API Key（sk-...，直接回车取消）：",
		keySaved: "✓ API Key 已保存（{0}）",
		keyBad: "✗ Key 格式不正确（应以 sk- 开头）",
		keyBadHint: "，可重跑 dsh-chat 重新配置",
		keySkipped: "已跳过；之后可用 /config 重新配置",
		cancelled: "已取消",
		effortOff: "关闭",
		effortHigh: "深度思考",
		effortMax: "极致思考",
		effortOffDesc: "快速响应（不思考）",
		effortHighDesc: "high（默认，质量更好）",
		effortMaxDesc: "max（最强但最慢）",
		effortTitle: "思考强度",
		effortSet: "✓ 思考强度：{0}",
		presetTitle: "Agent 预设",
		presetDefault: "standard（默认）",
		presetBroken: "（损坏：{0}）",
		presetSet: "✓ Agent 预设：{0}",
		langTitle: "语言 / Language",
		langSet: "✓ 语言：{0}",
		busyTitle: "繁忙时行为（AI 回答中发消息）",
		busyQueue: "排队发送",
		busyQueueDesc: "回答完成后依次处理",
		busyInterrupt: "打断当前回答",
		busyInterruptDesc: "立即中断并处理新消息",
		busySet: "✓ 繁忙时行为：{0}",
		customSkillDirLabel: "自定义 Skill 目录：{0}",
		customSkillFormat: "格式：<名称>/SKILL.md（frontmatter 含 name 和 description）",
		customSkillHas: "已有：{0}  命令：/skills new <名称>",
		customSkillAsk: "直接回车返回，或输入名称新建：",
		customSkillCreated: "✓ 已创建：{0}\\SKILL.md",
		customSkillCreatedHint: "  编辑后 /skills 可见",
		customPresetDirLabel: "自定义预设目录：{0}",
		customPresetFormat: "格式：<id>/agent.cordis.yml（可从现有预设复制修改）",
		customPresetHas: "已有：{0}  命令：/preset new <名称>",
		customPresetAsk: "直接回车返回，或输入名称新建（复制 standard）：",
		customPresetCreated: "✓ 已创建：{0}\\agent.cordis.yml",
		customPresetCreatedHint: "  编辑后 /preset 可选",
		createFailed: "✗ 创建失败：{0}",
		presetUnavailable: "✗ 预设服务不可用",
		modeTitle: "是否允许工作区之外的操作？",
		modeSet: "✓ 权限模式：{0}",
		cwdTitle: "工作目录（是否在此目录工作？）",
		cwdUseCurrent: "使用当前目录：{0}",
		cwdInput: "✎ 输入新路径…",
		cwdInputPrompt: "输入路径（支持 ~）：",
		cwdSet: "✓ 工作目录：{0}",
		cwdNotExist: "✗ 目录不存在：{0}",
		modelTitle: "模型",
		modelListUnavailable: "模型列表不可用",
		modelSet: "✓ 模型：{0} ({1})",
		thinkSet: "✓ 显示思考过程：{0}",
		wizardPrompt: "选择 1-7，回车直接开始对话：",
		selectNum: "选择编号：",
		newSessionHint: "（已开启新会话）",
		newSessionLine: "—— 已开启新会话 ——",
		interrupted: "（已中断）",
		unknownCmd: "未知命令：/{0}",
		unknownCmdHint: "（输入 /help 查看命令列表）",
		currentMode: "当前权限模式",
		modeOptional: "可选：{0}",
		unknownMode: "✗ 未知模式：{0}",
		currentCwd: "当前工作目录",
		cdUsage: "用法：/cd <路径>",
		currentModel: "当前模型",
		modelUsage: "用法：/model <模型id>，或 /model list 查看列表",
		currentEffort: "当前思考强度",
		effortOptional: "（可选：off / high / max）",
		unknownEffort: "✗ 未知强度：{0}",
		presetNeedName: "✗ 需要名称，如：/preset new 我的助手",
		presetNoService: "✗ 预设服务不可用（无法自动创建）",
		presetCreated: "✓ 预设已创建（复制自 standard）：{0}\\agent.cordis.yml",
		presetCreatedHint: "编辑后 /preset 立即可选，创建会话时生效",
		currentPreset: "当前 Agent 预设",
		presetTemplateHint: "创建模板：/preset new <名称>",
		customPresetsList: "已有自定义预设：{0}",
		allPresets: "全部预设：{0}",
		currentLang: "当前语言",
		unknownLang: "✗ 未知语言：{0}",
		langOptional: "（可选：zh / en）",
		currentBusy: "繁忙时行为",
		busyOptional: "（可选：queue / interrupt）",
		unknownBusy: "✗ 未知：{0}",
		pluginsUnavailable: "插件列表不可用",
		loadedPlugins: "已加载插件（{0}）：",
		skillNeedName: "✗ 需要名称，如：/skills new 我的助手",
		skillCreated: "✓ Skill 模板已创建：{0}\\SKILL.md",
		skillCreatedHint: "编辑后 /skills 立即可见，模型可调用",
		skillTemplateHint: "创建模板：/skills new <名称>",
		skillsUnavailable: "Skill 服务不可用",
		noSkillsHint: "没有可用 Skill（放一个到上面目录试试）",
		availableSkills: "可用 Skill（{0}）：",
		skillsListUnavailable: "Skill 列表不可用",
		noSkills: "没有可用 Skill",
		availableSkillsColon: "可用 Skill：",
		toolName: "工具",
		advancedTitle: "高级设置：",
		help: `\n${"─".repeat(46)}\n  /config  打开配置向导      /mode   切换权限模式\n  /cd      切换工作目录      /model  切换模型\n  /think   显示思考过程      /effort 思考强度\n  /preset  Agent 预设        /lang   语言\n  /busy    繁忙时行为        /plugins 插件列表\n  /skills  Skill 列表        /new    开启新会话\n  /exit    退出（Ctrl+C 也可）\n${"─".repeat(46)}\n  直接输入任意文字即可对话 · 同一会话会记住上下文\n`
	},
	en: {
		bannerSub: "DeepSeek Harness · Interactive CLI · v{0}",
		bannerHint: "Type to chat ·  /config ·  /help ·  /exit",
		menuTitle: "Startup Config",
		menuMode: "Permission",
		menuCwd: "Working Dir",
		menuModel: "Model",
		menuThink: "Show Reasoning",
		menuKey: "API Key",
		menuAdvanced: "⚙ Advanced",
		menuStart: "▶ Start Chat",
		advTitle: "Advanced",
		advEffort: "Reasoning Effort",
		advPreset: "Agent Preset",
		advLang: "Language",
		advBusy: "When Busy",
		advPlugins: "Plugins (read-only)",
		advSkills: "Skills (read-only)",
		advCustomSkill: "Custom Skills (dir / new)",
		advCustomPreset: "Custom Agent Presets (dir / new)",
		navHint: "↑↓ select · Enter confirm · digits direct · q back",
		curLabel: "current",
		on: "on",
		off: "off",
		configured: "configured",
		notConfigured: "not set",
		none: "—",
		vtFallback: "(Terminal did not respond to cursor control; using numbered input. Try Windows Terminal / VS Code for arrow keys)",
		firstRun: "First run: configure your API Key to start chatting",
		askKey: "Enter DeepSeek API Key (sk-...): ",
		askKeyEsc: "Enter DeepSeek API Key (sk-...; ESC cancels): ",
		askKeyEnter: "Enter DeepSeek API Key (sk-...; Enter cancels): ",
		keySaved: "✓ API Key saved ({0})",
		keyBad: "✗ Invalid key format (should start with sk-)",
		keyBadHint: "; rerun deepseek to reconfigure",
		keySkipped: "Skipped; reconfigure later with /config",
		cancelled: "Cancelled",
		effortOff: "Off",
		effortHigh: "Deep",
		effortMax: "Max",
		effortOffDesc: "Fast response (no thinking)",
		effortHighDesc: "high (default, better quality)",
		effortMaxDesc: "max (strongest, slowest)",
		effortTitle: "Reasoning Effort",
		effortSet: "✓ Reasoning effort: {0}",
		presetTitle: "Agent Preset",
		presetDefault: "standard (default)",
		presetBroken: "(broken: {0})",
		presetSet: "✓ Agent preset: {0}",
		langTitle: "Language",
		langSet: "✓ Language: {0}",
		busyTitle: "When Busy (message while AI is replying)",
		busyQueue: "Queue",
		busyQueueDesc: "Process after the reply finishes",
		busyInterrupt: "Interrupt",
		busyInterruptDesc: "Stop the reply now and handle the new message",
		busySet: "✓ When busy: {0}",
		customSkillDirLabel: "Custom skill dir: {0}",
		customSkillFormat: "Format: <name>/SKILL.md (frontmatter with name and description)",
		customSkillHas: "Existing: {0}   command: /skills new <name>",
		customSkillAsk: "Enter to go back, or type a name to create: ",
		customSkillCreated: "✓ Created: {0}\\SKILL.md",
		customSkillCreatedHint: "   visible in /skills after editing",
		customPresetDirLabel: "Custom preset dir: {0}",
		customPresetFormat: "Format: <id>/agent.cordis.yml (copy an existing preset to start)",
		customPresetHas: "Existing: {0}   command: /preset new <name>",
		customPresetAsk: "Enter to go back, or type a name to create (copies standard): ",
		customPresetCreated: "✓ Created: {0}\\agent.cordis.yml",
		customPresetCreatedHint: "   selectable in /preset after editing",
		createFailed: "✗ Create failed: {0}",
		presetUnavailable: "✗ Preset service unavailable",
		modeTitle: "Allow operations outside the workspace?",
		modeSet: "✓ Permission mode: {0}",
		cwdTitle: "Working directory (work here?)",
		cwdUseCurrent: "Use current dir: {0}",
		cwdInput: "✎ Enter a new path…",
		cwdInputPrompt: "Enter path (supports ~): ",
		cwdSet: "✓ Working directory: {0}",
		cwdNotExist: "✗ Directory not found: {0}",
		modelTitle: "Model",
		modelListUnavailable: "Model list unavailable",
		modelSet: "✓ Model: {0} ({1})",
		thinkSet: "✓ Show reasoning: {0}",
		wizardPrompt: "Pick 1-7, Enter to start: ",
		selectNum: "Pick a number: ",
		newSessionHint: " (new session started)",
		newSessionLine: "—— new session started ——",
		interrupted: "(interrupted)",
		unknownCmd: "Unknown command: /{0}",
		unknownCmdHint: " (type /help for commands)",
		currentMode: "Current permission",
		modeOptional: "Options: {0}",
		unknownMode: "✗ Unknown mode: {0}",
		currentCwd: "Current working directory",
		cdUsage: "Usage: /cd <path>",
		currentModel: "Current model",
		modelUsage: "Usage: /model <id>, or /model list",
		currentEffort: "Current reasoning effort",
		effortOptional: " (options: off / high / max)",
		unknownEffort: "✗ Unknown effort: {0}",
		presetNeedName: "✗ A name is required, e.g. /preset new my-agent",
		presetNoService: "✗ Preset service unavailable (cannot auto-create)",
		presetCreated: "✓ Preset created (copied from standard): {0}\\agent.cordis.yml",
		presetCreatedHint: " selectable in /preset immediately; applies to new sessions",
		currentPreset: "Current agent preset",
		presetTemplateHint: "Create a template: /preset new <name>",
		customPresetsList: "Existing custom presets: {0}",
		allPresets: "All presets: {0}",
		currentLang: "Current language",
		unknownLang: "✗ Unknown language: {0}",
		langOptional: " (options: zh / en)",
		currentBusy: "When busy",
		busyOptional: " (options: queue / interrupt)",
		unknownBusy: "✗ Unknown: {0}",
		pluginsUnavailable: "Plugin list unavailable",
		loadedPlugins: "Loaded plugins ({0}):",
		skillNeedName: "✗ A name is required, e.g. /skills new my-skill",
		skillCreated: "✓ Skill template created: {0}\\SKILL.md",
		skillCreatedHint: " visible in /skills after editing; model can invoke it",
		skillTemplateHint: "Create a template: /skills new <name>",
		skillsUnavailable: "Skills service unavailable",
		noSkillsHint: "No skills available (drop one into the dir above)",
		availableSkills: "Available skills ({0}):",
		skillsListUnavailable: "Skills list unavailable",
		noSkills: "No skills available",
		availableSkillsColon: "Available skills:",
		toolName: "tool",
		advancedTitle: "Advanced:",
		help: `\n${"─".repeat(46)}\n  /config  open config wizard    /mode   switch permission\n  /cd      switch working dir   /model  switch model\n  /think   show reasoning       /effort reasoning effort\n  /preset  agent preset         /lang   language\n  /busy    when-busy behavior   /plugins plugin list\n  /skills  skill list           /new    new session\n  /exit    quit (Ctrl+C too)\n${"─".repeat(46)}\n  Type any text to chat · context is kept within a session\n`
	}
};

function makeT(language) {
	const dict = I18N[language] ?? I18N.zh;
	return (key, ...args) => {
		let s = dict[key] ?? I18N.zh[key] ?? key;
		args.forEach((a, i) => {
			s = s.split(`{${i}}`).join(String(a));
		});
		return s;
	};
}

/** Localized labels for the permission presets (internal values stay English). */
const MODE_LABELS = {
	"read-only": { zh: "只读", en: "Read-only", zhDesc: "只能读取，不能修改文件", enDesc: "Read only, no file changes" },
	"workspace-write": { zh: "工作区写入", en: "Workspace Write", zhDesc: "可读写工作区内文件，更大范围操作需确认", enDesc: "Read/write inside the workspace; wider actions ask first" },
	"danger-full-access": { zh: "完全访问", en: "Full Access", zhDesc: "全权限操作，不再询问", enDesc: "Full access, no prompts" }
};

/** Settings persistence under $DSH_HOME (the CLI owns its own store; web-only services are not present here). */
function settingsPath() {
	const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
	return join(home, "cli-settings.json");
}

function loadSettings() {
	try {
		// Strip a possible UTF-8 BOM (PowerShell Out-File writes one, which
		// would make JSON.parse throw and silently reset every setting).
		const raw = readFileSync(settingsPath(), "utf8").replace(/^\uFEFF/, "");
		const parsed = JSON.parse(raw);
		return {
			mode: typeof parsed.mode === "string" ? parsed.mode : "workspace-write",
			cwd: typeof parsed.cwd === "string" && existsSync(parsed.cwd) ? parsed.cwd : process.cwd(),
			provider: typeof parsed.provider === "string" ? parsed.provider : "deepseek-official",
			model: typeof parsed.model === "string" ? parsed.model : "deepseek-v4-flash",
			showReasoning: parsed.showReasoning === true,
			effort: typeof parsed.effort === "string" ? parsed.effort : "high",
			preset: typeof parsed.preset === "string" ? parsed.preset : "standard",
			language: typeof parsed.language === "string" ? parsed.language : "zh",
			busyAction: typeof parsed.busyAction === "string" ? parsed.busyAction : "queue",
			cwdHistory: Array.isArray(parsed.cwdHistory) ? parsed.cwdHistory.filter((p) => typeof p === "string" && existsSync(p)).slice(0, 10) : []
		};
	} catch {
		return { mode: "workspace-write", cwd: process.cwd(), provider: "deepseek-official", model: "deepseek-v4-flash", showReasoning: false, effort: "high", preset: "standard", language: "zh", busyAction: "queue", cwdHistory: [] };
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

/** $DSH_HOME (or its default). */
function dshHome() {
	return process.env.DSH_HOME ?? join(homedir(), ".dsh");
}

/** Directory where the user can drop custom skills (<name>/SKILL.md). */
function customSkillDir() {
	return join(dshHome(), "skills");
}

/** Directory where the user can drop custom agent presets (<id>/agent.cordis.yml). */
function customPresetDir() {
	return join(dshHome(), ".agent-presets");
}

/** Create a minimal SKILL.md template under the user skill root. */
function createSkillTemplate(name) {
	const dir = join(customSkillDir(), name);
	if (existsSync(dir)) return { ok: false, message: `已存在：${dir}` };
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "SKILL.md"), `---
name: ${name}
description: 描述这个 skill 的用途（一行）
---
在这里编写 skill 的指令内容。模型调用此 skill 时会看到这里的内容。

## 用法

- 步骤一
- 步骤二
`, "utf8");
	return { ok: true, path: dir };
}

/** List user-authored preset ids (directories holding agent.cordis.yml). */
function listCustomPresets() {
	try {
		const root = customPresetDir();
		if (!existsSync(root)) return [];
		return readdirSync(root).filter((child) => {
			try {
				return statSync(join(root, child, "agent.cordis.yml")).isFile();
			} catch {
				return false;
			}
		});
	} catch {
		return [];
	}
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

/** Pad a string to a display width with spaces (CJK-aware, unlike padEnd).
 * Always leaves at least one gap so a label and its value never touch. */
function padCjk(text, width) {
	return text + " ".repeat(Math.max(1, width - displayWidth(text)));
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
		lines.push(c.dim(t("navHint")));
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
				const mainPick = await pickFromMenu(t("menuTitle"), [
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
					const advPick = await pickFromMenu(t("advTitle"), [
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
						const effPick = await pickFromMenu(t("effortTitle"), [
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
						const presetPick = await pickFromMenu(t("presetTitle"), items);
						if (presetPick === null) continue;
						settings.preset = presetPick.value;
						saveSettings(settings);
						await rebuildAgent();
						io.stdout.write(`${c.green(t("presetSet", settings.preset))}${c.dim(t("newSessionHint"))}\n`);
					} else if (advPick.value === "language") {
						const langPick = await pickFromMenu(t("langTitle"), [
							{ label: "中文（简体）", value: "zh" },
							{ label: "English", value: "en" }
						]);
						if (langPick === null) continue;
						settings.language = langPick.value;
						t = makeT(settings.language);
						saveSettings(settings);
						io.stdout.write(`${c.green(t("langSet", langName(settings.language)))}\n`);
					} else if (advPick.value === "busy") {
						const busyPick = await pickFromMenu(t("busyTitle"), [
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
					const modePick = await pickFromMenu(t("modeTitle"), availableModes.map((m) => ({
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
					const cwdPick = await pickFromMenu(t("cwdTitle"), [
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
					const modelPick = await pickFromMenu(t("modelTitle"), models.map((m) => ({
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
			const toolName = toolNames.get(event.data.message?.source?.callId) ?? t("toolName");
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
				io.stdout.write(`${c.dim(t("interrupted"))}\n`);
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
