@echo off
rem DeepSeek CLI 一键安装脚本
setlocal
set "DSH_HOME_DIR=%USERPROFILE%\.dsh"
if defined DSH_HOME set "DSH_HOME_DIR=%DSH_HOME%"

echo ============================================
echo  DeepSeek CLI 安装
echo ============================================
echo.
echo 目标 DSH 目录: %DSH_HOME_DIR%
echo.

rem 1. 复制 cli profile
if not exist "%DSH_HOME_DIR%\profiles" (
    echo [错误] 未找到 DSH 安装（%DSH_HOME_DIR%\profiles 不存在）
    echo 请先安装 DeepSeek Harness，再运行本脚本
    pause
    exit /b 1
)
echo [1/2] 复制 cli profile ...
xcopy /E /I /Y "%~dp0profiles\cli" "%DSH_HOME_DIR%\profiles\cli" > nul
if errorlevel 1 (
    echo [错误] 复制 profile 失败
    pause
    exit /b 1
)
echo       完成.

rem 2. 提示复制 bin 命令
echo [2/2] 请把 bin 目录下的 deepseek.cmd / deepseek.ps1 复制到
echo       PATH 中的目录（例如 node 全局目录），然后新开 cmd 窗口，
echo       输入 deepseek 即可启动。
echo.

echo 安装完成！新开终端输入 deepseek 试试吧。
pause
