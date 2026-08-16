#!/usr/bin/env bash
# DeepSeek CLI — true one-line installer (Linux / macOS / WSL)
# Zero prerequisites: if Node.js is missing it downloads a portable Node
# automatically. Usage:
#   curl -fsSL https://raw.githubusercontent.com/jincheng3870682453-hash/DeepSeek-CLI/master/install-oneliner.sh | bash
set -e

REPO="jincheng3870682453-hash/DeepSeek-CLI"
BRANCH="master"
ARCHIVE="https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz"
NODE_VERSION="v22.23.2"
BASE_DIR="${DEEPSEEK_CLI_HOME:-$HOME/.deepseek-cli}"

echo "🐋 DeepSeek CLI 一键安装（零依赖）"
echo "──────────────────────────────"

# 1. Node.js — 系统没有就自动下载便携版
if command -v node >/dev/null 2>&1; then
  echo "✓ Node.js: $(node --version)（系统自带）"
else
  echo "→ 未检测到 Node.js，自动下载便携版 $NODE_VERSION ..."
  OS="$(uname -s)"
  ARCH="$(uname -m)"
  case "$OS-$ARCH" in
    Linux-x86_64)  NODE_PKG="node-$NODE_VERSION-linux-x64" ;;
    Linux-aarch64) NODE_PKG="node-$NODE_VERSION-linux-arm64" ;;
    Darwin-x86_64) NODE_PKG="node-$NODE_VERSION-darwin-x64" ;;
    Darwin-arm64)  NODE_PKG="node-$NODE_VERSION-darwin-arm64" ;;
    *)
      echo "❌ 不支持的系统/架构: $OS-$ARCH"
      exit 1
      ;;
  esac
  mkdir -p "$BASE_DIR"
  curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/$NODE_PKG.tar.gz" -o "$BASE_DIR/node.tar.gz"
  tar -xzf "$BASE_DIR/node.tar.gz" -C "$BASE_DIR"
  rm -f "$BASE_DIR/node.tar.gz"
  export PATH="$BASE_DIR/$NODE_PKG/bin:$PATH"
  echo "✓ Node.js 便携版: $(node --version)"
fi

# 2. DeepSeek Harness (dsh)
if ! command -v dsh >/dev/null 2>&1; then
  echo "→ 安装 DeepSeek Harness (dsh) ..."
  npm install -g @deepseek-ai/dsh
  if ! command -v dsh >/dev/null 2>&1; then
    echo "❌ dsh 安装失败。请检查网络后重试：npm install -g @deepseek-ai/dsh"
    exit 1
  fi
fi
echo "✓ dsh 已就绪"

# 2.5 引擎兼容性校验（基于 @deepseek-ai/dsh 0.1.x 开发验证）
DSH_VER="$(dsh --version 2>/dev/null | head -n1)"
DSH_MM="${DSH_VER%-*}"; DSH_MM="${DSH_MM%.*}"   # "0.1.0-rc.6" -> "0.1"
if [ "$DSH_MM" != "0.1" ]; then
  echo "⚠️ 检测到 dsh $DSH_VER —— 本 CLI 基于 dsh 0.1.x 开发验证"
  echo "   如遇兼容问题，请安装匹配版本：npm install -g @deepseek-ai/dsh@0.1.0-rc.6"
fi

# 3. 下载本仓库
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "→ 下载 DeepSeek-CLI ..."
curl -fsSL "$ARCHIVE" -o "$TMP/cli.tar.gz" 2>/dev/null || {
  echo "❌ 仓库下载失败（网络问题）。可重试或手动：git clone https://github.com/$REPO.git"
  exit 1
}
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

echo "──────────────────────────────"
echo "✅ 安装完成！运行 deepseek 开始使用 🐋"
echo "（首次运行会引导配置 API Key）"
