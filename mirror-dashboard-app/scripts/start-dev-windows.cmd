@echo off
rem Dev launcher for Windows (used by Claude Code preview via .claude/launch.json)
set "PATH=C:\Users\mrsou\AppData\Local\Programs\nodejs;%PATH%"
rem The preview harness injects PORT=5174 for the client; Express must stay on 4174.
set "PORT=4174"
cd /d "%~dp0.."
npm run dev
