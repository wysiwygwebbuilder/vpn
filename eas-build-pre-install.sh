#!/usr/bin/env bash

set -euo pipefail

echo "🔧 EAS Build Pre-Install Hook"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

# Ensure we're in the project root
cd "$(dirname "$0")"

# Create libs directory if not exists
mkdir -p ./android/app/libs

# Download libbox.aar if not exists
LIBBOX_PATH="./android/app/libs/libbox.aar"
if [ -f "$LIBBOX_PATH" ]; then
    SIZE=$(stat -f%z "$LIBBOX_PATH" 2>/dev/null || stat -c%s "$LIBBOX_PATH" 2>/dev/null || echo "0")
    if [ "$SIZE" -gt 1000000 ]; then
        echo "✅ libbox.aar already exists ($(echo "scale=2; $SIZE/1024/1024" | bc) MB)"
    else
        echo "⚠️  libbox.aar exists but too small, redownloading..."
        rm -f "$LIBBOX_PATH"
    fi
fi

if [ ! -f "$LIBBOX_PATH" ]; then
    echo "📦 Downloading libbox.aar (61 MB)..."
    curl -L -o "$LIBBOX_PATH" "https://raw.githubusercontent.com/xinggaoya/sing-box-windows-android/master/app/libs/libbox.aar"
    
    if [ -f "$LIBBOX_PATH" ]; then
        SIZE=$(stat -f%z "$LIBBOX_PATH" 2>/dev/null || stat -c%s "$LIBBOX_PATH" 2>/dev/null || echo "0")
        echo "✅ libbox.aar downloaded ($(echo "scale=2; $SIZE/1024/1024" | bc) MB)"
    else
        echo "❌ ERROR: Failed to download libbox.aar"
        exit 1
    fi
fi

# Verify libbox.aar contains required classes
if unzip -l "$LIBBOX_PATH" | grep -q "classes.jar"; then
    echo "✅ libbox.aar verified (contains Java classes)"
else
    echo "❌ ERROR: libbox.aar is corrupted (missing classes.jar)"
    exit 1
fi

echo "✅ Pre-install hook completed"
