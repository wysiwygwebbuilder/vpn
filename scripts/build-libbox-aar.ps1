$ErrorActionPreference = "Stop"

Write-Host "Building libbox.aar from sing-box source..." -ForegroundColor Cyan

$root = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $root "android\app\libs"
$outputFile = Join-Path $outputDir "libbox.aar"
$tempDir = "D:\temp-libbox-build"

if (!(Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

if (Test-Path $tempDir) {
    Remove-Item -Recurse -Force $tempDir
}
New-Item -ItemType Directory -Path $tempDir | Out-Null

try {
    Push-Location $tempDir
    
    Write-Host "Cloning sing-box repository..." -ForegroundColor Yellow
    git clone --depth 1 https://github.com/SagerNet/sing-box.git .
    
    Write-Host "Building libbox.aar with gomobile..." -ForegroundColor Yellow
    
    $env:ANDROID_HOME = "D:\Android\Sdk"
    $env:ANDROID_NDK_HOME = "D:\Android\Sdk\ndk\27.1.12297006"
    $env:GOPATH = "D:\go-workspace"
    $env:GOCACHE = "D:\go-cache"
    $env:GOMODCACHE = "D:\go-modcache"
    
    Push-Location "experimental\libbox"
    go mod tidy
    gomobile bind -target=android -androidapi 24 -o "$outputFile" .
    Pop-Location
    
    if (Test-Path $outputFile) {
        $size = (Get-Item $outputFile).Length / 1MB
        Write-Host "Successfully built libbox.aar ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
    } else {
        throw "libbox.aar was not created"
    }
    
} finally {
    Pop-Location
    if (Test-Path $tempDir) {
        Remove-Item -Recurse -Force $tempDir
    }
}
