param(
    [switch]$SkipLoginCheck
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Invoke-Npx {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)
    & npx @Args
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: npx $($Args -join ' ')"
    }
}

Write-Host "A7DEV Cloudflare bootstrap"
Write-Host "This creates only the parallel Cloudflare backend."
Write-Host "It does NOT change Supabase, Loader.lua, or any Roblox loadstring."

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is required."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm is required."
}

if (-not $SkipLoginCheck) {
    Write-Host ""
    Write-Host "Checking Cloudflare authentication..."
    Invoke-Npx wrangler whoami
}

Write-Host ""
Write-Host "Installing local Wrangler..."
& npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

Write-Host ""
Write-Host "Checking D1 database..."
$d1Json = & npx wrangler d1 list --json
if ($LASTEXITCODE -ne 0) { throw "Unable to list D1 databases" }
$d1List = $d1Json | ConvertFrom-Json
$db = $d1List | Where-Object { $_.name -eq "a7dev-db" } | Select-Object -First 1

if (-not $db) {
    Write-Host "Creating a7dev-db in Western Europe..."
    Invoke-Npx wrangler d1 create a7dev-db --location weur --binding DB --update-config
    $d1Json = & npx wrangler d1 list --json
    if ($LASTEXITCODE -ne 0) { throw "Unable to refresh D1 list" }
    $d1List = $d1Json | ConvertFrom-Json
    $db = $d1List | Where-Object { $_.name -eq "a7dev-db" } | Select-Object -First 1
}

if (-not $db) { throw "a7dev-db was not found after creation" }

$configPath = Join-Path $PSScriptRoot "wrangler.jsonc"
$configText = Get-Content $configPath -Raw
$configText = $configText -replace '"database_id"\s*:\s*"[^"]+"', ('"database_id": "' + $db.uuid + '"')
Set-Content -Path $configPath -Value $configText -Encoding UTF8

Write-Host ""
Write-Host "Checking R2 bucket..."
$r2Text = (& npx wrangler r2 bucket list 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { throw "Unable to list R2 buckets" }
if ($r2Text -notmatch '(?m)^a7dev-scripts\s*$' -and $r2Text -notmatch 'a7dev-scripts') {
    Write-Host "Creating a7dev-scripts..."
    Invoke-Npx wrangler r2 bucket create a7dev-scripts
}

Write-Host ""
Write-Host "Applying D1 schema..."
Invoke-Npx wrangler d1 execute a7dev-db --remote --file=schema.sql

Write-Host ""
Write-Host "Generating Worker-only secrets..."
$rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
try {
    $sessionBytes = New-Object byte[] 48
    $rng.GetBytes($sessionBytes)
    $sessionSecret = [Convert]::ToBase64String($sessionBytes)

    $apiBytes = New-Object byte[] 32
    $rng.GetBytes($apiBytes)
    $adminApiToken = -join ($apiBytes | ForEach-Object { $_.ToString("x2") })
} finally {
    $rng.Dispose()
}

$secureAdmin = Read-Host "Enter the existing A7DEV admin key locally (not sent to ChatGPT)" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureAdmin)
try {
    $adminPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

$sha = [System.Security.Cryptography.SHA256]::Create()
try {
    $adminHashBytes = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($adminPlain))
    $adminHash = -join ($adminHashBytes | ForEach-Object { $_.ToString("x2") })
} finally {
    $sha.Dispose()
    $adminPlain = $null
}

$secretFile = Join-Path $env:TEMP ("a7dev-cloudflare-secrets-" + [Guid]::NewGuid().ToString("N") + ".json")
@{
    SESSION_SIGNING_KEY = $sessionSecret
    ADMIN_API_TOKEN = $adminApiToken
    ADMIN_KEY_SHA256 = $adminHash
} | ConvertTo-Json | Set-Content -Path $secretFile -Encoding ASCII

try {
    Write-Host ""
    Write-Host "Deploying Worker with encrypted Cloudflare secrets..."
    Invoke-Npx wrangler deploy --secrets-file $secretFile
} finally {
    Remove-Item $secretFile -Force -ErrorAction SilentlyContinue
}

$localTokenPath = Join-Path $PSScriptRoot ".a7dev-admin-api-token"
Set-Content -Path $localTokenPath -Value $adminApiToken -Encoding ASCII

Write-Host ""
Write-Host "Cloudflare staging backend created."
Write-Host "Admin API token was saved locally to:"
Write-Host "  $localTokenPath"
Write-Host "That file is ignored by Git and must not be shared."
Write-Host ""
Write-Host "IMPORTANT: production is NOT switched."
Write-Host "Next step is importing and hash-verifying Supabase scripts/grants before cutover."
