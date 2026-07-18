@echo off
rem Starts the daily CBS NPL service loop (NPL status update -> CBS bulk upload,
rem every 24h). Meant to be run by Windows Task Scheduler at system startup, but
rem can also be run manually from a terminal.
rem Requires: npm run build:worker  (produces dist\worker.cjs)  after every deploy.
cd /d "%~dp0.."
node dist\worker.cjs cbs-npl-upload-service
