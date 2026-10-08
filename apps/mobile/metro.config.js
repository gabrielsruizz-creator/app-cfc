// O Expo detecta o monorepo pnpm automaticamente (watchFolders e node_modules da raiz).
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
