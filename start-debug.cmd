@echo off
rem ============================================================
rem  ZCode Cost Meter - foreground launcher for troubleshooting
rem  Portable: uses this script's own directory, and node from PATH.
rem  If node.exe is not in PATH, set ZCODE_COST_METER_NODE to its full path.
rem  Keep this file ASCII-only and save with CRLF line endings.
rem ============================================================
setlocal
cd /d "%~dp0"

set "NODE_EXE=node"
if defined ZCODE_COST_METER_NODE set "NODE_EXE=%ZCODE_COST_METER_NODE%"

"%NODE_EXE%" --version >nul 2>nul
if errorlevel 1 (
  echo [ERROR] node.exe was not found.
  echo         Install Node.js 22.5+ and add it to PATH, or set ZCODE_COST_METER_NODE
  echo         to the full path of node.exe, then run this script again.
  echo.
  pause
  exit /b 1
)

"%NODE_EXE%" orchestrator.mjs
pause
