#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate patch.bat in GBK + CRLF (the only reliable encoding for Chinese .bat on cmd)."""
content = r"""@echo off
setlocal EnableExtensions

rem ============================================================
rem patch.bat - Typora (Windows x64) 一键补丁
rem 用法: 双击运行, 或命令行: patch.bat [Typora安装目录]
rem 需求: 本目录下有 patch_typora.js 与 patch_main.js; 机器上有 Node.js
rem ============================================================

set "SCRIPT_DIR=%~dp0"
set "NODE_EXE="
set "TYPORA_DIR="

rem ---------- 1. 定位 node.exe ----------
echo [1/4] 查找 Node.js ...
where node >nul 2>nul && set "NODE_EXE=node"
if defined NODE_EXE goto found_node

if exist "%ProgramFiles%\nodejs\node.exe" (
  set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
  goto found_node
)
if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
  set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
  goto found_node
)

rem 注册表 (Node.js 官方安装器写入)
for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\Node.js" /v InstallPath 2^>nul ^| findstr /i InstallPath') do (
  if exist "%%B\node.exe" set "NODE_EXE=%%B\node.exe"
)
if not defined NODE_EXE for /f "tokens=2,*" %%A in ('reg query "HKCU\SOFTWARE\Node.js" /v InstallPath 2^>nul ^| findstr /i InstallPath') do (
  if exist "%%B\node.exe" set "NODE_EXE=%%B\node.exe"
)
if defined NODE_EXE goto found_node

rem 常见 nvm 目录扫描
for /d %%D in ("%APPDATA%\nvm\*") do (
  if exist "%%D\node.exe" set "NODE_EXE=%%D\node.exe"
)

:found_node
if not defined NODE_EXE (
  echo.
  echo [错误] 未找到 Node.js。请先安装 Node.js 后重试,
  echo         或把 node.exe 所在目录加入 PATH。
  echo.
  pause
  exit /b 1
)
echo        使用: %NODE_EXE%

rem ---------- 2. 定位 Typora 安装目录 ----------
echo [2/4] 查找 Typora ...
if not "%~1"=="" (
  set "TYPORA_DIR=%~1"
  goto check_typora
)
for %%P in ("%ProgramFiles%\Typora" "%ProgramFiles(x86)%\Typora" "%LocalAppData%\Programs\Typora" "D:\Typora" "C:\Typora") do (
  if exist "%%~P\Typora.exe" (
    set "TYPORA_DIR=%%~P"
    goto found_typora
  )
)
echo        未自动找到, 请手动指定。
set /p "TYPORA_DIR=        输入 Typora 安装目录 (含 Typora.exe 的文件夹): "
set "TYPORA_DIR=%TYPORA_DIR:"=%"

:check_typora
if not defined TYPORA_DIR (
  echo [错误] 未提供安装目录。
  pause
  exit /b 1
)
if not exist "%TYPORA_DIR%\Typora.exe" (
  echo [错误] "%TYPORA_DIR%" 下没有 Typora.exe。
  pause
  exit /b 1
)
:found_typora
echo        Typora: %TYPORA_DIR%

rem ---------- 3. 关闭正在运行的 Typora ----------
echo [3/4] 关闭正在运行的 Typora ...
taskkill /f /im Typora.exe >nul 2>nul
timeout /t 1 /nobreak >nul

rem ---------- 4. 应用补丁 ----------
echo [4/4] 应用补丁 ...
if not exist "%SCRIPT_DIR%patch_typora.js" (
  echo [错误] 缺少 patch_typora.js, 它须与本 bat 同目录。
  pause
  exit /b 1
)
if not exist "%SCRIPT_DIR%patch_main.js" (
  echo [错误] 缺少 patch_main.js, 它须与本 bat 同目录。
  pause
  exit /b 1
)
"%NODE_EXE%" "%SCRIPT_DIR%patch_typora.js" "%TYPORA_DIR%"
if errorlevel 1 (
  echo.
  echo [失败] 补丁未完成, 请查看上方报错信息。
  echo.
  pause
  exit /b 1
)

echo.
echo [完成] 补丁已应用, 正在启动 Typora ...
start "" "%TYPORA_DIR%\Typora.exe"
echo.
echo 如需还原: 使用安装目录里的 Typora.exe.backup.* 与 resources\app.asar.backup.*
echo 详见 Typora_1.14.9_Patch_Guide.md
pause
"""

import sys
out = sys.argv[1] if len(sys.argv) > 1 else "patch.bat"
with open(out, "w", encoding="gbk", newline="\r\n") as f:
    f.write(content)
print("written", out, "gbk+crlf", len(content), "chars")
