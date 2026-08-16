# 兼容性测试报告

> DeepSeek CLI **v1.1.0** — 全系统兼容性测试
> 日期：2026-08

## 测试环境

| 项目 | 值 |
|---|---|
| 实测系统 | Windows 11 专业版（Build 26200） |
| Node.js | v22.23.2 |
| npm | 10.9.8 |
| 模拟环境 | Git Bash 5.2（bash 脚本 / 安装流程 / Unix 路径验证） |
| 静态审查 | macOS（bash 3.2 兼容性）、Linux 发行版差异 |

---

## 一、Windows 11 — ✅ 实测通过

| # | 测试项 | 结果 |
|---|---|---|
| 1 | 启动横幅（鲸鱼 logo + v1.1.0） | ✅ |
| 2 | 首次使用 API Key 引导（隐藏输入） | ✅ |
| 3 | 数字配置菜单（7 项 + 高级设置 8 项） | ✅ |
| 4 | VT 方向键菜单（↑↓ 导航 / 子菜单 / 数字快捷） | ✅ |
| 5 | 配置项生效（权限 / 工作目录 / 模型 / 思考强度 / 预设 / 语言 / 繁忙） | ✅ |
| 6 | 对话（流式输出 / 上下文记忆 / 多行粘贴合并） | ✅ |
| 7 | 中断（回答中 Ctrl+C / 输入即打断） | ✅ |
| 8 | 退出（/exit / Ctrl+C / ESC / 管道 EOF） | ✅ |
| 9 | 命令（/mode /cd /model /effort /preset /lang /busy /plugins /skills /new） | ✅ |
| 10 | 中英文界面切换（实时生效） | ✅ |
| 11 | 自定义 Skill / 自定义预设（目录 + 模板创建） | ✅ |
| 12 | 配置持久化（cli-settings.json，含 BOM 兼容） | ✅ |

> 兼容性说明：Windows 10（1809+）与 11 均支持 ANSI 终端控制（Node 自动启用 VT），
> 经典 conhost 不支持方向键重绘时自动降级为数字菜单（已内置探测）。

---

## 二、Linux — ✅ 脚本验证 + 静态审查通过

**Git Bash 模拟验证（bash 5.2）：**

| # | 测试项 | 结果 |
|---|---|---|
| 1 | `bash -n bin/deepseek` 语法 | ✅ |
| 2 | `bash -n install.sh` 语法 | ✅ |
| 3 | 模拟安装（`cp -r profiles/cli → $DSH_HOME/profiles/cli`） | ✅ Unix 路径 `/tmp/.../.dsh/profiles/cli` |
| 4 | 环境变量解析（`DSH_HOME` / `$HOME/.dsh`） | ✅ |

**静态审查：**

- 核心 `cli-runner/index.js` 使用 Node 跨平台 API（readline / fs / path / os）
- 路径统一 `path.join`（无硬编码 `\`）——已全量检查（残留 0）
- 无 `process.platform` 分支、无 Windows 专用调用
- 配置/会话都在 `$DSH_HOME`（Linux 默认 `~/.dsh`）
- ANSI 控制是 Linux 终端原生能力（比 Windows 支持更完整）
- 依赖：DeepSeek Harness 官方 npm 包，Linux x64/arm64 均有预编译

**Linux 安装**：`npm i -g @deepseek-ai/dsh` → `git clone` → `./install.sh` → `deepseek`

> 已知：真机运行需在 Linux 上安装 DeepSeek Harness（npm 官方支持），本报告为
> bash 脚本 + 代码路径验证；若你的发行版遇到问题，按现象反馈即可定位。

---

## 三、macOS — ✅ 静态审查通过

| 检查项 | 结果 |
|---|---|
| bash 脚本（`bin/deepseek`、`install.sh`）无 bash 4+ 特性 | ✅（`${VAR:-x}`、`$(...)`、`exec "$@"` 均为 bash 3.2 支持） |
| Node.js 跨平台 API | ✅ |
| `path.join` / `$DSH_HOME`（默认 `~/.dsh`） | ✅ |
| 依赖预编译 | ✅（darwin-x64 / darwin-arm64） |
| 中文字体 | ✅（系统 PingFang SC） |

> 已知：macOS 上若 `install.sh` 无写入 `/usr/local/bin` 权限会提示手动安装（已内置判断）。

---

## 四、已知注意事项

1. **经典 cmd（conhost）**：不支持 ANSI 光标重绘 → 自动降级数字菜单（正常行为，非 bug）
2. **中文字体**：终端需有 CJK 字体（Windows 微软雅黑 / macOS PingFang / Linux Noto Sans CJK）
3. **API Key 安全**：`.gitignore` 排除凭据文件，跨平台一致
4. **WSL**：支持（走 Linux 路径，`bin/deepseek` + `install.sh`）

---

## 结论

| 平台 | 状态 |
|---|---|
| Windows 11 | ✅ 实测通过 |
| Windows 10 | ✅ 预期通过（ANSI/VT 机制一致，代码审查确认） |
| Linux（各发行版） | ✅ 脚本 + 静态验证通过（npm 官方支持） |
| macOS | ✅ 静态审查通过 |

**代码本身无平台分支**，核心差异仅在启动命令（`.cmd`/`.ps1`/bash）和终端能力，
均已覆盖。
