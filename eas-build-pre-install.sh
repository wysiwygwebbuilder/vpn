#!/usr/bin/env bash

set -euo pipefail

echo "🔧 EAS Build Pre-Install Hook"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Go version: $(go version || echo 'not installed')"
echo "Working directory: $(pwd)"
echo "Current time: $(date)"

# Ensure we're in the project root
cd "$(dirname "$0")"

# Create libs directory if not exists
echo "📁 Creating libs directory..."
mkdir -p ./android/app/libs

# Check if libbox.aar already exists
LIBBOX_PATH="./android/app/libs/libbox.aar"
echo "🔍 Checking for libbox.aar at $LIBBOX_PATH..."

if [ -f "$LIBBOX_PATH" ]; then
    SIZE=$(stat -c%s "$LIBBOX_PATH" 2>/dev/null || echo "0")
    if [ "$SIZE" -gt 1000000 ]; then
        echo "✅ libbox.aar already exists ($(echo "scale=2; $SIZE/1024/1024" | bc 2>/dev/null || echo "unknown") MB)"
        echo "✅ Skipping build, using existing file"
        echo "📊 Final state of android/app/libs:"
        ls -lh ./android/app/libs/ || true
        echo "✅ Pre-install hook completed successfully"
        exit 0
    else
        echo "⚠️  libbox.aar exists but too small ($SIZE bytes), will rebuild"
        rm -f "$LIBBOX_PATH"
    fi
fi

# Install Go if not available
if ! command -v go &> /dev/null; then
    echo "📦 Installing Go..."
    cd /tmp
    curl -L -o go1.23.0.linux-amd64.tar.gz https://go.dev/dl/go1.23.0.linux-amd64.tar.gz
    rm -rf /usr/local/go && tar -C /usr/local -xzf go1.23.0.linux-amd64.tar.gz
    export PATH=$PATH:/usr/local/go/bin
    echo "✅ Go installed"
fi

# Install gomobile
echo "📦 Installing gomobile..."
export GOPATH=/tmp/go
export PATH=$PATH:$GOPATH/bin
go install golang.org/x/mobile/cmd/gomobile@latest
go install golang.org/x/mobile/cmd/gobind@latest
gomobile init
echo "✅ gomobile installed"

# Clone sing-box-libbox if not exists
LIBBOX_SRC="/tmp/sing-box-libbox"
if [ ! -d "$LIBBOX_SRC" ]; then
    echo "📦 Cloning sing-box-libbox repository..."
    git clone --depth 1 https://github.com/getlantern/sing-box-libbox.git "$LIBBOX_SRC"
    echo "✅ Repository cloned"
else
    echo "✅ Repository already exists"
fi

# Build libbox.aar
echo "🔨 Building libbox.aar for Android (this takes 15-30 minutes)..."
cd "$LIBBOX_SRC"

# Get dependencies first
echo "📦 Downloading Go dependencies..."
go mod tidy

# Build with gomobile
echo "🏗️  Compiling libbox.aar..."
gomobile bind -v -target android -androidapi 21 -javapkg io.nekohasekai -o /tmp/libbox.aar -trimpath -tags "with_gvisor,with_quic,with_wireguard,with_utls,with_clash_api,with_tailscale" ./experimental/libbox

if [ -f /tmp/libbox.aar ]; then
    SIZE=$(stat -c%s /tmp/libbox.aar)
    echo "✅ libbox.aar built successfully ($(echo "scale=2; $SIZE/1024/1024" | bc 2>/dev/null || echo "unknown") MB)"
    
    # Copy to project
    cp /tmp/libbox.aar "$LIBBOX_PATH"
    echo "✅ libbox.aar copied to $LIBBOX_PATH"
else
    echo "❌ ERROR: libbox.aar was not created"
    ls -la /tmp/*.aar || true
    exit 1
fi

# Verify libbox.aar contains required classes
echo "🔍 Verifying libbox.aar contents..."
if command -v unzip &> /dev/null; then
    if unzip -l "$LIBBOX_PATH" 2>/dev/null | grep -q "classes.jar"; then
        echo "✅ libbox.aar verified (contains Java classes)"
        
        # Check for CommandServer class
        if unzip -l "$LIBBOX_PATH" 2>/dev/null | grep -q "CommandServer"; then
            echo "✅ libbox.aar contains CommandServer API"
        else
            echo "⚠️  Warning: CommandServer not found in AAR"
        fi
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
