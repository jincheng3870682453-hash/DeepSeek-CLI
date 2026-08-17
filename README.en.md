[简体中文](README.md) | **English**

<div align="center">

# 🐋 DeepSeek CLI

**DeepSeek Agent in your terminal** — a Codex / Claude Code-style CLI that puts DeepSeek V4 on the command line:
an arrow-key config wizard, permission & workspace management, agent presets & skill extensions,
bilingual zh/en UI, and streaming chat. Built on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

> ⚠️ **Unofficial community project** — built independently by a community developer; not affiliated with,
> endorsed by, or sponsored by DeepSeek.
> **非官方社区项目**：本工具由社区开发者独立构建，与 DeepSeek（深度求索）无关联、未经其认可或赞助。

**v1.3.2** 🎉

[![Version](https://img.shields.io/badge/Version-1.3.2-4D6BFE)](https://github.com/jincheng3870682453-hash/DeepSeek-CLI)
[![Tests](https://img.shields.io/github/actions/workflow/status/jincheng3870682453-hash/DeepSeek-CLI/test.yml?branch=master&label=Tests&logo=vitest&logoColor=white&color=4D6BFE)](https://github.com/jincheng3870682453-hash/DeepSeek-CLI/actions/workflows/test.yml)
[![License](https://img.shields.io/badge/License-AGPL--3.0-4D6BFE)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows-4D6BFE)](https://github.com/deepseek-ai/deepseek-harness)
[![Built on](https://img.shields.io/badge/Built%20on-DeepSeek%20Harness-4D6BFE)](https://github.com/deepseek-ai/deepseek-harness)
[![Powered by](https://img.shields.io/badge/Model-DeepSeek--V4-4D6BFE)](https://www.deepseek.com)

> 🐋 The terminal splash (DeepSeek whale ASCII art) lives in [`assets/whale.txt`](assets/whale.txt)
> to keep the GitHub page clean.

</div>

---

## 📑 Table of Contents

> 👋 **New here?** Follow this path: 「[Why](#why)」→「[One-line install](#oneliner)」→「[Usage](#usage)」→「[FAQ](#faq)」— 3 minutes to get started.

<details>
<summary><b>📚 Full TOC</b></summary>

**🚀 Start**
- [Features](#features)
- [Demo (screenshots)](#demo)
- [Why](#why)
- [Quick Start](#quick-start): [one-line install](#oneliner) · [manual install](#install-manual) · [prerequisites](#prerequisites) · [usage](#usage) · [CLI flags](#cli-flags) · [env vars](#env-vars)
- [Interaction & Commands](#interaction) ([config wizard](#wizard) · [chat commands](#commands) · [keys](#keys))

**🛠️ Advanced**
- [Directory structure](#structure)
- [Cross-platform](#platforms)
- [Two configs, two jobs](#config-formats)
- [Logging & debugging](#logging)
- [Custom Skills](#skills)
- [Custom Agent presets](#presets)
- [Session management](#sessions)
- [Uninstall & cleanup](#uninstall)
- [Config & security](#security)
- [FAQ](#faq)

**🧭 Other**
- [License](#license)
- [Contributing](#contributing)
- [Changelog](#changelog)

</details>

---

<a id="features"></a>
## ✨ Features

| | | |
|---|---|---|
| 🎮 **Arrow-key config wizard** | 🛡️ **Permission modes** | 🔑 **First-run guidance** |
| Codex-style ↑↓ menu with terminal capability detection | read-only / workspace-write / full access, switch live | auto-detects and guides API key setup (hidden input) |
| 📂 **Workspace management** | 🧠 **Model selection** | 📋 **Multi-line paste** |
| current dir / history / custom path | multi-provider models (Flash / Pro) | pasted code merges into one message |
| 🎯 **Thinking effort** | 🤖 **Agent presets** | 🌐 **Bilingual UI** |
| off (fast) / high / max, per model | code / cordis / minimal / standard | `/lang` or advanced settings, one keypress |
| ⚙️ **Busy behavior** | 🔌 **Plugins & Skills** | ⚡ **Streaming output** |
| queue sends / type to interrupt | `/plugins`, `/skills` list what's loaded | tokens stream live with inline tool hints |
| ⌨️ **Full CLI interaction** | 🐋 **Branded splash** | |
| Ctrl+C interrupt/clear/quit, Esc same | DeepSeek whale logo + DEEPSEEK banner | |

---

<a id="demo"></a>
## 🎬 Demo

**Real terminal run** (click for full size):

<p align="center">
  <img src="assets/demo-terminal.png" width="480" alt="DeepSeek CLI terminal screenshot" />
</p>

**Config wizard animation** (SVG: cursor moves, input cursor blinks):

![DeepSeek CLI wizard demo](demo.svg)

---

## 🎯 Project Positioning

<a id="why"></a>
### Why?

The official [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) provides a **Web UI** (configure models,
manage sessions in the browser) but **no terminal CLI** — so there was no convenient way to use a DeepSeek Agent
directly in an SSH session / server / terminal window without opening a browser.

This project fills that gap: **the DSH engine, in your terminal** — a Codex / Claude Code-style tool where the config
wizard, permission management and streaming chat all happen in the terminal. Works on servers without a browser,
and can be piped into cron / CI automation.

### Project form

**Pure CLI (pure backend)** — no web frontend, no browser UI, no GUI.

It shares the same core engine as the official [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(agent loop, tools, sandbox, session persistence) but keeps only the **terminal interaction layer**, all in this repo
(`profiles/cli/`) — clone it to review, modify and build.

```
DeepSeek Harness (core engine) ──► DeepSeek CLI (this repo, pure terminal layer)
   agent loop / tools / sandbox          └─ cli-runner: readline interaction + wizard + streaming
```

> The core engine [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) is MIT-licensed
> (`Copyright (c) 2026 DeepSeek`). This repo's `cli-runner/` terminal layer is original code, released as
> [AGPL-3.0-or-later](LICENSE).

---

<a id="quick-start"></a>
## 🚀 Quick Start

<a id="oneliner"></a>
### ⚡ One-line install (recommended · zero prerequisites)

**You don't even need Node.js** — the script auto-detects and downloads whatever's missing
(portable Node → DSH engine → this repo → profile → command), all in one command.

**macOS / Linux / WSL** (paste into a terminal):

```bash
curl -fsSL https://raw.githubusercontent.com/jincheng3870682453-hash/DeepSeek-CLI/master/install-oneliner.sh | bash
```

**Windows** (paste into PowerShell):

```powershell
irm https://raw.githubusercontent.com/jincheng3870682453-hash/DeepSeek-CLI/master/install-oneliner.ps1 | iex
```

> The script: ① detects/downloads Node.js (portable copy to `~/.deepseek-cli` or `%LOCALAPPDATA%\DeepSeek-CLI`,
> **auto-detects CPU architecture**: `win-x64` / `win-arm64` / `win-x86` on Windows, x64/arm64 on macOS/Linux;
> falls back to the npmmirror CN mirror if the official source fails) → ② installs the DSH engine → ③ clones the repo →
> ④ installs the profile → ⑤ installs the `deepseek` command.
> Open a new terminal and run `deepseek` — first run guides you through the API key.
> If the download fails (network), use the repo install methods below.

<a id="install-manual"></a>
### Option 1: Install from GitHub

```powershell
# 1. Clone
git clone https://github.com/jincheng3870682453-hash/DeepSeek-CLI.git
cd DeepSeek-CLI

# 2. One-command install (copies profile + tells you where to put the command)
install.cmd
```

### Option 2: Manual

```bat
:: 1. Copy the profile into DSH
xcopy /E /I /Y profiles\cli "%USERPROFILE%\.dsh\profiles\cli"

:: 2. Put bin\deepseek.cmd / deepseek.ps1 on your PATH, open a new terminal
```

<a id="prerequisites"></a>
### Prerequisites

- **One-line install (recommended)**: nothing to install — the script handles Node.js, the DSH engine, this repo, the profile and the command (see ⚡ above).
- **Manual install**: you need [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) yourself (`dsh` on PATH), then follow Option 1 / Option 2.
- A DeepSeek API key (auto-guided on first run; applies to both install methods)

> ### 🛡️ Engine version compatibility
>
> This CLI is developed against **`@deepseek-ai/dsh` 0.1.x** (verified on `0.1.0-rc.6`).
> The one-line installers (`install-oneliner.sh` / `.ps1`) check `dsh --version` automatically and warn if the
> major version mismatches, suggesting `npm install -g @deepseek-ai/dsh@0.1.0-rc.6`.
> Manual installers can run `dsh --version` anytime.

<a id="usage"></a>
### Usage

```powershell
deepseek            # launch (same as dsh --profile cli)
```

First run guides you through the API key; then the config wizard opens — `↑↓` to choose, `Enter` to confirm, and start chatting.

<a id="scripting"></a>
### 🤖 Scripting / Automation

```powershell
# Non-interactive: skip the wizard, piped input is the task, exits on EOF (great for cron / CI / log processing)
tail -f error.log | deepseek --no-input "analyze and fix the errors above"
echo "translate this: hello" | deepseek --no-input "translate the input to Chinese"

# Debug: print per-turn duration / token usage / tool calls
deepseek --verbose

# Proxy: reads HTTP_PROXY / HTTPS_PROXY automatically (no flags needed)
export HTTPS_PROXY=http://proxy.internal:8080
deepseek
```

<a id="cli-flags"></a>
### 🚀 CLI Flags

| Flag | Effect |
|---|---|
| `--no-input` (`-n`) | Non-interactive: skip the wizard, piped input is the task, exits on EOF (for cron / CI) |
| `--verbose` (`--debug` / `-v`) | Print duration / token usage / tool-call count after each turn |
| `--auto-fix` | Reserved: let the agent auto-fix (use with non-interactive mode) |

```powershell
deepseek --no-input "analyze and fix errors in error.log"
deepseek --verbose
tail -f app.log | deepseek --no-input -v "summarize anything abnormal"
```

<a id="env-vars"></a>
### 🌐 Environment Variables

| Variable | Effect |
|---|---|
| `DSH_HOME` | Data dir (default `~/.dsh`): config, sessions, logs and credentials all live here |
| `HTTP_PROXY` / `HTTPS_PROXY` | Proxy, applied automatically (no flags), e.g. `http://proxy.internal:8080` |
| `DEEPSEEK_CLI_HOME` | Install dir of the one-line installer (default `~/.deepseek-cli` or `%LOCALAPPDATA%\DeepSeek-CLI`) |

---

<a id="interaction"></a>
## 🎮 Interaction

<a id="wizard"></a>
### Config wizard

```
Startup config
 ❯ Permission mode   workspace-write      ← cursor here
   Working directory C:\Users\69215\Desktop
   Model             DeepSeek-V4-Flash
   Show thinking     off
   API key          configured
   ▶ Start chatting
↑↓ select · Enter confirm · number direct · q back
```

<a id="commands"></a>
### Chat commands

| Command | Syntax | Description |
|---|---|---|
| `/config` | `/config` | Re-open the config wizard |
| `/mode` | `/mode`<br>`/mode <mode>` | No arg: show current mode & options; with arg: switch (`read-only` / `workspace-write` / `danger-full-access`), e.g. `/mode read-only` |
| `/cd` | `/cd`<br>`/cd <path>` | No arg: show cwd & usage; with arg: change (supports `~`, relative/absolute), e.g. `/cd ~/projects` |
| `/model` | `/model`<br>`/model <id>`<br>`/model list` | No arg: show current model; `list` / `?`: list all models of the provider; with arg: switch, e.g. `/model deepseek-v4-flash` |
| `/think` | `/think [on\|off]` | Toggle thinking display; accepts `on` / `off` / `1` / `0` |
| `/effort` | `/effort`<br>`/effort <off\|high\|max>` | No arg: show current; with arg: switch thinking effort (`off` fast / `high` / `max`) |
| `/preset` | `/preset`<br>`/preset <id>`<br>`/preset new <name>` | No arg: show current preset, custom dir & example structure; with arg: switch (`code` / `cordis` / `minimal` / `standard` or custom); `new`: copy from standard to create a custom preset |
| `/lang` | `/lang [zh\|en]` | No arg: show current language; with arg: switch UI language |
| `/busy` | `/busy [queue\|interrupt]` | No arg: show current; with arg: switch (`queue` enqueue / `interrupt` type to interrupt) |
| `/plugins` | `/plugins` | List loaded plugins |
| `/skills` | `/skills`<br>`/skills new <name>` | List available skills & custom dir; `new`: create a SKILL.md template at `$DSH_HOME/skills/<name>/` |
| `/new` | `/new` | Start a new session (old ones stay in `$DSH_HOME/sessions/`) |
| `/help` | `/help` (or `/h`) | Show help |
| `/exit` | `/exit` (or `/quit` / `/q`) | Exit (Ctrl+C on empty input also works) |

<a id="keys"></a>
### Keys

| Key | Behavior |
|---|---|
| `↑` / `↓` + `Enter` | Menu navigation (falls back to numbered input if unsupported) |
| `Ctrl+C` (while answering) | Interrupt, back to prompt immediately |
| `Ctrl+C` (while typing) | Clear the current input line |
| `Ctrl+C` (empty input) | Exit |
| `Esc` | Same as Ctrl+C |
| Multi-line paste | Merged into a single message |

---

<a id="structure"></a>
## 🧩 Directory Structure

```
DeepSeek-CLI/
├── install.cmd / install.sh     # one-command install (Windows / Linux-macOS)
├── install-oneliner.sh / .ps1   # one-line install (zero prerequisites, dsh version check)
├── package.json                 # dev deps (vitest)
├── test/                        # unit tests (vitest, 55 cases)
│   ├── utils.test.js            # i18n / CJK width / paths / masking
│   ├── config.test.js           # settings & credentials
│   ├── commands.test.js         # command parsing
│   └── menu.test.js             # menu navigation state machine
├── profiles/
│   └── cli/             # dsh cli profile
│       ├── package.json
│       ├── cordis.yml
│       ├── cordis.patch.yml
│       ├── pnpm-workspace.yaml
│       └── cli-runner/
│           ├── index.js  # interactive runner (menu / commands / sessions)
│           ├── utils.js  # i18n dicts, CJK width, path/dir helpers
│           ├── config.js # settings & credentials (cli-settings.json / .credentials.yaml)
│           ├── menu.js   # arrow-key menu controller (render + nav state machine)
│           └── commands.js # pure command parser (input → {cmd, arg, rest})
└── bin/                 # launcher commands
    ├── deepseek.cmd / .ps1 / (bash)  # main command
    ├── dsh-chat.cmd / .ps1   # compatibility alias
    └── dsh-ask.cmd / .ps1    # one-shot Q&A
```

**Runtime data dir (`$DSH_HOME`, default `~/.dsh`)** — all user data lives here, not in the repo:

```
~/.dsh/
├── cli-settings.json      # CLI preferences (permission/dir/model/language…)
├── .credentials.yaml      # API key (shared with the DSH web app; never committed)
├── app-debug.log          # engine runtime log
├── app-dsh-out.log        # engine stdout
├── app-dsh-err.log        # engine stderr
├── sessions/              # session history (one file per session)
├── skills/                # custom skills (<name>/SKILL.md)
├── .agent-presets/        # custom presets (<id>/agent.cordis.yml)
├── storages/              # engine storage
└── profiles/cli/          # this CLI's profile (source from this repo)
```

---

<a id="platforms"></a>
## 💻 Cross-platform

| Platform | Support | Launch |
|---|---|---|
| **Windows** | ✅ Full | `deepseek` (`.cmd` / `.ps1`) |
| **Linux** | ✅ Full | `bin/deepseek` (bash) |
| **macOS** | ✅ Expected | `bin/deepseek` (bash) |
| **WSL** | ✅ Supported | `bin/deepseek` |

**Linux / macOS install**:

```bash
# 1. Install DeepSeek Harness (provides the dsh command)
npm install -g @deepseek-ai/dsh

# 2. Install this repo
git clone https://github.com/jincheng3870682453-hash/DeepSeek-CLI.git
cd DeepSeek-CLI
./install.sh          # copy profile + install deepseek command

# 3. Launch
deepseek
```

The core logic (`cli-runner/`: `index.js` / `utils.js` / `config.js`) uses Node's cross-platform APIs
(readline / fs / path), all paths via `path.join`, configs under `$DSH_HOME` (default `~/.dsh` on Linux) —
behavior is identical on Windows and Linux.

---

<a id="config-formats"></a>
## 🗂️ Two Configs, Two Jobs

Two config files, **completely different jobs — don't mix them up**:

| File | Owned by | Content | Editable? |
|---|---|---|---|
| `profiles/cli/cordis.yml` (+ `cordis.patch.yml`) | **DSH engine** | Declares the profile's plugin assembly (bundle, runtime, plugin list), parsed strictly by DSH's loader | ❌ **Don't change the format** — it's the engine's contract; breaking it may prevent startup |
| `$DSH_HOME/cli-settings.json` | **This CLI** | User preferences: permission mode / working dir / model / thinking display / language | ✅ Feel free (or just use the wizard — equivalent) |

> **One-liner**: `cordis.yml` is "what plugins this engine has" (DSH owns it); `cli-settings.json` is "what config I like" (CLI owns it).
> Want to change UI/behavior → edit `cli-settings.json` or run the wizard; want to change plugin assembly → touch `cordis.yml`.

<a id="logging"></a>
## 📋 Logging & Debugging

**① Live debugging** (auto-prints duration / tokens / tool calls after each turn):

```powershell
deepseek --verbose        # or --debug (equivalent)
```

```
[debug] turn 0.76s · prompt 97 tok · output 33 tok · cache-read 8192
```

**② DSH engine logs** (under `$DSH_HOME`, record service start, ports, errors):

| File | Content |
|---|---|
| `app-debug.log` | Engine runtime: service start, spawn pid, port checks |
| `app-dsh-out.log` | Engine stdout (e.g. `dsh web: http://127.0.0.1:3080`) |
| `app-dsh-err.log` | Engine stderr (**check this first when something breaks**) |

cmd:

```cmd
type %USERPROFILE%\.dsh\app-debug.log
```

PowerShell live tail (`Ctrl+C` to stop):

```powershell
Get-Content $env:USERPROFILE\.dsh\app-debug.log -Tail 30 -Wait
```

**③ Session records**: every conversation is saved in `$DSH_HOME\sessions\` (one file per session).

> **Troubleshooting order**: `deepseek --verbose` first → engine errors in `app-dsh-err.log` → startup issues at the tail of `app-debug.log`.

<a id="skills"></a>
## 🧩 Custom Skills

A Skill = a "how-to manual" for the agent. Drop a folder in — **no code changes needed**:

```
$DSH_HOME/skills/
└── my-skill/
    └── SKILL.md          # skill content (markdown front-matter with name/description)
```

**Usage:**

```powershell
deepseek
/skills              # view skills and the custom dir
/skills new my-skill # creates a template at $DSH_HOME\skills\my-skill\SKILL.md — edit the content
```

Template (`SKILL.md`):

```markdown
---
name: my-skill
description: what this skill is for (one line)
---
Write the skill instructions here. The model sees this when it invokes the skill.
```

<a id="presets"></a>
## 🤖 Custom Agent Presets

A preset = persona + tool combination. Put it in `$DSH_HOME/.agent-presets/<id>/agent.cordis.yml`:

```
$DSH_HOME/.agent-presets/
└── my-agent/
    └── agent.cordis.yml   # custom persona/tools
```

**Usage:**

```powershell
deepseek
/preset              # view presets and the custom dir
/preset new my-agent # copy from standard as a starting point, then edit
/preset my-agent     # switch to your preset
```

<a id="sessions"></a>
## 💬 Session Management

| Action | How |
|---|---|
| New session | `/new` (old ones saved automatically) |
| View history | `dir %USERPROFILE%\.dsh\sessions` (PowerShell: `Get-ChildItem $env:USERPROFILE\.dsh\sessions`) |
| Clear all history | `del %USERPROFILE%\.dsh\sessions\*` (PowerShell: `Remove-Item $env:USERPROFILE\.dsh\sessions\* -Recurse -Force`) |

<a id="uninstall"></a>
## 🗑️ Uninstall & Cleanup

```powershell
# 1. Remove the launcher commands (deepseek / dsh-chat / dsh-ask)
#    one-line install: delete deepseek.cmd / deepseek.ps1 in the install dir
#    or manually delete the bin\deepseek.* files you put on PATH

# 2. Remove the CLI profile
Remove-Item "$env:USERPROFILE\.dsh\profiles\cli" -Recurse -Force

# 3. (Optional) Remove all data: config, sessions, logs, credentials
Remove-Item "$env:USERPROFILE\.dsh" -Recurse -Force
# ⚠️ Step 3 also deletes your API key (.credentials.yaml) — only run it if you're sure
```

<a id="security"></a>
## 🔒 Config & Security

- **API key**: `$DSH_HOME/.credentials.yaml` (shared with the DeepSeek Harness web app; **excluded by .gitignore, never committed**)
- **User settings**: `$DSH_HOME/cli-settings.json` (permission / working dir / model / thinking display; also excluded; tolerates UTF-8 BOM written by PowerShell)
- **Session history**: `$DSH_HOME/sessions/`, persisted; `/new` anytime

---

<a id="faq"></a>
## ❓ FAQ

<details>
<summary><b>🔑 Where do I get / change my API key?</b></summary>

DeepSeek open platform: **https://platform.deepseek.com** → sign in → "API Keys" on the left → create (`sk-` prefix).

- **First run**: the CLI detects no key and guides you (hidden input, only asterisks shown)
- **Change**: `/config` in chat → re-enter the API key item; or edit `$DSH_HOME/.credentials.yaml` directly
- The key lives in `$DSH_HOME/.credentials.yaml` (shared with the DSH web app; gitignored)

</details>

<details>
<summary><b>🌐 How do I set a proxy? What if the proxy is down?</b></summary>

The CLI reads `HTTP_PROXY` / `HTTPS_PROXY` automatically at startup (no flags):

```powershell
# Set (current session)
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
deepseek

# Proxy down / don't want it: clear and relaunch
Remove-Item Env:HTTPS_PROXY, Env:HTTP_PROXY
deepseek
```

Linux / WSL: `export HTTPS_PROXY=http://127.0.0.1:7890`; `unset HTTPS_PROXY HTTP_PROXY` when done.
Troubleshoot: `curl https://api.deepseek.com` first — if that fails it's network/proxy, if it works go through the CLI.

</details>

<details>
<summary><b>🈶 Chinese shows as garbage on WSL / Linux?</b></summary>

- **Best**: use [Windows Terminal](https://aka.ms/terminal) for WSL (UTF-8 by default)
- Check locale: `echo $LANG` — make sure it's `*.UTF-8` (e.g. `zh_CN.UTF-8`); otherwise `export LANG=zh_CN.UTF-8`
- Classic cmd window: run `chcp 65001` to switch to UTF-8 first
- Font: use a CJK-capable terminal font (Cascadia Mono / Microsoft YaHei)

</details>

<details>
<summary><b>🛡️ "Permission denied / needs confirmation" — what now?</b></summary>

Three permission modes (switch live with `/mode`):

| Mode | Behavior |
|---|---|
| `read-only` | Read-only, cannot modify files (safest) |
| `workspace-write` | Can read/write files **inside the workspace**; larger operations need confirmation (default) |
| `danger-full-access` | Full access, no more prompts |

If the agent is blocked from writing outside the workspace → after confirming the path is fine, try `/mode danger-full-access`, or switch the working dir there (`/cd`).

</details>

<details>
<summary><b>⏳ Hangs on exit?</b></summary>

Exit persists session data first, then force-quits within **at most 0.3 s** — if nothing happens after ~1 s, hit `Ctrl+C`; no data will be corrupted.
(In rare cases an engine background handle isn't released — known design, doesn't affect session content.)

</details>

<details>
<summary><b>🧹 How do I update?</b></summary>

```powershell
# One-line install users: just re-run the installer (re-clones the repo + overwrites the profile)
irm https://raw.githubusercontent.com/jincheng3870682453-hash/DeepSeek-CLI/master/install-oneliner.ps1 | iex

# Manual install users: pull + re-copy the profile
git -C DeepSeek-CLI pull
xcopy /E /I /Y DeepSeek-CLI\profiles\cli "%USERPROFILE%\.dsh\profiles\cli"
```

</details>

<details>
<summary><b>💾 Where's all my data? Backup / migration?</b></summary>

**Everything lives in `$DSH_HOME` (default `~/.dsh`)**: config, sessions, logs, credentials, custom skills/presets.
Backup = copy the whole directory; migrate = copy it to the same location on a new machine.

```powershell
Copy-Item "$env:USERPROFILE\.dsh" "D:\backup-dsh" -Recurse
```

</details>

<details>
<summary><b>🚫 Error 429 / rate-limited?</b></summary>

The DeepSeek API rate-limits per account. Fixes:
1. Wait a few seconds and retry
2. Check balance / plan at [platform.deepseek.com](https://platform.deepseek.com)
3. `/model` to a lighter model (e.g. `deepseek-v4-flash`)
4. `--verbose` to check per-turn token usage — make sure a single request isn't too large

</details>

<details>
<summary><b>❓ Commands do nothing / unrecognized?</b></summary>

- Commands must start with `/`: `/help` lists them all
- While a menu is open, plain input is swallowed (finish the menu first)
- A typo shows "unknown command": `/config` `/mode` `/model` `/cd` `/think` `/effort` `/preset` `/lang` `/busy` `/skills` `/new` `/exit`

</details>

<a id="license"></a>
## 📄 License

**GNU Affero General Public License v3 or later (AGPL-3.0-or-later)**: [LICENSE](LICENSE)

> **One-liner**: **use it freely, but any modified code must stay open source** — anyone who modifies, distributes,
> or provides this software (or derivatives) over a network must publish all modified source under AGPL.
> "Steal two lines, close it up, sell it"? AGPL exists for exactly that: change one line and it must stay open; closed-source commercial use is infringement.
>
> - ✅ Allowed: personal use, learning, modification, distribution (including paid distribution, but source must be provided)
> - ⚠️ Required: any modification/derivative must be AGPL; network services must open the corresponding source (Section 13)
> - ❌ Forbidden: closed-source distribution, closed-source commercial derivatives, adding further restrictions

<a id="contributing"></a>
## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — pure-code project; changes concentrate in `cli-runner/`
(`index.js` / `utils.js` / `config.js` / `menu.js` / `commands.js`). After pure-function changes, run `npm test`.
Use the [PR template](.github/PULL_REQUEST_TEMPLATE.md) when submitting PRs.

---

<a id="changelog"></a>
## 🏷️ Changelog

### v1.3.2 (2026-08) — arch-aware installer

- 🔧 **`install-oneliner.ps1` arch-adaptive**: auto-detects Windows CPU architecture (`ARM64` / `AMD64` / `x86`, incl. the `PROCESSOR_ARCHITEW6432` fix for 32-bit processes on 64-bit systems), downloads the matching portable Node (`win-arm64` / `win-x64` / `win-x86`) — no more hardcoded `win-x64` (Windows on ARM now works)
- 🌐 **Mirror fallback**: switches to the npmmirror CN mirror if the official Node source fails
- 🔬 **CI upgraded to a cross-platform matrix**: GitHub Actions now runs **Windows + Ubuntu × Node 18/20/22** (six combos) instead of a single job
- ⚠️ Clear error + manual-install hint on failure instead of failing silently

### v1.3.1 (2026-08) — another split + green CI + AGPL

- 📦 **More file splitting**: `cli-runner/index.js` down to **1060 lines** — new `menu.js` (arrow-key menu controller: render + navigation state machine, keypress-driven, independently testable) and `commands.js` (pure `parseCommand`)
- 🧪 **55 test cases**: new `test/menu.test.js` (cursor movement/wrap, Enter/ESC/number keys, exactly-once line swallowing, non-TTY) and `test/commands.test.js` (`/mode read-only` → command object, paths with spaces, non-commands → null)
- 🟢 **CI badge**: GitHub Actions (`.github/workflows/test.yml`) runs tests on push/PR with a live green badge
- 📜 **MIT → AGPL-3.0**: strongest copyleft — modifications/distribution/network services must open all derived code
- 📖 **Full manual**: README completes all operations — command syntax/examples, flags (`--no-input`/`--verbose`/`--auto-fix`), env vars (`DSH_HOME`/proxy), skills/presets, sessions, logs, uninstall, `$DSH_HOME` structure
- 🧭 **Docs clarity**: prerequisites say "one-line install handles DSH / manual install needs the engine first"; new "Why" (official Harness is web-only); CONTRIBUTING adds an "add a new command" walkthrough
- 🎨 **Layout**: 35-line whale ASCII moved to [`assets/whale.txt`](assets/whale.txt) (terminal splash unchanged)
- 📸 **Real screenshot**: [`assets/demo-terminal.png`](assets/demo-terminal.png) (892×951, only 20KB) in the demo section
- ⚠️ **Disclaimer**: bilingual "unofficial community project" notice at the top; Harness credited as MIT (`Copyright (c) 2026 DeepSeek`), this repo's layer original, AGPL
- ❓ **FAQ**: 9 collapsible high-frequency items — API key, proxy, WSL Chinese, permissions, exit hang, update, backup/migration, 429, unrecognized commands
- 📑 **TOC**: "📑 目录" section — 3-step newcomer path + collapsible full TOC (28 explicit anchors)

### v1.3.0 (2026-08) — engineering refactor

- 📦 **File split**: `cli-runner/index.js` from 1955 lines into `index.js` (interaction/sessions/commands) + `utils.js` (i18n dicts, CJK width, path & skill/preset helpers) + `config.js` (settings & credentials)
- 🧪 **Unit tests**: vitest (35 cases: utils 25 + config 10) — i18n placeholder replacement, CJK display width, key masking, path expansion, settings BOM/corruption tolerance, credential I/O; `npm test`
- 🛡️ **DSH version note**: README states `@deepseek-ai/dsh` 0.1.x (`0.1.0-rc.6`); installers verify `dsh --version` major version
- 🗂️ **Config formats**: README "two configs, two jobs" — `cordis.yml` is the DSH assembly manifest (don't change the format), `cli-settings.json` is CLI preferences (feel free)

### v1.2.0 (2026-08) — scripting & ops

- 🚀 **`--no-input`**: skip the wizard, piped input is the task, exits on EOF (e.g. `tail -f log | deepseek --no-input "fix errors"`)
- 📊 **`--verbose` / `--debug`**: per-turn duration, token usage (prompt/output/cache), tool-call count
- 🌐 **Proxy auto-adapt**: reads `HTTP_PROXY` / `HTTPS_PROXY` automatically (enterprise-network friendly)
- 📂 **skill/preset dir guidance**: `/skills`, `/preset` show the example directory structure

### v1.1.0 (2026-08) — cross-platform

- 🖥️ **Full compatibility testing** (see [COMPATIBILITY.md](COMPATIBILITY.md)): Windows 11 tested, Linux script + static verification, macOS static review
- 🐧 New `bin/deepseek` (bash) and `install.sh` for Linux / macOS / WSL
- 🔧 Unified `path.join` (no hardcoded backslashes), no platform branches in code

### v1.0.0 (2026-08) — first stable release

- 🐋 Branded splash (DeepSeek whale logo + DEEPSEEK banner + animated SVG demo)
- 🎮 Arrow-key config wizard (auto-detects terminal capability, falls back to numbered input)
- 🔑 First-run guidance: auto-detects and guides API key setup (hidden input)
- 🛡️ Permission modes (read-only / workspace-write / full access, switch live)
- 🧠 Multi-provider model selection + thinking effort (off / high / max)
- 🤖 Agent presets (standard / PTC / creative / minimal + custom), localized
- 📚 Skill support (directory loading + `/skills new` template creation)
- 🌐 Full bilingual zh/en UI (`/lang` live switch)
- ⚙️ Busy behavior (queue / interrupt), custom dirs, plugin list
- ⌨️ Full CLI interaction: Ctrl+C interrupt/clear/quit, multi-line paste merge, persisted config

---

<p align="center">Made with 🐋 by the DeepSeek community</p>
