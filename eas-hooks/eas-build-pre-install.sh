#!/bin/bash
set -e

echo "EAS Pre-Install Hook: Building libbox.aar"

if [ "$EAS_BUILD_PLATFORM" != "android" ]; then
    echo "Skipping libbox build - not Android platform"
    exit 0
fi

echo "Installing Go..."
if ! command -v go &> /dev/null; then
    wget -q https://go.dev/dl/go1.22.0.linux-amd64.tar.gz
    tar -C /usr/local -xzf go1.22.0.linux-amd64.tar.gz
    export PATH=$PATH:/usr/local/go/bin
fi

echo "Installing gomobile..."
go install golang.org/x/mobile/cmd/gomobile@latest
go install golang.org/x/mobile/cmd/gobind@latest
export PATH=$PATH:$(go env GOPATH)/bin
gomobile init

echo "Building libbox.aar..."
OUTPUT_DIR="$EAS_BUILD_WORKINGDIR/android/app/libs"
OUTPUT_FILE="$OUTPUT_DIR/libbox.aar"
TEMP_DIR="/tmp/libbox-build"

mkdir -p "$OUTPUT_DIR"
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

cd "$TEMP_DIR"
git clone --depth 1 --branch main https://github.com/SagerNet/sing-box.git .
go mod download

cd experimental/libbox
go mod download
gomobile bind -target=android/arm64 -androidapi 24 -o "$OUTPUT_FILE" .

if [ -f "$OUTPUT_FILE" ]; then
    SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
    echo "Successfully built libbox.aar ($SIZE)"
    ls -lh "$OUTPUT_FILE"
else
    echo "Error: libbox.aar was not created"
    exit 1
fi

rm -rf "$TEMP_DIR"
echo "libbox.aar build complete"
