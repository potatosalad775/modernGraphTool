#!/usr/bin/env node

import { VersionManager } from './version-manager.js';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

class ReleaseNotesGenerator {
  constructor() {
    this.versionManager = new VersionManager();
  }

  async init() {
    await this.versionManager.init();
  }

  async generateReleaseNotes(additionalNotes = '') {
    const currentDate = new Date().toISOString().split('T')[0];
    const coreVersion = this.versionManager.coreVersion;

    let releaseNotes = `## 📦 Version Information

### Core System

| Component | Version | Core API Level | Release Date |
|-------------|--------|----------------|--------------|
| **modernGraphTool Core** | v${coreVersion} | 1 | ${currentDate} |

### Extensions

Certain extension may require more configuration on installation or update. \\
Please refer to Docs for more info.

| Extension | Version | Min. Core version | Documentation |
|-----------|---------|--------|---------------|
`;

    // Get extensions in a specific order
    const extensionOrder = [
      'equalizer', 'device-peq', 'target-customizer', 'graph-color-wheel',
      'preference-bound', 'frequency-tutorial', 'squiglink-integration', 'template'
    ];

    const extensionData = [];
    for (const [name, info] of this.versionManager.extensions) {
      const metadata = await this.versionManager.extractExtensionMetadata(name);
      extensionData.push({
        name,
        version: info.version,
        minCore: metadata.coreMinVersion || 'unknown'
      });
    }

    // Sort extensions according to the predefined order
    const sortedExtensions = extensionOrder.map(name => 
      extensionData.find(ext => ext.name === name)
    ).filter(Boolean);

    // Add any extensions not in the predefined order
    const remainingExtensions = extensionData.filter(ext => 
      !extensionOrder.includes(ext.name)
    );

    const allExtensions = [...sortedExtensions, ...remainingExtensions];

    // Add extension rows
    for (const ext of allExtensions) {
      const displayName = ext.name.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
      
      releaseNotes += `| **${displayName}** | v${ext.version} | v${ext.minCore} | [📖 Docs](https://potatosalad775.github.io/modernGraphTool/docs/extensions/${ext.name}) |\n`;
    }

    releaseNotes += `
## 📖 Documentation

Complete documentation is available at: https://potatosalad775.github.io/modernGraphTool/docs

- [**Admin Guide**](https://potatosalad775.github.io/modernGraphTool/docs/guide-for-admins/intro)
- [**Extension Documentation**](https://potatosalad775.github.io/modernGraphTool/docs/extensions)`;

    if (additionalNotes) {
      releaseNotes += `

## 📝 Additional Notes

${additionalNotes}`;
    }

    return releaseNotes;
  }

  async saveReleaseNotes(fileName = 'RELEASE_NOTES.md', additionalNotes = '') {
    const releaseNotes = await this.generateReleaseNotes(additionalNotes);
    const filePath = join(PROJECT_ROOT, fileName);
    await writeFile(filePath, releaseNotes, 'utf-8');
    return filePath;
  }

  async previewReleaseNotes(additionalNotes = '') {
    const releaseNotes = await this.generateReleaseNotes(additionalNotes);
    console.log('📝 Release Notes Preview:\n');
    console.log(releaseNotes);
    return releaseNotes;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'preview';
  
  const generator = new ReleaseNotesGenerator();
  await generator.init();

  switch (command) {
    case 'preview':
      await generator.previewReleaseNotes();
      break;
      
    case 'save':
      const fileName = args[1] || 'RELEASE_NOTES.md';
      const additionalNotes = args.slice(2).join(' ');
      const filePath = await generator.saveReleaseNotes(fileName, additionalNotes);
      console.log(`✅ Release notes saved to: ${filePath}`);
      break;
      
    case 'help':
    default:
      console.log(`
🔧 Release Notes Generator

USAGE:
  node scripts/generate-release-notes.js [command] [options]

COMMANDS:
  preview              Preview release notes in console
  save [filename]      Save release notes to file (default: RELEASE_NOTES.md)
  help                 Show this help message

EXAMPLES:
  npm run release:preview
  npm run release:save
  npm run release:save CUSTOM_NOTES.md "Additional release info here"
`);
      break;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ReleaseNotesGenerator };
