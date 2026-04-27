@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "DRYRUN="
if /I "%~1"=="--dry-run" set "DRYRUN=1"

echo WorkHelper commit and push helper
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: Git was not found.
  echo Install Git for Windows, then try again.
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo ERROR: This folder is not a Git repository.
  pause
  exit /b 1
)

for /f "delims=" %%B in ('git branch --show-current 2^>nul') do set "BRANCH=%%B"
if not defined BRANCH (
  echo ERROR: Could not detect the current branch.
  pause
  exit /b 1
)

echo Current branch: !BRANCH!
echo.
echo Changed files:
git status --short
if errorlevel 1 goto fail

git diff --quiet
set "UNSTAGED=%ERRORLEVEL%"
git diff --cached --quiet
set "STAGED=%ERRORLEVEL%"

if "%UNSTAGED%%STAGED%"=="00" (
  echo.
  echo No changes to commit.
  pause
  exit /b 0
)

if defined DRYRUN (
  echo.
  echo Dry run finished. No files were changed.
  exit /b 0
)

echo.
set /p "MSG=Commit message (English recommended): "
if "%MSG%"=="" (
  echo ERROR: Commit message is required.
  pause
  exit /b 1
)

echo.
echo This will run:
echo   git add -A
echo   git commit -m "%MSG%"
echo   git push -u origin !BRANCH!
echo.
choice /M "Continue"
if errorlevel 2 (
  echo Cancelled.
  pause
  exit /b 0
)

git add -A
if errorlevel 1 goto fail

git commit -m "%MSG%"
if errorlevel 1 goto fail

git push -u origin !BRANCH!
if errorlevel 1 goto fail

echo.
echo Done.
pause
exit /b 0

:fail
echo.
echo ERROR: Command failed. Check the message above.
pause
exit /b 1
