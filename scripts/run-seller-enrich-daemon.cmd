@echo off
cd /d "%~dp0.."
node scripts/enrich-facebook-sellers.mjs --write --loop --cloud
