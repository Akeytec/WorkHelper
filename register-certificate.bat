@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "SCRIPT=%~dp0tools\signing\install-workhelper-certificate.ps1"
if not exist "%SCRIPT%" set "SCRIPT=%~dp0install-workhelper-certificate.ps1"

set "CERT=%~dp0WorkHelper-CodeSigning.cer"
if not exist "%CERT%" set "CERT=%~dp0signing-local\WorkHelper-CodeSigning.cer"

echo WorkHelper certificate installer
echo.
echo This step is required only once on each company PC.
echo It trusts the WorkHelper internal code signing certificate for this Windows user.
echo.

if not exist "%SCRIPT%" (
  echo ERROR: install-workhelper-certificate.ps1 was not found.
  echo Put this BAT file together with the release assets, then try again.
  pause
  exit /b 1
)

if not exist "%CERT%" (
  echo ERROR: WorkHelper-CodeSigning.cer was not found.
  echo Download WorkHelper-CodeSigning.cer from the same GitHub Release, then try again.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -CertificatePath "%CERT%"
if errorlevel 1 (
  echo.
  echo ERROR: Certificate installation failed.
  pause
  exit /b 1
)

echo.
echo Done. You can now run the signed WorkHelper installer.
pause
