const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

// 2. Let Metro know where to resolve packages from
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Use real paths for aliases to avoid symlink confusion in pnpm
const resolveRealPath = (name) => {
  try {
    const entry = require.resolve(`${name}/package.json`, { paths: [projectRoot, workspaceRoot] });
    return path.dirname(fs.realpathSync(entry));
  } catch (e) {
    // Fallback to manual path resolution if require.resolve fails
    const manualPath = path.resolve(workspaceRoot, 'node_modules', name);
    return fs.existsSync(manualPath) ? fs.realpathSync(manualPath) : manualPath;
  }
};

config.resolver.extraNodeModules = {
  'expo-modules-core': resolveRealPath('expo-modules-core'),
  'expo': resolveRealPath('expo'),
  'react-native': resolveRealPath('react-native'),
  'react': resolveRealPath('react'),
  'react-dom': resolveRealPath('react-dom'),
  'whatwg-fetch': resolveRealPath('whatwg-fetch'),
  '@radix-ui/react-slot': resolveRealPath('@radix-ui/react-slot'),
  '@babel/runtime': resolveRealPath('@babel/runtime'),
};

// 4. pnpm specific settings
config.resolver.disableHierarchicalLookup = false;
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_enableSymlinks = true;

// 5. Block huge irrelevant folders to speed up resolution
// Using a more surgical regex that works on both macOS and Windows
config.resolver.blockList = [
  /.*[/\\]apps[/\\](?!gaming-mobile[/\\]).+[/\\]node_modules[/\\](?!\.pnpm[/\\]).*/,
  /.*[/\\]apps[/\\]gaming-web[/\\]\.next[/\\]/,
  /[/\\]\.(next|turbo|vercel)[/\\]/,
];

module.exports = config;
