// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ignore static export output so Metro doesn't watch/remove stale dist assets
// Only block the project's own dist folder, not dist folders inside node_modules
const distDir = path.resolve(__dirname, 'dist').replace(/[\\]/g, '\\\\');
config.resolver.blockList = [new RegExp(`^${distDir}[\\\\/]`)];

// Enable CSS support for web
config.resolver.sourceExts.push('css');

// Improve resolution for web compatibility
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    // Handle any web-specific module resolutions here if needed
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
