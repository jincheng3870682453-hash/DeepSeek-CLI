#!/usr/bin/env bash
# DeepSeek CLI — one-line installer (Linux / macOS / WSL)
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/jincheng3870682453-hash/DeepSeek-CLI/master/install-oneliner.sh | bash
set -e

REPO="jincheng3870682453-hash/DeepSeek-CLI"
BRANCH="master"
ARCHIVE="https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz"

echo "🐋 DeepSeek CLI 一键安装"
echo "──────────────────────────"

# 1. Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "❌ 未找到 Node.js。请先安装：https://nodejs.org（LTS 即可）"
  exit 1
fi
echo "✓ Node.js: $(node --version)"

# 2. DeepSeek Harness (dsh)
if ! command -v dsh >/dev/null 2>&1; then
  echo "→ 安装 DeepSeek Harness (dsh) ..."
  npm install -g @deepseek-ai/dsh
  if ! command -v dsh >/dev/null 2>&1; then
    echo "❌ dsh 安装失败。请手动执行：npm install -g @deepseek-ai/dsh"
    exit 1
  fi
fi
echo "✓ dsh 已就绪"

# 3. 下载本仓库（临时目录）
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "→ 下载 DeepSeek-CLI ..."
if ! curl -fsSL "$ARCHIVE" -o "$TMP/cli.tar.gz" 2>/dev/null; then
  echo "❌ 下载失败（网络问题？）。可重试或手动：git clone https://github.com/$REPO.git"
  exit 1
fi
tar -xzf "$TMP/cli.tar.gz" -C "$TMP"
SRC="$TMP/DeepSeek-CLI-$BRANCH"

# 4. 安装 cli profile
DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
mkdir -p "$DSH_HOME_DIR/profiles"
cp -r "$SRC/profiles/cli" "$DSH_HOME_DIR/profiles/cli"
echo "✓ profile 已安装 → $DSH_HOME_DIR/profiles/cli"

# 5. 安装 deepseek 命令
BIN_TARGET=""
if [ -w /usr/local/bin ]; then
  BIN_TARGET="/usr/local/bin"
else
  mkdir -p "$HOME/.local/bin"
  BIN_TARGET="$HOME/.local/bin"
fi
cp "$SRC/bin/deepseek" "$BIN_TARGET/deepseek"
chmod +x "$BIN_TARGET/deepseek"
echo "✓ 命令已安装 → $BIN_TARGET/deepseek"

# 6. PATH 提示
case ":$PATH:" in
  *":$BIN_TARGET:"*) : ;;
  *)
    echo "⚠️  $BIN_TARGET 不在 PATH 中，请执行："
    echo "    export PATH=\"$BIN_TARGET:\$PATH\"   # 建议写进 ~/.bashrc 或 ~/.zshrc"
    ;;
esac

echo "──────────────────────────"
echo "✅ 安装完成！运行 deepseek 开始使用 🐋"
echo "（首次运行会引导配置 API Key）"
