@echo off
rem Starts the CBS NPL retry sweep loop (re-attempts FAILED credit notifications
rem every 5 minutes, for credits the CBS balance snapshot had not caught up with
rem at notification time). Meant to be run by Windows Task Scheduler at system
rem startup, but can also be run manually from a terminal.
rem Requires: npm run build:worker  (produces dist\worker.cjs)  after every deploy.
cd /d "%~dp0.."
node dist\worker.cjs cbs-npl-retry-service
