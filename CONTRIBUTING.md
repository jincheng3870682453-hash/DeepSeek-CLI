# 贡献指南

感谢你愿意为 DeepSeek CLI 贡献代码！这个项目是**纯命令行（纯后端）**的 DeepSeek Agent，
没有 Web 前端。以下是参与开发的约定。

## 项目结构

```
profiles/cli/
├── cli-runner/index.js   # 核心：readline 交互、配置向导、流式输出（唯一入口逻辑）
├── cordis.patch.yml      # profile 补丁：挂载插件（agent-presets、code-runtime、cli-runner）
├── package.json          # profile 定义
└── README.md
bin/                      # 启动命令（deepseek / dsh-chat / dsh-ask 的 cmd + ps1）
tools/gen-demo-svg.mjs    # README 演示图生成脚本
```

## 开发环境

1. 安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（提供 `dsh` 命令）
2. 把本仓库的 `profiles/cli` 链接或复制到 `%USERPROFILE%\.dsh\profiles\cli`
3. 运行 `deepseek`（或 `dsh --profile cli`）调试

> 修改 `cli-runner/index.js` 后，若它以绝对路径被 profile 引用，改动即时生效（无需重装）。

## 规范

### 界面文案

**所有用户可见文案必须走 i18n 字典**（`I18N.zh` / `I18N.en`），通过 `t(key, ...args)` 输出。
不允许硬编码中文/英文。新增文案需同时提供中英两版。

### 权限与安全

- **绝对不要把 API Key、`cli-settings.json`、会话数据提交进仓库**（`.gitignore` 已排除）
- 测试涉及凭据时先备份、测完恢复

### 语言

- 代码注释用英文（与现有风格一致）
- 用户可见文案在 i18n 字典中提供中文 + English

## 提交 PR

1. Fork 本仓库，新建分支（如 `fix/menu-crash`）
2. 本地验证：`deepseek` 启动、菜单导航、对话、退出均正常
3. 提交信息用英文或中文均可，写清楚变更
4. 使用仓库内的 **PR 模板**（`.github/PULL_REQUEST_TEMPLATE.md`）填写
5. 如果改了界面文案，说明中英文界面都测试过
