param(
  [string]$Subject = "CN=WorkHelper Internal Code Signing",
  [int]$Years = 5,
  [string]$OutputDir = "signing-local",
  [string]$CerName = "WorkHelper-CodeSigning.cer",
  [string]$PfxName = "WorkHelper-CodeSigning.pfx"
)

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
  $scriptDir = Split-Path -Parent $PSCommandPath
  return (Resolve-Path (Join-Path $scriptDir "..\..")).Path
}

$repoRoot = Resolve-RepoRoot
$outDir = Join-Path $repoRoot $OutputDir
$cerPath = Join-Path $outDir $CerName
$pfxPath = Join-Path $outDir $PfxName

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Write-Host "Creating a self-signed RSA code signing certificate..."
Write-Host "Subject: $Subject"
Write-Host "Output:  $outDir"
Write-Host ""

$password = Read-Host "Enter a strong password for the PFX private key" -AsSecureString

$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject $Subject `
  -KeyAlgorithm RSA `
  -KeyLength 4096 `
  -HashAlgorithm SHA256 `
  -KeyExportPolicy Exportable `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -NotAfter (Get-Date).AddYears($Years)

Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $password | Out-Null

# Trust the certificate on the signing PC as well, so local signature checks work.
Import-Certificate -FilePath $cerPath -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
Import-Certificate -FilePath $cerPath -CertStoreLocation "Cert:\CurrentUser\TrustedPublisher" | Out-Null

Write-Host ""
Write-Host "Done."
Write-Host "Public certificate: $cerPath"
Write-Host "Private key PFX:     $pfxPath"
Write-Host ""
Write-Host "Keep the PFX and its password private. Never commit them to Git."
