#!/usr/bin/env bash

set -euo pipefail

echo "🔧 EAS Build Pre-Install Hook"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

# Ensure we're in the project root
cd "$(dirname "$0")"

echo "✅ Pre-install hook completed"
