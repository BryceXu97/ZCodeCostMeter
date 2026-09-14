@echo off
setlocal
chcp 936 >nul

rem ============================================================
rem  ZCode 费用统计 - 桌面快捷方式生成器
rem  作用：在当前用户桌面创建/刷新一个快捷方式，双击该快捷方式即运行
rem        本目录下的 launcher.vbs（由 Windows 脚本宿主 WScript 执行）。
rem  要求：本文件必须与 launcher.vbs 放在同一目录；可反复运行（幂等）。
rem  说明：本文件以 GBK(936) 编码保存，修改后请保持该编码，否则中文乱码。
rem ============================================================

rem ---------------- 可调参数 ----------------------------------
rem 1) 快捷方式显示名称（想改名只改这一行）
set "LNK_NAME=ZCode 增强版（费用+提示词）"
rem 2) 快捷方式图标（exe 或 ico 均可；留空则用系统默认脚本图标）
set "LNK_ICON=%ProgramFiles%\ZCode\ZCode.exe"
rem 3) 快捷方式备注（鼠标悬停时显示）
set "LNK_DESC=启动 ZCode，并注入费用统计侧栏与一键提示词增强按钮"
rem 4) 启动方式：vbs     = 直接指向 launcher.vbs（与已有快捷方式一致）
rem              wscript = 指向 wscript.exe，launcher.vbs 作为参数（更保险）
set "LNK_MODE=vbs"
rem 5) 生成位置（留空 = 当前用户桌面，即默认行为）
set "LNK_DIR="
rem -----------------------------------------------------------

rem 归一化程序目录：去掉 %~dp0 末尾的反斜杠
set "APPDIR=%~dp0"
if "%APPDIR:~-1%"=="\" set "APPDIR=%APPDIR:~0,-1%"

echo.
echo  程序目录 : %APPDIR%
echo  快捷名称 : %LNK_NAME%
echo.

if not exist "%APPDIR%\launcher.vbs" (
  echo  [错误] 本目录下找不到 launcher.vbs，已中止。
  echo.
  pause
  exit /b 1
)

rem 取桌面路径（用于检测是否已存在同名快捷方式）
if not defined LNK_DIR (
  set "DESK="
  for /f "delims=" %%I in ('powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"') do set "DESK=%%I"
) else (
  set "DESK=%LNK_DIR%"
)

if defined DESK if exist "%DESK%\%LNK_NAME%.lnk" (
  choice /c YN /n /m "  桌面已存在“%LNK_NAME%”，是否覆盖？[Y/N] "
  if errorlevel 2 (
    echo   已取消，未做任何修改。
    echo.
    pause
    exit /b 0
  )
)

echo  正在创建快捷方式 ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop';$d=$env:APPDIR;$vbs=Join-Path $d 'launcher.vbs';if(-not (Test-Path $vbs)){Write-Host '[FAIL] missing launcher.vbs';exit 1};$w=Join-Path $env:SystemRoot 'System32\wscript.exe';$desk=$env:LNK_DIR;if([string]::IsNullOrWhiteSpace($desk)){$desk=[Environment]::GetFolderPath('Desktop')};if(-not (Test-Path $desk)){$null=New-Item -ItemType Directory -Path $desk -Force};$q=[char]34;$lnk=Join-Path $desk ($env:LNK_NAME+'.lnk');$sh=New-Object -ComObject WScript.Shell;$s=$sh.CreateShortcut($lnk);if($env:LNK_MODE -eq 'wscript'){$s.TargetPath=$w;$s.Arguments=$q+$vbs+$q}else{$s.TargetPath=$vbs;$s.Arguments=''};$s.WorkingDirectory=$d;$s.Description=$env:LNK_DESC;$ic=$env:LNK_ICON;if($ic -and (Test-Path $ic)){$s.IconLocation=$ic+',0'}else{$s.IconLocation=$w+',0'};$s.Save();if(Test-Path $lnk){Write-Host ('[OK] '+$lnk)}else{Write-Host '[FAIL] not created';exit 1}"

if errorlevel 1 (
  echo.
  echo  [错误] 快捷方式创建失败，请查看上面的提示。
  echo.
  pause
  exit /b 1
)

echo.
echo  完成。双击桌面上的“%LNK_NAME%”即可启动。
echo.
pause
exit /b 0
