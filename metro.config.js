const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Optimization: Faster resolution and caching
config.resolver.unstable_enablePackageExports = true;

// Enable caching for faster rebuilds
config.cacheVersion = 'v1';

module.exports = withNativeWind(config, { input: './src/global.css' });
