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

// Add dev scripts
scripts['dev:core'] = packageJson.scripts['dev:core'];

// Add dev:ext scripts
extensionsWithRollup.forEach(extension => {
  scripts[`dev:ext:${extension}`] = `rollup -c extensions/${extension}/rollup.config.js -w`;
});

// Generate watch scripts
scripts['watch:extensions'] = `cpx 'extensions/!(${exclusions})/**/{*,.*}' dist/extensions --include-empty-dirs --watch`;
scripts['watch:ext-config'] = packageJson.scripts['watch:ext-config'];

// Generate dev script
const devExtCommands = extensionsWithRollup.map(ext => `dev:ext:${ext}`).join(' ');
scripts['dev'] = `npm run clean && npm-run-all --parallel dev:core ${devExtCommands} watch:extensions watch:ext-config`;

// Keep the remaining script
scripts['start'] = packageJson.scripts.start;
scripts['update-scripts'] = "node scripts/update-scripts.js"

// Update package.json
packageJson.scripts = scripts;

// Write updated package.json
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

console.log('Updated package.json with dynamic extension scripts');