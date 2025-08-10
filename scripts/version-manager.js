#!/usr/bin/env node

import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Configuration for version management
const VERSION_CONFIG = {
  // Core version source
  CORE_VERSION_SOURCE: 'package.json',
  
  // Files that need core version updates
  CORE_FILES: [
    'src/core-api.js'
  ],
  
  // Extension directories to scan
  EXTENSIONS_DIR: 'extensions',
  
  // Documentation directories to update
  DOCS_DIRS: [
    'docs/docs/extensions',
    'docs/i18n/ko/docusaurus-plugin-content-docs/current/extensions'
  ],
  
  // Default extension version increment
  DEFAULT_VERSION_INCREMENT: 'patch' // major, minor, patch
};

class VersionManager {
  constructor() {
    this.coreVersion = null;
    this.extensions = new Map();
    this.verbose = false;
  }

  async init() {
    // Load current core version from package.json
    const packageJson = await this.readJsonFile(join(PROJECT_ROOT, 'package.json'));
    this.coreVersion = packageJson.version;
    
    // Load release date from core-api.js
    this.coreReleaseDate = await this.getCoreReleaseDate();
    
    this.log(`📦 Current core version: ${this.coreVersion}`);
    this.log(`📅 Core release date: ${this.coreReleaseDate}`);
    
    // Scan extensions
    await this.scanExtensions();
  }

  async getCoreReleaseDate() {
    try {
      const coreApiPath = join(PROJECT_ROOT, 'src/core-api.js');
      const content = await readFile(coreApiPath, 'utf-8');
      
      const releaseDateMatch = content.match(/RELEASE_DATE:\s*['"`]([^'"`]+)['"`]/);
      return releaseDateMatch ? releaseDateMatch[1] : new Date().toISOString().split('T')[0];
    } catch (error) {
      this.log(`⚠️  Could not read release date from core-api.js: ${error.message}`);
      return new Date().toISOString().split('T')[0];
    }
  }

  async scanExtensions() {
    const extensionsDir = join(PROJECT_ROOT, VERSION_CONFIG.EXTENSIONS_DIR);
    const entries = await readdir(extensionsDir, { withFileTypes: true });
    const extensionDirs = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name);

    for (const extensionName of extensionDirs) {
      try {
        const mainJsPath = join(extensionsDir, extensionName, 'main.js');
        const content = await readFile(mainJsPath, 'utf-8');
        
        // Extract current version from EXTENSION_METADATA
        const versionMatch = content.match(/version:\s*['"`]([^'"`]+)['"`]/);
        if (versionMatch) {
          this.extensions.set(extensionName, {
            version: versionMatch[1],
            path: mainJsPath,
            content: content
          });
          this.log(`🔌 Found extension: ${extensionName} v${versionMatch[1]}`);
        }
      } catch (error) {
        this.log(`⚠️  Could not read extension ${extensionName}: ${error.message}`);
      }
    }
  }

  async updateCoreVersion(newVersion) {
    this.log(`🚀 Updating core version from ${this.coreVersion} to ${newVersion}`);
    
    // Get current date for release
    const releaseDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Update package.json
    const packageJsonPath = join(PROJECT_ROOT, 'package.json');
    const packageJson = await this.readJsonFile(packageJsonPath);
    packageJson.version = newVersion;
    await this.writeJsonFile(packageJsonPath, packageJson);
    
    // Update core-api.js
    for (const coreFile of VERSION_CONFIG.CORE_FILES) {
      const filePath = join(PROJECT_ROOT, coreFile);
      let content = await readFile(filePath, 'utf-8');
      
      // Replace VERSION constant
      content = content.replace(
        /VERSION:\s*['"`][^'"`]+['"`]/,
        `VERSION: '${newVersion}'`
      );
      
      // Replace RELEASE_DATE constant
      content = content.replace(
        /RELEASE_DATE:\s*['"`][^'"`]+['"`]/,
        `RELEASE_DATE: '${releaseDate}'`
      );
      
      await writeFile(filePath, content, 'utf-8');
      this.log(`✅ Updated ${coreFile}`);
    }
    
    this.coreVersion = newVersion;
    this.log(`📅 Release date set to: ${releaseDate}`);
  }

  async updateExtensionVersion(extensionName, newVersion, newCoreMinVersion = null) {
    if (!this.extensions.has(extensionName)) {
      throw new Error(`Extension ${extensionName} not found`);
    }

    const extension = this.extensions.get(extensionName);
    this.log(`🔌 Updating extension ${extensionName} from v${extension.version} to v${newVersion}`);
    
    let content = extension.content;
    
    // Update version
    content = content.replace(
      /(version:\s*['"`])[^'"`]+(['"`])/,
      `$1${newVersion}$2`
    );
    
    // Update coreMinVersion if provided
    if (newCoreMinVersion) {
      content = content.replace(
        /(coreMinVersion:\s*['"`])[^'"`]+(['"`])/,
        `$1${newCoreMinVersion}$2`
      );
    }
    
    await writeFile(extension.path, content, 'utf-8');
    
    // Update extension in memory
    this.extensions.set(extensionName, {
      ...extension,
      version: newVersion,
      content: content
    });
    
    this.log(`✅ Updated extension ${extensionName}`);
  }

  async updateAllExtensionsMinCoreVersion(newCoreMinVersion) {
    this.log(`🔄 Updating all extensions' minimum core version to ${newCoreMinVersion}`);
    
    for (const [extensionName, extension] of this.extensions) {
      let content = extension.content;
      
      content = content.replace(
        /(coreMinVersion:\s*['"`])[^'"`]+(['"`])/,
        `$1${newCoreMinVersion}$2`
      );
      
      await writeFile(extension.path, content, 'utf-8');
      
      this.extensions.set(extensionName, {
        ...extension,
        content: content
      });
      
      this.log(`✅ Updated ${extensionName} core min version`);
    }
  }

  async updateDocumentation() {
    this.log(`📚 Updating documentation...`);
    
    for (const docsDir of VERSION_CONFIG.DOCS_DIRS) {
      const docsDirPath = join(PROJECT_ROOT, docsDir);
      
      try {
        const files = await readdir(docsDirPath);
        const mdxFiles = files.filter(file => file.endsWith('.mdx'));
        
        for (const mdxFile of mdxFiles) {
          const extensionName = mdxFile.replace('.mdx', '');
          
          if (this.extensions.has(extensionName)) {
            await this.updateExtensionDocumentation(
              join(docsDirPath, mdxFile),
              extensionName
            );
          }
        }
      } catch (error) {
        this.log(`⚠️  Could not update docs in ${docsDir}: ${error.message}`);
      }
    }
  }

  async updateExtensionDocumentation(docPath, extensionName) {
    try {
      let content = await readFile(docPath, 'utf-8');
      
      // Extract current extension metadata
      const metadata = await this.extractExtensionMetadata(extensionName);
      
      // Update version in technical specifications table (English and Korean)
      content = content.replace(
        /(\|\s*\*\*Latest Version\*\*\s*\|\s*)[^\|\s]+(\s+\|)/,
        `$1${metadata.version}$2`
      );
      content = content.replace(
        /(\|\s*\*\*최신 버전\*\*\s*\|\s*)[^\|\s]+(\s+\|)/,
        `$1${metadata.version}$2`
      );
      
      // Update minimum core version (English and Korean)
      if (metadata.coreMinVersion) {
        content = content.replace(
          /(\|\s*\*\*Minimum Core Version\*\*\s*\|\s*)[^\|\s]+(\s+\|)/,
          `$1${metadata.coreMinVersion}$2`
        );
        content = content.replace(
          /(\|\s*\*\*최소 Core 버전\*\*\s*\|\s*)[^\|\s]+(\s+\|)/,
          `$1${metadata.coreMinVersion}$2`
        );
      }
      
      // Update API level (English and Korean)
      if (metadata.apiLevel) {
        content = content.replace(
          /(\|\s*\*\*Minimum Core API Level\*\*\s*\|\s*)[^\|\s]+(\s+\|)/,
          `$1${metadata.apiLevel}$2`
        );
        content = content.replace(
          /(\|\s*\*\*최소 Core API 레벨\*\*\s*\|\s*)[^\|\s]+(\s+\|)/,
          `$1${metadata.apiLevel}$2`
        );
      }
      
      await writeFile(docPath, content, 'utf-8');
      this.log(`✅ Updated documentation: ${docPath}`);
      
    } catch (error) {
      this.log(`⚠️  Could not update documentation for ${extensionName}: ${error.message}`);
    }
  }

  async extractExtensionMetadata(extensionName) {
    const extension = this.extensions.get(extensionName);
    if (!extension) return {};

    const content = extension.content;
    
    // Extract metadata using regex
    const metadataMatch = content.match(/export const EXTENSION_METADATA\s*=\s*\{([^}]+)\}/s);
    if (!metadataMatch) return {};

    const metadataContent = metadataMatch[1];
    
    const extractField = (field) => {
      const match = metadataContent.match(new RegExp(`${field}:\\s*['"\`]([^'"\`]+)['"\`]`));
      return match ? match[1] : null;
    };

    const extractNumberField = (field) => {
      const match = metadataContent.match(new RegExp(`${field}:\\s*(\\d+)`));
      return match ? parseInt(match[1]) : null;
    };

    return {
      name: extractField('name'),
      version: extractField('version'),
      apiLevel: extractNumberField('apiLevel'),
      coreMinVersion: extractField('coreMinVersion'),
      coreMaxVersion: extractField('coreMaxVersion'),
      description: extractField('description'),
      author: extractField('author')
    };
  }

  incrementVersion(version, type = 'patch') {
    const [major, minor, patch] = version.split('.').map(n => parseInt(n));
    
    switch (type) {
      case 'major':
        return `${major + 1}.0.0`;
      case 'minor':
        return `${major}.${minor + 1}.0`;
      case 'patch':
      default:
        return `${major}.${minor}.${patch + 1}`;
    }
  }

  async readJsonFile(path) {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content);
  }

  async writeJsonFile(path, data) {
    const content = JSON.stringify(data, null, 2) + '\n';
    await writeFile(path, content, 'utf-8');
  }

  log(message) {
    if (this.verbose || process.env.VERBOSE) {
      console.log(message);
    }
  }

  setVerbose(verbose) {
    this.verbose = verbose;
  }
}

// CLI Commands
async function handleCommand() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command) {
    showHelp();
    return;
  }

  const versionManager = new VersionManager();
  
  // Check for verbose flag
  if (args.includes('--verbose') || args.includes('-v')) {
    versionManager.setVerbose(true);
  }

  try {
    await versionManager.init();

    switch (command) {
      case 'bump-core':
        await handleBumpCore(versionManager, args);
        break;
        
      case 'bump-extension':
        await handleBumpExtension(versionManager, args);
        break;
        
      case 'update-min-core':
        await handleUpdateMinCore(versionManager, args);
        break;
        
      case 'sync-docs':
        await versionManager.updateDocumentation();
        console.log('📚 Documentation synchronized successfully!');
        break;
        
      case 'status':
        await showStatus(versionManager);
        break;
        
      case 'help':
      default:
        showHelp();
        break;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

async function handleBumpCore(versionManager, args) {
  const type = args[1] || 'patch';
  const newVersion = versionManager.incrementVersion(versionManager.coreVersion, type);
  
  await versionManager.updateCoreVersion(newVersion);
  await versionManager.updateDocumentation();
  
  console.log(`🎉 Core version bumped to ${newVersion}!`);
}

async function handleBumpExtension(versionManager, args) {
  const extensionName = args[1];
  const type = args[2] || 'patch';
  
  if (!extensionName) {
    throw new Error('Extension name is required. Usage: bump-extension <extension-name> [patch|minor|major]');
  }
  
  if (!versionManager.extensions.has(extensionName)) {
    throw new Error(`Extension "${extensionName}" not found`);
  }
  
  const currentVersion = versionManager.extensions.get(extensionName).version;
  const newVersion = versionManager.incrementVersion(currentVersion, type);
  
  await versionManager.updateExtensionVersion(extensionName, newVersion);
  await versionManager.updateDocumentation();
  
  console.log(`🎉 Extension "${extensionName}" version bumped to ${newVersion}!`);
}

async function handleUpdateMinCore(versionManager, args) {
  const newMinVersion = args[1] || versionManager.coreVersion;
  
  await versionManager.updateAllExtensionsMinCoreVersion(newMinVersion);
  await versionManager.updateDocumentation();
  
  console.log(`🎉 All extensions' minimum core version updated to ${newMinVersion}!`);
}

async function showStatus(versionManager) {
  console.log('📊 Version Status Report\n');
  
  console.log(`🏗️  Core Version: ${versionManager.coreVersion}`);
  console.log(`📅 Core Release Date: ${versionManager.coreReleaseDate}`);
  console.log('\n🔌 Extensions:');
  
  for (const [name, info] of versionManager.extensions) {
    const metadata = await versionManager.extractExtensionMetadata(name);
    console.log(`   ${name}: v${info.version} (min core: ${metadata.coreMinVersion || 'unknown'})`);
  }
  
  console.log('\n💡 Available commands:');
  console.log('   npm run version:bump-core [patch|minor|major]');
  console.log('   npm run version:bump-ext <extension-name> [patch|minor|major]');
  console.log('   npm run version:sync-docs');
  console.log('   npm run version:status');
}

function showHelp() {
  console.log(`
🔧 modernGraphTool Version Manager

USAGE:
  node scripts/version-manager.js <command> [options]

COMMANDS:
  bump-core [type]              Bump core version (patch, minor, major)
  bump-extension <name> [type]  Bump specific extension version
  update-min-core [version]     Update all extensions' minimum core version
  sync-docs                     Synchronize documentation with current versions
  status                        Show current version status
  help                          Show this help message

OPTIONS:
  --verbose, -v                 Enable verbose output

EXAMPLES:
  npm run version:bump-core patch
  npm run version:bump-ext equalizer minor
  npm run version:sync-docs
  npm run version:status
`);
}

// Run CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  handleCommand();
}

export { VersionManager };
