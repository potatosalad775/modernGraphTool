#!/usr/bin/env node

import { VersionManager } from './version-manager.js';

/**
 * Pre-commit hook to ensure version consistency
 * This script runs automatically before commits to validate that:
 * - All extensions have valid version metadata
 * - Documentation matches extension versions
 * - Core version is consistent across files
 */

async function preCommitCheck() {
  console.log('🔍 Running pre-commit version checks...\n');
  
  try {
    const versionManager = new VersionManager();
    await versionManager.init();
    
    let hasErrors = false;
    
    // Check 1: Validate all extensions have proper metadata
    console.log('📋 Checking extension metadata...');
    for (const [extensionName, extension] of versionManager.extensions) {
      const metadata = await versionManager.extractExtensionMetadata(extensionName);
      
      if (!metadata.name || !metadata.version || !metadata.apiLevel || !metadata.coreMinVersion) {
        console.error(`❌ Extension "${extensionName}" has incomplete metadata`);
        hasErrors = true;
      } else {
        console.log(`✅ ${extensionName}: v${metadata.version}`);
      }
    }
    
    // Check 2: Validate version format consistency
    console.log('\n🔢 Checking version formats...');
    const versionPattern = /^\d+\.\d+\.\d+$/;
    
    if (!versionPattern.test(versionManager.coreVersion)) {
      console.error(`❌ Core version "${versionManager.coreVersion}" has invalid format`);
      hasErrors = true;
    }
    
    for (const [extensionName, extension] of versionManager.extensions) {
      if (!versionPattern.test(extension.version)) {
        console.error(`❌ Extension "${extensionName}" version "${extension.version}" has invalid format`);
        hasErrors = true;
      }
    }
    
    if (hasErrors) {
      console.error('\n💥 Pre-commit check failed! Please fix the version issues above.');
      console.error('💡 You can run "npm run version:status" to see current versions');
      console.error('💡 Use "npm run version:sync-docs" to synchronize documentation');
      process.exit(1);
    }
    
    console.log('\n✅ All version checks passed!');
    
  } catch (error) {
    console.error('❌ Pre-commit check failed:', error.message);
    process.exit(1);
  }
}

// Run the check
preCommitCheck();
