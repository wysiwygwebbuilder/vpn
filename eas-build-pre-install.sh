#!/usr/bin/env bash

set -euo pipefail

echo "🔧 EAS Build Pre-Install Hook"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Working directory: $(pwd)"
echo "Current time: $(date)"

# Ensure we're in the project root
cd "$(dirname "$0")"

# Create libs directory if not exists
echo "📁 Creating libs directory..."
mkdir -p ./android/app/libs

# Download libbox.aar if not exists
LIBBOX_PATH="./android/app/libs/libbox.aar"
echo "🔍 Checking for libbox.aar at $LIBBOX_PATH..."

if [ -f "$LIBBOX_PATH" ]; then
    SIZE=$(stat -f%z "$LIBBOX_PATH" 2>/dev/null || stat -c%s "$LIBBOX_PATH" 2>/dev/null || echo "0")
    if [ "$SIZE" -gt 1000000 ]; then
        echo "✅ libbox.aar already exists ($(echo "scale=2; $SIZE/1024/1024" | bc 2>/dev/null || echo "unknown") MB)"
    else
        echo "⚠️  libbox.aar exists but too small ($SIZE bytes), redownloading..."
        rm -f "$LIBBOX_PATH"
    fi
else
    echo "❌ libbox.aar not found, will download"
fi

if [ ! -f "$LIBBOX_PATH" ]; then
    echo "📦 Downloading libbox.aar (61 MB) from GitHub..."
    echo "   URL: https://raw.githubusercontent.com/xinggaoya/sing-box-windows-android/master/app/libs/libbox.aar"
    
    if curl -L -o "$LIBBOX_PATH" "https://raw.githubusercontent.com/xinggaoya/sing-box-windows-android/master/app/libs/libbox.aar"; then
        SIZE=$(stat -c%s "$LIBBOX_PATH" 2>/dev/null || stat -f%z "$LIBBOX_PATH" 2>/dev/null || echo "0")
        echo "✅ libbox.aar downloaded successfully ($(echo "scale=2; $SIZE/1024/1024" | bc 2>/dev/null || echo "unknown") MB)"
    else
        echo "❌ ERROR: Failed to download libbox.aar (curl exit code: $?)"
        ls -la ./android/app/libs/ || true
        exit 1
    fi
fi

# Verify libbox.aar contains required classes
echo "🔍 Verifying libbox.aar contents..."
if command -v unzip &> /dev/null; then
    if unzip -l "$LIBBOX_PATH" 2>/dev/null | grep -q "classes.jar"; then
        echo "✅ libbox.aar verified (contains Java classes)"
    else
        echo "❌ ERROR: libbox.aar is corrupted (missing classes.jar)"
        echo "   Contents of AAR:"
        unzip -l "$LIBBOX_PATH" 2>/dev/null || true
        exit 1
    fi
else
    echo "⚠️  unzip not available, skipping verification"
fi

# List final state
echo "📊 Final state of android/app/libs:"
ls -lh ./android/app/libs/ || true

echo "✅ Pre-install hook completed successfully"
