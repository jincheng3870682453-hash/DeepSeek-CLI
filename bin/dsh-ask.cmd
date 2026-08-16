@echo off
rem dsh-ask - one-shot question to the DSH headless profile
if "%~1"=="" (
    echo Usage: dsh-ask ^<question...^>
    echo Example: dsh-ask write a python bubble sort
    exit /b 1
)
dsh --profile headless %*
