# DeepSeek CLI — 命令行里的 DeepSeek Agent

在 **cmd / PowerShell / Windows Terminal** 中直接与 DeepSeek Agent 对话。
基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 `cli` profile
（交互式 runner 插件），提供 Codex / Claude Code 风格的终端体验。

## 功能特性

- 🐋 **品牌启动画面**：DeepSeek 大鲸鱼 logo（从官方 favicon 渲染）+ DEEPSEEK 大字
- 🎮 **方向键配置向导**：↑↓ 导航菜单（自动探测终端能力，不支持时降级为数字输入）
- 🔑 **首次使用引导**：自动检测并引导配置 API Key（隐藏输入，回显星号）
- 🛡️ **权限模式**：只读 / 工作区写入 / 完全访问（实时切换，与网页版同一机制）
- 📂 **工作目录**：当前目录 / 历史记录 / 自定义路径（支持 `~`）
- 🧠 **模型选择**：deepseek-v4-flash / deepseek-v4-pro
- 📋 **多行粘贴**：粘贴整段代码自动合并为一条消息
- ⚡ **流式输出**：边生成边显示，工具调用内联提示
- ⌨️ **完整 CLI 交互**：Ctrl+C 中断回答 / 清行 / 退出，ESC 等同

## 前置条件

1. 已安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh` 命令可用）
2. DeepSeek API Key（首次运行时引导配置）

## 安装

```bat
:: 1. 复制 profile 到 DSH
xcopy /E /I /Y profiles\cli "%USERPROFILE%\.dsh\profiles\cli"

:: 2. 把 bin\deepseek.cmd / deepseek.ps1 放到 PATH 中的目录（如 node 全局目录）
::    然后新开一个 cmd 窗口
```

或直接运行 `install.cmd`（自动执行第 1 步并提示第 2 步）。

## 使用

```powershell
deepseek            # 启动（等同 dsh --profile cli）
dsh --profile cli   # 官方写法
```

### 对话命令

| 命令 | 作用 |
|---|---|
| `/config` | 打开配置向导 |
| `/mode` | 切换权限模式（只读/工作区写入/完全访问） |
| `/cd <路径>` | 切换工作目录 |
| `/model` | 切换模型 |
| `/think` | 显示思考过程 |
| `/new` | 开启新会话 |
| `/exit` | 退出（Ctrl+C / ESC 也可） |

### 按键

| 按键 | 行为 |
|---|---|
| `↑` / `↓` + `Enter` | 菜单导航 |
| `Ctrl+C`（回答中） | 中断回答 |
| `Ctrl+C`（输入中） | 清空输入行 |
| `Ctrl+C`（空输入） | 退出 |
| 多行粘贴 | 自动合并为一条消息 |

## 目录结构

```
DeepSeek-CLI/
├── README.md            # 本文档
├── install.cmd          # 一键安装脚本
├── .gitignore
├── profiles/
│   └── cli/             # dsh cli profile（复制到 $DSH_HOME/profiles/cli）
│       ├── package.json
│       ├── cordis.yml
│       ├── cordis.patch.yml
│       ├── pnpm-workspace.yaml
│       └── cli-runner/
│           └── index.js # 交互式 runner（核心）
└── bin/                 # 启动命令（放到 PATH 目录）
    ├── deepseek.cmd
    ├── deepseek.ps1
    ├── dsh-chat.cmd     # 兼容别名
    └── dsh-ask.cmd      # 兼容别名（一次性问答）
```

## 配置持久化

- 用户设置：`$DSH_HOME/cli-settings.json`（权限模式/工作目录/模型/思考显示）
- API Key：`$DSH_HOME/.credentials.yaml`（与网页版共用，勿提交到仓库）
- 会话历史：`$DSH_HOME/sessions/`

## 许可证

MIT
