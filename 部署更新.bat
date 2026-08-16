@echo off
chcp 65001 >nul
cd /d "%~dp0"
set /p msg=更新说明（回车用默认）:
if "%msg%"=="" set msg=更新游戏内容
git add -A
git commit -m "%msg%"
git push
echo.
echo 已推送，GitHub Pages 约 1 分钟后自动更新：
echo https://avatawa.github.io/renshengyibei/
pause
