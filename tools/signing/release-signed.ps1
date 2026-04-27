param(
  [string]$Repository = "Akeytec/WorkHelper",
  [string]$PfxPath = "signing-local\WorkHelper-CodeSigning.pfx",
  [string]$CertificatePath = "signing-local\WorkHelper-CodeSigning.cer",
  [string]$Tag = "",
  [string]$ReleaseName = "",
  [switch]$Draft
)

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
  $scriptDir = Split-Path -Parent $PSCommandPath
  return (Resolve-Path (Join-Path $scriptDir "..\..")).Path
}

function Get-PlainText {
  param([securestring]$SecureValue)
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Invoke-GitHubJson {
  param(
    [string]$Method,
    [string]$Uri,
    [object]$Body = $null
  )
  $headers = @{
    Authorization = "Bearer $env:GH_TOKEN"
    Accept = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
  }
  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers
  }
  return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -Body ($Body | ConvertTo-Json -Depth 10) -ContentType "application/json"
}

function Send-ReleaseAsset {
  param(
    [int]$ReleaseId,
    [string]$Path
  )
  if (-not (Test-Path $Path)) {
    throw "Release asset not found: $Path"
  }
  $name = [uri]::EscapeDataString((Split-Path -Leaf $Path))
  $uri = "https://uploads.github.com/repos/$Repository/releases/$ReleaseId/assets?name=$name"
  $headers = @{
    Authorization = "Bearer $env:GH_TOKEN"
    Accept = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
  }
  Write-Host "Uploading asset: $Path"
  Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType "application/octet-stream" -InFile $Path | Out-Null
}

$repoRoot = Resolve-RepoRoot
Set-Location $repoRoot

if (-not $env:GH_TOKEN) {
  throw "GH_TOKEN is not set. Create a GitHub token with repo release permissions, then set `$env:GH_TOKEN."
}

$package = Get-Content -Raw -Path "package.json" | ConvertFrom-Json
$version = [string]$package.version
if (-not $version) {
  throw "package.json version was not found."
}
if (-not $Tag) {
  $Tag = "v$version"
}
if (-not $ReleaseName) {
  $ReleaseName = $version
}

$gitStatus = git status --short
if ($gitStatus) {
  throw "Working tree is not clean. Commit or stash changes before creating a signed release."
}

if (git tag --list $Tag) {
  throw "Tag already exists locally: $Tag"
}

$resolvedPfx = (Resolve-Path $PfxPath).Path
$resolvedCert = (Resolve-Path $CertificatePath).Path
$password = Read-Host "Enter the PFX password for $resolvedPfx" -AsSecureString
$plainPassword = Get-PlainText $password

try {
  $env:CSC_LINK = $resolvedPfx
  $env:CSC_KEY_PASSWORD = $plainPassword

  if (-not (Test-Path "node_modules")) {
    npm ci
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }

  if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
  }

  npx electron-builder --win --publish never
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  $env:CSC_LINK = $null
  $env:CSC_KEY_PASSWORD = $null
  $plainPassword = $null
}

$installer = Join-Path $repoRoot "dist\WorkHelper-Setup-$version.exe"
$blockmap = "$installer.blockmap"
$latest = Join-Path $repoRoot "dist\latest.yml"
$certSetupDir = Join-Path $repoRoot "dist\WorkHelper-Certificate-Setup"
$certSetupZip = Join-Path $repoRoot "dist\WorkHelper-Certificate-Setup.zip"

foreach ($asset in @($installer, $blockmap, $latest)) {
  if (-not (Test-Path $asset)) {
    throw "Expected build artifact was not found: $asset"
  }
}

$signature = Get-AuthenticodeSignature -FilePath $installer
Write-Host "Installer signature status: $($signature.Status)"
if ($signature.Status -ne "Valid") {
  throw "Installer signature is not valid. Check that the certificate is trusted on this PC."
}

if (Test-Path $certSetupDir) {
  Remove-Item -Recurse -Force $certSetupDir
}
New-Item -ItemType Directory -Force -Path $certSetupDir | Out-Null
Copy-Item -Path $resolvedCert -Destination (Join-Path $certSetupDir "WorkHelper-CodeSigning.cer") -Force
Copy-Item -Path (Join-Path $repoRoot "証明書を登録.bat") -Destination (Join-Path $certSetupDir "証明書を登録.bat") -Force
Copy-Item -Path (Join-Path $repoRoot "tools\signing\install-workhelper-certificate.ps1") -Destination (Join-Path $certSetupDir "install-workhelper-certificate.ps1") -Force
if (Test-Path $certSetupZip) {
  Remove-Item -Force $certSetupZip
}
Compress-Archive -Path (Join-Path $certSetupDir "*") -DestinationPath $certSetupZip -Force

git tag $Tag
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git push origin $Tag
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$releaseBody = @"
Signed WorkHelper release.

Install the WorkHelper internal certificate once on each company PC before running the installer.
"@

$release = Invoke-GitHubJson -Method Post -Uri "https://api.github.com/repos/$Repository/releases" -Body @{
  tag_name = $Tag
  name = $ReleaseName
  body = $releaseBody
  draft = [bool]$Draft
  prerelease = $false
  make_latest = "true"
}

Send-ReleaseAsset -ReleaseId $release.id -Path $installer
Send-ReleaseAsset -ReleaseId $release.id -Path $blockmap
Send-ReleaseAsset -ReleaseId $release.id -Path $latest
Send-ReleaseAsset -ReleaseId $release.id -Path $certSetupZip
Send-ReleaseAsset -ReleaseId $release.id -Path $resolvedCert
Send-ReleaseAsset -ReleaseId $release.id -Path (Join-Path $repoRoot "証明書を登録.bat")
Send-ReleaseAsset -ReleaseId $release.id -Path (Join-Path $repoRoot "tools\signing\install-workhelper-certificate.ps1")

Write-Host ""
Write-Host "Signed release published:"
Write-Host $release.html_url
