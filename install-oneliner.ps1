# DeepSeek CLI — one-line installer (Windows / PowerShell 5.1+)
# Usage (run in PowerShell):
#   irm https://raw.githubusercontent.com/jincheng3870682453-hash/DeepSeek-CLI/master/install-oneliner.ps1 | iex
$ErrorActionPreference = "Stop"

$Repo = "jincheng3870682453-hash/DeepSeek-CLI"
$Branch = "master"
$Archive = "https://github.com/$Repo/archive/refs/heads/$Branch.zip"

Write-Host "🐋 DeepSeek CLI 一键安装" -ForegroundColor Cyan
Write-Host "──────────────────────────"

# 1. Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 未找到 Node.js。请先安装：https://nodejs.org" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Node.js: $(node --version)"

# 2. DeepSeek Harness (dsh)
if (-not (Get-Command dsh -ErrorAction SilentlyContinue)) {
    Write-Host "→ 安装 DeepSeek Harness (dsh) ..."
    npm install -g @deepseek-ai/dsh
    if (-not (Get-Command dsh -ErrorAction SilentlyContinue)) {
        Write-Host "❌ dsh 安装失败。请手动执行：npm install -g @deepseek-ai/dsh" -ForegroundColor Red
        exit 1
    }
}
Write-Host "✓ dsh 已就绪"

# 3. 下载仓库
$Tmp = Join-Path $env:TEMP "deepseek-cli-install"
Remove-Item $Tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $Tmp | Out-Null
$Zip = Join-Path $Tmp "cli.zip"
Write-Host "→ 下载 DeepSeek-CLI ..."
try {
    Invoke-WebRequest -Uri $Archive -OutFile $Zip -UseBasicParsing
} catch {
    Write-Host "❌ 下载失败（网络问题？）。可重试或手动：git clone https://github.com/$Repo.git" -ForegroundColor Red
    exit 1
}
Expand-Archive -Path $Zip -DestinationPath $Tmp -Force
$Src = Join-Path $Tmp "DeepSeek-CLI-$Branch"

# 4. 安装 cli profile
$DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME ".dsh" }
New-Item -ItemType Directory -Path (Join-Path $DshHome "profiles") -Force | Out-Null
Copy-Item -Recurse -Force (Join-Path $Src "profiles\cli") (Join-Path $DshHome "profiles\cli")
Write-Host "✓ profile 已安装 → $DshHome\profiles\cli"

# 5. 安装 deepseek 命令（node 全局目录在 PATH 上）
$NodeDir = Split-Path (Get-Command node).Source
Copy-Item -Force (Join-Path $Src "bin\deepseek.cmd") $NodeDir
Copy-Item -Force (Join-Path $Src "bin\deepseek.ps1") $NodeDir
Write-Host "✓ 命令已安装 → $NodeDir\deepseek.cmd"

# 6. 清理
Remove-Item $Tmp -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "──────────────────────────"
Write-Host "✅ 安装完成！新开一个终端，运行 deepseek 开始使用 🐋" -ForegroundColor Green
Write-Host "（首次运行会引导配置 API Key）"
