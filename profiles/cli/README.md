# dsh cli profile — 命令行里的 Agent

在 Windows cmd / PowerShell / Windows Terminal 中直接与 DSH Agent 对话。

## 启动方式

在 **cmd**、**PowerShell** 或 **Windows Terminal** 中直接输入：

```powershell
dsh-chat                  # 交互式对话（等同 dsh --profile cli）
dsh --profile cli         # 同上，官方写法
dsh-ask 你的问题           # 一次性问答，答完即退
dsh --profile headless "你的问题"   # 等价于 dsh-ask
```

> `dsh-chat` / `dsh-ask` 同时提供 `.ps1`（PowerShell）和 `.cmd`（cmd）两个版本，位于
> `C:\Users\69215\nodejs\node-v22.23.2-win-x64`（PATH 内），两种终端里都能直接用。
> 管道输入也支持：`echo "问题" | dsh-chat`。

## 交互命令

| 命令 | 作用 |
|---|---|
| `/help` | 显示帮助 |
| `/new` | 结束当前会话、开启新会话（旧会话已保存） |
| `/model` | 显示当前模型 |
| `/exit` `/quit` `/q` | 退出（Ctrl+C 也可以） |

## 特性

- 同一会话内连续多轮对话，模型记住上下文
- 回答流式输出（边生成边显示）
- 工具调用会显示 `⏳ 调用工具 / ✅ 完成` 提示
- 每次运行的会话持久化到 `$DSH_HOME/sessions`
- 管道输入也支持：`echo "问题" | dsh-chat`

## 复制粘贴

- **复制**：AI 的回答是普通终端文本，直接选中即复制（Windows Terminal / VS Code 均支持）
- **单行粘贴**：粘贴到输入框后回车即可
- **多行粘贴**：直接粘贴一大段代码/文字，**连续到达的行会自动合并成一条消息**发送（不会拆成多轮问答）；命令（`/`开头）和管道输入仍按行处理
- 管道/脚本输入（`echo ... | dsh-chat`）不受影响，逐行执行

## 配置

- 模型：读取 `$DSH_HOME/settings.yaml` 的 `agent-default-model`（当前 deepseek-v4-flash）
- API key：`$DSH_HOME/.credentials.yaml`（与 web 版共用）
- 显示推理过程：在 `cli-runner` 行配置 `showReasoning: true`
- 更改提示符：配置 `prompt: "你 > "`

## 启动动效

**默认关闭**（鲸鱼游动动画依赖 ANSI 光标重绘，部分终端（经典 conhost）不支持会
导致帧堆叠刷屏）。想体验：在 `cli-runner` 行的 config 里设 `showIntro: true`，
并在支持 ANSI 的终端（Windows Terminal / VS Code）中使用。

## 退出与中断（正常 CLI 逻辑）

| 按键 | 行为 |
|---|---|
| `Ctrl+C`（回合中） | **中断**当前回答，立即回到提示符（可继续对话） |
| `Ctrl+C`（输入中） | **擦掉**当前输入行，回到提示符（不退出） |
| `Ctrl+C`（空输入） | **退出**聊天 |
| `ESC` | 同 `Ctrl+C` |
| `/exit` `/quit` `/q` | 退出（向导阶段也可用） |
| `Ctrl+D` / EOF | 退出 |

## 首次使用引导

第一次运行时（检测到 `$DSH_HOME/.credentials.yaml` 无 API Key）自动进入引导：

```
首次使用：需要先配置 API Key 才能对话
请输入 DeepSeek API Key（sk-...）：**********   ← 隐藏输入，回显星号
✓ API Key 已保存（sk-******abcd）
```

- Key 隐藏输入（TTY 回显星号，不泄露明文），存入 `$DSH_HOME/.credentials.yaml`（与 web 版共用）
- 之后启动自动跳过；`/config` 或向导的"API Key"项可随时更换
- 已配置时主菜单显示 `API Key  已配置`

## 启动配置向导

启动后显示**配置菜单**，支持**方向键操作**（Codex / Claude Code 风格）：

```
启动配置
 ❯ 权限模式      工作区写入           ← 光标在此
   工作目录      C:\Users\69215\Desktop
   模型          DeepSeek-V4-Flash
   显示思考过程  关
   API Key      已配置
   ▶ 开始对话
↑↓ 选择 · Enter 确认 · 数字直接选 · q 返回
```

| 按键 | 作用 |
|---|---|
| `↑` / `↓` | 移动光标 |
| `Enter` | 进入该项（权限/目录/模型子菜单） |
| `1`-`5` | 数字快捷选择 |
| `q` / `Esc` | 返回上级 / 退出 |

- **权限模式**（已汉化）：只读 / 工作区写入 / 完全访问（内部值 read-only / workspace-write / danger-full-access，实时生效）
- **工作目录**：方向键选历史，或选"输入新路径"后直接键入（支持 `~`）
- **模型**：↑↓ 选 Flash / Pro
- 自动探测终端能力：**不支持方向键重绘的终端（经典 conhost / 管道）自动降级为数字输入菜单**
- 直接输入**任意文字**可跳过向导并作为第一条消息
- 配置持久化到 `$DSH_HOME/cli-settings.json`，下次启动自动恢复

对话中命令：`/config` 重开向导 · `/mode` 切换权限 · `/cd` 切目录 · `/model` 换模型 · `/think` 思考显示 · `/new` 新会话 · `/exit` 退出

## 界面

启动时显示 **DeepSeek 品牌启动画面**（参考 Codex CLI 的 logo 横幅风格）：

```
                  ██
                 ████
               ████████
             ████████████
          ██████████████████
       ▄███████████████████████▄          ← 喷水鲸鱼（DeepSeek 大鲸鱼 logo）
    ▄███████████████████████████████▄
  ...
██████╗ ███████╗███████╗██████╗ ███████╗███████╗███████╗██╗  ██╗
██╔══██╗██╔════╝██╔════╝██╔══██╗██╔════╝██╔════╝██╔════╝██║ ██╔╝     ← DEEPSEEK 品牌字
...
DeepSeek Harness · 交互式命令行 · v0.1.0-rc.6
```

- 配色：DeepSeek 品牌蓝 `#4D6BFE` 系（真彩色，Windows Terminal / VS Code / Win10+ cmd 均支持）
- 提示符：青色 `❯ `（参考 Claude Code 风格）
- 工具调用：青色 `◈ 工具名 …` → 绿色 `✓ 完成`
- 错误提示：红色

## 结构

```
profiles/cli/
├── package.json          # profile 定义（bundle: @deepseek-ai/dsh-base）
├── cordis.yml            # loader 根（空）
├── cordis.patch.yml      # 补丁：挂载 cli-runner 插件
├── pnpm-workspace.yaml
└── cli-runner/index.js   # 交互式 runner（readline 循环 + 流式输出）
```
