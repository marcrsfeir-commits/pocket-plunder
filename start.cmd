@echo off
rem Pocket Plunder - starts the local game server and opens it in your browser.
cd /d "%~dp0"
start "" http://localhost:8795
node server.js
