const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(__dirname, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the entire workspace (needed for monorepo)
config.watchFolders = [workspaceRoot];

// Metro should resolve modules from both mobile and workspace root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Ensure Metro can find packages installed in the mobile workspace
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
