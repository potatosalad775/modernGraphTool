#!/usr/bin/env node

import { VersionManager } from './version-manager.js';
import { createInterface } from 'readline';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

class InteractiveVersionManager {
  constructor() {
    this.versionManager = new VersionManager();
  }

  async init() {
    await this.versionManager.init();
    this.versionManager.setVerbose(true);
  }

  async showMainMenu() {
    console.clear();
    console.log('🔧 modernGraphTool Version Manager\n');
    
    console.log(`📦 Current Core Version: ${this.versionManager.coreVersion}`);
    console.log(`🔌 Extensions: ${this.versionManager.extensions.size} found\n`);
    
    console.log('What would you like to do?');
    console.log('1. Bump core version');
    console.log('2. Bump extension version');
    console.log('3. Update all extensions minimum core version');
    console.log('4. Sync documentation');
    console.log('5. Show version status');
    console.log('6. Exit\n');
    
    const choice = await this.askQuestion('Enter your choice (1-6): ');
    
    switch (choice.trim()) {
      case '1':
        await this.handleBumpCore();
        break;
      case '2':
        await this.handleBumpExtension();
        break;
      case '3':
        await this.handleUpdateMinCore();
        break;
      case '4':
        await this.handleSyncDocs();
        break;
      case '5':
        await this.handleShowStatus();
        break;
      case '6':
        console.log('👋 Goodbye!');
        rl.close();
        return;
      default:
        console.log('❌ Invalid choice. Please try again.');
        await this.waitForEnter();
        await this.showMainMenu();
    }
  }

  async handleBumpCore() {
    console.log('\n🚀 Bump Core Version\n');
    
    const currentVersion = this.versionManager.coreVersion;
    console.log(`Current version: ${currentVersion}`);
    
    const patchVersion = this.versionManager.incrementVersion(currentVersion, 'patch');
    const minorVersion = this.versionManager.incrementVersion(currentVersion, 'minor');
    const majorVersion = this.versionManager.incrementVersion(currentVersion, 'major');
    
    console.log('\nAvailable options:');
    console.log(`1. Patch (${patchVersion}) - Bug fixes`);
    console.log(`2. Minor (${minorVersion}) - New features`);
    console.log(`3. Major (${majorVersion}) - Breaking changes`);
    console.log('4. Cancel\n');
    
    const choice = await this.askQuestion('Choose version type (1-4): ');
    
    let newVersion;
    switch (choice.trim()) {
      case '1':
        newVersion = patchVersion;
        break;
      case '2':
        newVersion = minorVersion;
        break;
      case '3':
        newVersion = majorVersion;
        break;
      case '4':
        await this.showMainMenu();
        return;
      default:
        console.log('❌ Invalid choice.');
        await this.waitForEnter();
        await this.showMainMenu();
        return;
    }
    
    const confirm = await this.askQuestion(`Are you sure you want to bump core to ${newVersion}? (y/N): `);
    if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
      try {
        await this.versionManager.updateCoreVersion(newVersion);
        await this.versionManager.updateDocumentation();
        console.log(`\n🎉 Core version successfully bumped to ${newVersion}!`);
      } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
      }
    }
    
    await this.waitForEnter();
    await this.showMainMenu();
  }

  async handleBumpExtension() {
    console.log('\n🔌 Bump Extension Version\n');
    
    const extensions = Array.from(this.versionManager.extensions.keys());
    if (extensions.length === 0) {
      console.log('❌ No extensions found.');
      await this.waitForEnter();
      await this.showMainMenu();
      return;
    }
    
    console.log('Available extensions:');
    extensions.forEach((ext, index) => {
      const version = this.versionManager.extensions.get(ext).version;
      console.log(`${index + 1}. ${ext} (v${version})`);
    });
    console.log(`${extensions.length + 1}. Cancel\n`);
    
    const choice = await this.askQuestion(`Choose extension (1-${extensions.length + 1}): `);
    const choiceNum = parseInt(choice.trim());
    
    if (choiceNum === extensions.length + 1 || isNaN(choiceNum) || choiceNum < 1) {
      await this.showMainMenu();
      return;
    }
    
    const selectedExtension = extensions[choiceNum - 1];
    const currentVersion = this.versionManager.extensions.get(selectedExtension).version;
    
    console.log(`\nSelected: ${selectedExtension} (v${currentVersion})`);
    
    const patchVersion = this.versionManager.incrementVersion(currentVersion, 'patch');
    const minorVersion = this.versionManager.incrementVersion(currentVersion, 'minor');
    const majorVersion = this.versionManager.incrementVersion(currentVersion, 'major');
    
    console.log('\nVersion options:');
    console.log(`1. Patch (${patchVersion}) - Bug fixes`);
    console.log(`2. Minor (${minorVersion}) - New features`);
    console.log(`3. Major (${majorVersion}) - Breaking changes`);
    console.log('4. Cancel\n');
    
    const versionChoice = await this.askQuestion('Choose version type (1-4): ');
    
    let newVersion;
    switch (versionChoice.trim()) {
      case '1':
        newVersion = patchVersion;
        break;
      case '2':
        newVersion = minorVersion;
        break;
      case '3':
        newVersion = majorVersion;
        break;
      case '4':
        await this.showMainMenu();
        return;
      default:
        console.log('❌ Invalid choice.');
        await this.waitForEnter();
        await this.showMainMenu();
        return;
    }
    
    const confirm = await this.askQuestion(`Bump ${selectedExtension} to ${newVersion}? (y/N): `);
    if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
      try {
        await this.versionManager.updateExtensionVersion(selectedExtension, newVersion);
        await this.versionManager.updateDocumentation();
        console.log(`\n🎉 Extension ${selectedExtension} successfully bumped to ${newVersion}!`);
      } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
      }
    }
    
    await this.waitForEnter();
    await this.showMainMenu();
  }

  async handleUpdateMinCore() {
    console.log('\n🔄 Update All Extensions Minimum Core Version\n');
    
    const currentCore = this.versionManager.coreVersion;
    console.log(`Current core version: ${currentCore}`);
    
    const useCurrentVersion = await this.askQuestion(`Use current core version (${currentCore}) as minimum? (Y/n): `);
    
    let newMinVersion = currentCore;
    if (useCurrentVersion.toLowerCase() === 'n' || useCurrentVersion.toLowerCase() === 'no') {
      newMinVersion = await this.askQuestion('Enter minimum core version: ');
    }
    
    const confirm = await this.askQuestion(`Update all extensions to require core >= ${newMinVersion}? (y/N): `);
    if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
      try {
        await this.versionManager.updateAllExtensionsMinCoreVersion(newMinVersion);
        await this.versionManager.updateDocumentation();
        console.log(`\n🎉 All extensions updated to require core >= ${newMinVersion}!`);
      } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
      }
    }
    
    await this.waitForEnter();
    await this.showMainMenu();
  }

  async handleSyncDocs() {
    console.log('\n📚 Sync Documentation\n');
    
    const confirm = await this.askQuestion('Synchronize documentation with current versions? (y/N): ');
    if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
      try {
        await this.versionManager.updateDocumentation();
        console.log('\n🎉 Documentation synchronized successfully!');
      } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
      }
    }
    
    await this.waitForEnter();  
    await this.showMainMenu();
  }

  async handleShowStatus() {
    console.log('\n📊 Version Status\n');
    
    console.log(`🏗️  Core Version: ${this.versionManager.coreVersion}\n`);
    
    console.log('🔌 Extensions:');
    for (const [name, info] of this.versionManager.extensions) {
      const metadata = await this.versionManager.extractExtensionMetadata(name);
      console.log(`   ${name.padEnd(20)} v${info.version.padEnd(8)} (min core: ${metadata.coreMinVersion || 'unknown'})`);
    }
    
    await this.waitForEnter();
    await this.showMainMenu();
  }

  askQuestion(question) {
    return new Promise((resolve) => {
      rl.question(question, resolve);
    });
  }

  waitForEnter() {
    return this.askQuestion('\nPress Enter to continue...');
  }
}

// Run the interactive manager
async function main() {
  const manager = new InteractiveVersionManager();
  
  try {
    await manager.init();
    await manager.showMainMenu();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
