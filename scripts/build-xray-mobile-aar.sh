#!/usr/bin/env bash

set -euo pipefail

echo "🔧 Building xraymobile AAR..."

cd "$(dirname "$0")/.."

PACKAGE_DIR="./android/xraymobile"
OUTPUT_DIR="./android/app/libs"
OUTPUT_FILE="$OUTPUT_DIR/xraymobile.aar"

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "❌ Go is not installed"
    exit 1
fi

# Check if gomobile is installed
if ! command -v gomobile &> /dev/null; then
    echo "📦 Installing gomobile..."
    go install golang.org/x/mobile/cmd/gomobile@latest
    go install golang.org/x/mobile/cmd/gobind@latest
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Build AAR
echo "🔨 Building xraymobile..."
cd "$PACKAGE_DIR"

export ANDROID_HOME="${ANDROID_HOME:-/home/expo/Android/Sdk}"
export ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-$ANDROID_HOME/ndk/26.1.10909125}"

go mod tidy
gomobile bind -target=android/arm64 -androidapi 24 -javapkg=com.phoenix.vpn.xray -o="$OUTPUT_FILE" .

echo "✅ xraymobile.aar built successfully: $OUTPUT_FILE"
