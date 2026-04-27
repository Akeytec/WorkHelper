param(
  [string]$CertificatePath = "",
  [switch]$LocalMachine
)

$ErrorActionPreference = "Stop"

if (-not $CertificatePath) {
  $scriptDir = Split-Path -Parent $PSCommandPath
  $candidates = @(
    (Join-Path $scriptDir "WorkHelper-CodeSigning.cer"),
    (Join-Path $scriptDir "..\..\signing-local\WorkHelper-CodeSigning.cer"),
    (Join-Path (Get-Location) "WorkHelper-CodeSigning.cer")
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      $CertificatePath = (Resolve-Path $candidate).Path
      break
    }
  }
}

if (-not $CertificatePath -or -not (Test-Path $CertificatePath)) {
  throw "Certificate file was not found. Put WorkHelper-CodeSigning.cer next to this script or pass -CertificatePath."
}

$scope = if ($LocalMachine) { "LocalMachine" } else { "CurrentUser" }
$rootStore = "Cert:\$scope\Root"
$publisherStore = "Cert:\$scope\TrustedPublisher"

Write-Host "Installing WorkHelper code signing certificate..."
Write-Host "Certificate: $CertificatePath"
Write-Host "Store scope: $scope"
Write-Host ""

Import-Certificate -FilePath $CertificatePath -CertStoreLocation $rootStore | Out-Null
Import-Certificate -FilePath $CertificatePath -CertStoreLocation $publisherStore | Out-Null

Write-Host "Done."
Write-Host "The certificate was added to:"
Write-Host "- $rootStore"
Write-Host "- $publisherStore"
Write-Host ""
Write-Host "After this, run the signed WorkHelper installer again."
