#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const extensionsDir = path.join(rootDir, 'extensions');
const packageJsonPath = path.join(rootDir, 'package.json');

// Read package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Find all extensions with rollup.config.js
const extensionsWithRollup = [];
const allExtensions = fs.readdirSync(extensionsDir).filter(file => {
  const stat = fs.statSync(path.join(extensionsDir, file));
  return stat.isDirectory() && file !== 'template';
});

for (const extension of allExtensions) {
  const rollupConfigPath = path.join(extensionsDir, extension, 'rollup.config.js');
  if (fs.existsSync(rollupConfigPath)) {
    extensionsWithRollup.push(extension);
  }
}

console.log('Found extensions with rollup configs:', extensionsWithRollup);

// Generate build scripts
const scripts = {
  'clean': packageJson.scripts.clean,
  'build:core': packageJson.scripts['build:core'],
};

// Add build:ext scripts
extensionsWithRollup.forEach(extension => {
  scripts[`build:ext:${extension}`] = `rollup -c extensions/${extension}/rollup.config.js`;
});

// Generate copy:extensions script with exclusions
const exclusions = extensionsWithRollup.join('|');
scripts['copy:extensions'] = `cpx 'extensions/!(${exclusions})/**/{*,.*}' dist/extensions --include-empty-dirs && cpx 'extensions/extensions.config.js' dist/extensions`;

// Generate build script
const buildExtCommands = extensionsWithRollup.map(ext => `npm run build:ext:${ext}`).join(' && ');
scripts['build'] = `npm run clean && npm run build:core && ${buildExtCommands} && npm run copy:extensions`;

// Add watch scripts for new structure
scripts['watch:core'] = packageJson.scripts['watch:core'] || `rollup -c rollup.config.js -w`;

// Add watch:ext scripts
extensionsWithRollup.forEach(extension => {
  scripts[`watch:ext:${extension}`] = `rollup -c extensions/${extension}/rollup.config.js -w`;
});

// Generate watch scripts
scripts['watch:extensions'] = `cpx 'extensions/!(${exclusions})/**/{*,.*}' dist/extensions --include-empty-dirs --watch`;
scripts['watch:ext-config'] = packageJson.scripts['watch:ext-config'] || `cpx 'extensions/extensions.config.js' dist/extensions --watch`;

// Generate concurrently commands
const watchExtNames = extensionsWithRollup.map(ext => ext.replace('-', '')); // Remove hyphens for concurrently names
const watchExtCommands = extensionsWithRollup.map(ext => `npm:watch:ext:${ext}`);
const allWatchCommands = ['npm:watch:core', ...watchExtCommands, 'npm:watch:extensions', 'npm:watch:ext-config'];
const allWatchNames = ['core', ...watchExtNames, 'extensions', 'config'];

scripts['watch:all'] = `npm run clean && concurrently --prefix-colors "cyan,magenta,green,yellow,blue,red,gray" --prefix "[{name}]" --names "${allWatchNames.join(',')}" ${allWatchCommands.map(cmd => `"${cmd}"`).join(' ')}`;

// Development scripts
scripts['serve'] = packageJson.scripts.serve || `web-dev-server --node-resolve --open --watch --root-dir dist --app-index dist/index.html`;
scripts['dev:simple'] = `concurrently --prefix-colors "cyan,white" --prefix "[{name}]" --names "build,server" "npm:watch:all" "npm:serve"`;
scripts['dev:build'] = `npm run watch:all`;
scripts['start'] = `npm run serve`;
scripts['preview'] = `npm run build && npm run serve`;

// Keep the utility script
scripts['update-scripts'] = "node scripts/update-scripts.js";

// Preserve any custom scripts that don't conflict with generated ones
const preservedScripts = ['dev', 'dev:simple'];
preservedScripts.forEach(scriptName => {
  if (packageJson.scripts[scriptName]) {
    scripts[scriptName] = packageJson.scripts[scriptName];
  }
});

// Update package.json
packageJson.scripts = scripts;

// Write updated package.json
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

console.log('Updated package.json with dynamic extension scripts');