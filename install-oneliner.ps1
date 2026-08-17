# DeepSeek CLI — true one-line installer (Windows / PowerShell 5.1+)
# Zero prerequisites: if Node.js is missing it downloads a portable Node
# automatically. Usage (run in PowerShell):
#   irm https://raw.githubusercontent.com/jincheng3870682453-hash/DeepSeek-CLI/master/install-oneliner.ps1 | iex
$ErrorActionPreference = "Stop"

$Repo = "jincheng3870682453-hash/DeepSeek-CLI"
$Branch = "master"
$Archive = "https://github.com/$Repo/archive/refs/heads/$Branch.zip"
$NodeVersion = "v22.23.2"
$BaseDir = Join-Path $env:LOCALAPPDATA "DeepSeek-CLI"

Write-Host "🐋 DeepSeek CLI 一键安装（零依赖）" -ForegroundColor Cyan
Write-Host "────────────────────────────────"

# 1. Node.js — 系统没有就自动下载便携版（自动检测架构：arm64 / x64 / x86）
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "✓ Node.js: $(node --version)（系统自带）"
    $NodeBin = (Get-Command node).Source
    $NpmBin = (Get-Command npm -ErrorAction SilentlyContinue).Source
} else {
    # 检测 CPU 架构（32 位进程跑在 64 位系统时，真实架构在 PROCESSOR_ARCHITEW6432）
    $Pa = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    $NodeArch = switch ($Pa) {
        "ARM64" { "arm64" }
        "AMD64" { "x64" }
        default { "x86" }
    }
    $NodePkg = "node-$NodeVersion-win-$NodeArch"
    Write-Host "→ 未检测到 Node.js，自动下载便携版 $NodePkg ..."
    New-Item -ItemType Directory -Path $BaseDir -Force | Out-Null
    $Zip = Join-Path $BaseDir "node.zip"
    # 官方源优先，失败自动切国内镜像（npmmirror）
    $NodeUrls = @(
        "https://nodejs.org/dist/$NodeVersion/$NodePkg.zip",
        "https://npmmirror.com/mirrors/node/$NodeVersion/$NodePkg.zip"
    )
    $NodeDownloaded = $false
    foreach ($u in $NodeUrls) {
        try {
            Invoke-WebRequest -Uri $u -OutFile $Zip -UseBasicParsing
            $NodeDownloaded = $true
            break
        } catch { }
    }
    if (-not $NodeDownloaded) {
        Write-Host "❌ Node.js 下载失败（网络问题）。请手动安装：https://nodejs.org" -ForegroundColor Red
        exit 1
    }
    Expand-Archive -Path $Zip -DestinationPath $BaseDir -Force
    Remove-Item $Zip -Force
    $NodeBin = Join-Path $BaseDir "$NodePkg\node.exe"
    $NpmBin = Join-Path $BaseDir "$NodePkg\npm.cmd"
    $env:Path = "$BaseDir\$NodePkg;$env:Path"
    Write-Host "✓ Node.js 便携版: $(& $NodeBin --version)"
}

# 2. DeepSeek Harness (dsh)
if (-not (Get-Command dsh -ErrorAction SilentlyContinue)) {
    Write-Host "→ 安装 DeepSeek Harness (dsh) ..."
    & $NpmBin install -g @deepseek-ai/dsh
    if (-not (Get-Command dsh -ErrorAction SilentlyContinue)) {
        Write-Host "❌ dsh 安装失败。请检查网络后重试：npm install -g @deepseek-ai/dsh" -ForegroundColor Red
        exit 1
    }
}
Write-Host "✓ dsh 已就绪"

# 2.5 引擎兼容性校验（基于 @deepseek-ai/dsh 0.1.x 开发验证）
$DshVer = (& dsh --version 2>$null | Select-Object -First 1)
$DshMm = ((($DshVer -split "-")[0] -split "\.") | Select-Object -First 2) -join "."   # "0.1.0-rc.6" -> "0.1"
if ($DshMm -ne "0.1") {
    Write-Host "⚠️ 检测到 dsh $DshVer —— 本 CLI 基于 dsh 0.1.x 开发验证" -ForegroundColor Yellow
    Write-Host "   如遇兼容问题，请安装匹配版本：npm install -g @deepseek-ai/dsh@0.1.0-rc.6" -ForegroundColor Yellow
}

# 3. 下载仓库
$Tmp = Join-Path $env:TEMP "deepseek-cli-install"
Remove-Item $Tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $Tmp | Out-Null
$Zip2 = Join-Path $Tmp "cli.zip"
Write-Host "→ 下载 DeepSeek-CLI ..."
try {
    Invoke-WebRequest -Uri $Archive -OutFile $Zip2 -UseBasicParsing
} catch {
    Write-Host "❌ 仓库下载失败（网络问题）。可重试或手动：git clone https://github.com/$Repo.git" -ForegroundColor Red
    exit 1
}
Expand-Archive -Path $Zip2 -DestinationPath $Tmp -Force
$Src = Join-Path $Tmp "DeepSeek-CLI-$Branch"

# 4. 安装 cli profile
$DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME ".dsh" }
New-Item -ItemType Directory -Path (Join-Path $DshHome "profiles") -Force | Out-Null
Copy-Item -Recurse -Force (Join-Path $Src "profiles\cli") (Join-Path $DshHome "profiles\cli")
Write-Host "✓ profile 已安装 → $DshHome\profiles\cli"

# 5. 安装 deepseek 命令
$NodeDir = Split-Path $NodeBin
Copy-Item -Force (Join-Path $Src "bin\deepseek.cmd") $NodeDir
Copy-Item -Force (Join-Path $Src "bin\deepseek.ps1") $NodeDir
Write-Host "✓ 命令已安装 → $NodeDir\deepseek.cmd"

# 6. 清理
Remove-Item $Tmp -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "────────────────────────────────"
Write-Host "✅ 安装完成！新开一个终端，运行 deepseek 开始使用 🐋" -ForegroundColor Green
Write-Host "（首次运行会引导配置 API Key）"
