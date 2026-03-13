$ErrorActionPreference = "Stop"

Write-Host "Building v2ray.aar..." -ForegroundColor Cyan

$root = Split-Path -Parent $PSScriptRoot
$packageDir = Join-Path $root "android\v2ray"
$outputDir = Join-Path $root "android\app\libs"
$outputFile = Join-Path $outputDir "v2ray.aar"

$env:ANDROID_HOME = "D:\Android\Sdk"
$env:ANDROID_NDK_HOME = "D:\Android\Sdk\ndk\27.1.12297006"
$env:GOPATH = "D:\go-workspace"
$env:GOCACHE = "D:\go-cache"
$env:GOMODCACHE = "D:\go-modcache"

if (!(Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

if (!(Test-Path $packageDir)) {
    throw "Missing v2ray package directory: $packageDir"
}

Push-Location $packageDir
try {
    Write-Host "Downloading dependencies..." -ForegroundColor Yellow
    go mod tidy
    
    Write-Host "Building AAR with gomobile..." -ForegroundColor Yellow
    gomobile bind -target=android -androidapi 24 -o "$outputFile" .
    
    if (Test-Path $outputFile) {
        $size = (Get-Item $outputFile).Length / 1MB
        Write-Host "Successfully built v2ray.aar ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
    } else {
        throw "v2ray.aar was not created"
    }
} finally {
    Pop-Location
}
