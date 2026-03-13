#!/bin/bash
set -e

echo "Building libbox.aar from sing-box source..."

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="$ROOT/android/app/libs"
OUTPUT_FILE="$OUTPUT_DIR/libbox.aar"
TEMP_DIR="$ROOT/temp-libbox-build"

mkdir -p "$OUTPUT_DIR"

if [ -d "$TEMP_DIR" ]; then
    rm -rf "$TEMP_DIR"
fi
mkdir -p "$TEMP_DIR"

cd "$TEMP_DIR"

echo "Cloning sing-box repository..."
git clone --depth 1 https://github.com/SagerNet/sing-box.git .

echo "Building libbox.aar with gomobile..."

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-$ANDROID_HOME/ndk/27.1.12297006}"

go mod download

cd experimental/libbox
go mod download
gomobile bind -target=android/arm64 -androidapi 24 -o "$OUTPUT_FILE" .

if [ -f "$OUTPUT_FILE" ]; then
    SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
    echo "Successfully built libbox.aar ($SIZE)"
else
    echo "Error: libbox.aar was not created"
    exit 1
fi

cd "$ROOT"
rm -rf "$TEMP_DIR"
