$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$packageDir = Join-Path $root "android\xraymobile"
$outputDir = Join-Path $root "android\app\libs"
$outputFile = Join-Path $outputDir "xraymobile.aar"
$androidSdk = "D:\Android\Sdk"
$androidNdk = "D:\Android\Sdk\ndk\27.1.12297006"

if (!(Test-Path $packageDir)) {
    throw "Missing xraymobile package directory: $packageDir"
}
if (!(Test-Path $androidNdk)) {
    throw "Missing Android NDK directory: $androidNdk"
}

Push-Location $packageDir
try {
    $env:ANDROID_HOME = $androidSdk
    $env:ANDROID_NDK_HOME = $androidNdk
    go mod tidy
    gomobile bind -target=android/arm64 -androidapi 24 "-javapkg=com.phoenix.vpn.xray" "-o=$outputFile" .
} finally {
    Pop-Location
}
