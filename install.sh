#!/usr/bin/env bash
# install.sh — install the DeepSeek CLI profile for Linux / macOS / WSL
set -e

DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "============================================"
echo "  DeepSeek CLI 安装 (Linux/macOS/WSL)"
echo "============================================"
echo "DSH 目录: $DSH_HOME_DIR"
echo

# 1. 检查 dsh
if ! command -v dsh >/dev/null 2>&1; then
    echo "[错误] 未找到 dsh 命令。请先安装 DeepSeek Harness："
    echo "  npm install -g @deepseek-ai/dsh"
    exit 1
fi

# 2. 复制 cli profile
mkdir -p "$DSH_HOME_DIR/profiles"
cp -r "$SCRIPT_DIR/profiles/cli" "$DSH_HOME_DIR/profiles/cli"
echo "[1/2] profile 已复制到 $DSH_HOME_DIR/profiles/cli"

# 3. 安装命令
echo "[2/2] 安装 deepseek 命令到 /usr/local/bin ..."
if [ -w /usr/local/bin ]; then
    cp "$SCRIPT_DIR/bin/deepseek" /usr/local/bin/deepseek
    chmod +x /usr/local/bin/deepseek
    echo "      完成：/usr/local/bin/deepseek"
else
    echo "      没有权限写 /usr/local/bin，请手动执行："
    echo "      sudo cp $SCRIPT_DIR/bin/deepseek /usr/local/bin/"
    echo "      sudo chmod +x /usr/local/bin/deepseek"
fi

echo
echo "安装完成！新开终端输入 deepseek 即可启动。"
