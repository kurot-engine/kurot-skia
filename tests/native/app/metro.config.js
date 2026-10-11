const { getDefaultConfig } = require('expo/metro-config');
const { createKurotResolver } = require('@kurot/skia/metro');
const config = getDefaultConfig(__dirname);
config.resolver.resolveRequest = createKurotResolver(__dirname, config.resolver.resolveRequest ?? undefined);
module.exports = config;
