// utils.js — pure helpers shared across the CLI runner: i18n dictionary,
// display-width / padding, path expansion, key masking, and the user-facing
// custom skill / preset directory helpers. No DSH services, no state.

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** The CLI's own semantic version, shown in the banner and README. */
export const VERSION = "1.3.1";

/** UI strings for the two supported languages. Values may use {0}/{1} placeholders. */
export const I18N = {
	zh: {
		bannerSub: "DeepSeek Harness · 交互式命令行 · v{0}",
		bannerHint: "输入消息直接对话 ·  /config 配置 ·  /help 帮助 ·  /exit 退出",
		starting: "正在启动引擎，请稍候...",
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
		customSkillCreated: "✓ 已创建：{0}",
		customSkillCreatedHint: "  编辑后 /skills 可见",
		customPresetDirLabel: "自定义预设目录：{0}",
		customPresetFormat: "格式：<id>/agent.cordis.yml（可从现有预设复制修改）",
		customPresetHas: "已有：{0}  命令：/preset new <名称>",
		customPresetAsk: "直接回车返回，或输入名称新建（复制 standard）：",
		customPresetCreated: "✓ 已创建：{0}",
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
		presetCreated: "✓ 预设已创建（复制自 standard）：{0}",
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
		skillCreated: "✓ Skill 模板已创建：{0}",
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
		starting: "Starting engine, please wait...",
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
		customSkillCreated: "✓ Created: {0}",
		customSkillCreatedHint: "   visible in /skills after editing",
		customPresetDirLabel: "Custom preset dir: {0}",
		customPresetFormat: "Format: <id>/agent.cordis.yml (copy an existing preset to start)",
		customPresetHas: "Existing: {0}   command: /preset new <name>",
		customPresetAsk: "Enter to go back, or type a name to create (copies standard): ",
		customPresetCreated: "✓ Created: {0}",
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
		presetCreated: "✓ Preset created (copied from standard): {0}",
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
		skillCreated: "✓ Skill template created: {0}",
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

/** Build a t() translator for one language; supports {0}/{1} placeholders. */
export function makeT(language) {
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
export const MODE_LABELS = {
	"read-only": { zh: "只读", en: "Read-only", zhDesc: "只能读取，不能修改文件", enDesc: "Read only, no file changes" },
	"workspace-write": { zh: "工作区写入", en: "Workspace Write", zhDesc: "可读写工作区内文件，更大范围操作需确认", enDesc: "Read/write inside the workspace; wider actions ask first" },
	"danger-full-access": { zh: "完全访问", en: "Full Access", zhDesc: "全权限操作，不再询问", enDesc: "Full access, no prompts" }
};

/** Terminal display width of a string (CJK/wide chars count as 2 columns). */
export function displayWidth(text) {
	let w = 0;
	for (const ch of text) w += ch.charCodeAt(0) > 0x2e7f ? 2 : 1;
	return w;
}

/** Pad a string to a display width with spaces (CJK-aware). Always leaves ≥1 gap. */
export function padCjk(text, width) {
	return text + " ".repeat(Math.max(1, width - displayWidth(text)));
}

/** Expand a user-entered directory path ("~" and "~/" supported). */
export function expandPath(input) {
	let p = input.trim();
	if (p === "~") p = homedir();
	else if (p.startsWith("~/") || p.startsWith("~\\")) p = join(homedir(), p.slice(2));
	return resolve(p);
}

export function isDirectory(p) {
	try {
		return statSync(p).isDirectory();
	} catch {
		return false;
	}
}

/** Short masked preview of a key for display ("sk-…abcd"). */
export function maskKey(key) {
	if (key.length <= 8) return "*".repeat(key.length);
	return `${key.slice(0, 3)}${"*".repeat(6)}${key.slice(-4)}`;
}

/** $DSH_HOME (or its default). */
export function dshHome() {
	return process.env.DSH_HOME ?? join(homedir(), ".dsh");
}

/** Directory where the user can drop custom skills (<name>/SKILL.md). */
export function customSkillDir() {
	return join(dshHome(), "skills");
}

/** Directory where the user can drop custom agent presets (<id>/agent.cordis.yml). */
export function customPresetDir() {
	return join(dshHome(), ".agent-presets");
}

/** Create a minimal SKILL.md template under the user skill root. */
export function createSkillTemplate(name) {
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
export function listCustomPresets() {
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
