#!/usr/bin/env node

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

async function validateExtensionVersions() {
  console.log('🔍 Validating extension versions...\n');
  
  try {
    const extensionsDir = join(PROJECT_ROOT, 'extensions');
    const entries = await readdir(extensionsDir, { withFileTypes: true });
    const extensionDirs = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name);

    const issues = [];
    const validExtensions = [];

    for (const extensionName of extensionDirs) {
      const mainJsPath = join(extensionsDir, extensionName, 'main.js');
      
      try {
        const content = await readFile(mainJsPath, 'utf-8');
        
        // Check if EXTENSION_METADATA is exported
        const hasMetadata = content.includes('export const EXTENSION_METADATA');
        
        if (!hasMetadata) {
          issues.push(`❌ ${extensionName}: Missing EXTENSION_METADATA export`);
          continue;
        }

        // Extract metadata using regex (basic validation)
        const metadataMatch = content.match(/export const EXTENSION_METADATA\s*=\s*\{([^}]+)\}/s);
        if (!metadataMatch) {
          issues.push(`❌ ${extensionName}: Invalid EXTENSION_METADATA format`);
          continue;
        }

        const metadataContent = metadataMatch[1];
        
        // Check required fields
        const requiredFields = ['name', 'version', 'apiLevel', 'coreMinVersion'];
        const missingFields = [];
        
        for (const field of requiredFields) {
          if (!metadataContent.includes(`${field}:`)) {
            missingFields.push(field);
          }
        }

        if (missingFields.length > 0) {
          issues.push(`❌ ${extensionName}: Missing required fields: ${missingFields.join(', ')}`);
          continue;
        }

        // Extract version for format validation
        const versionMatch = metadataContent.match(/version:\s*['"`]([^'"`]+)['"`]/);
        if (versionMatch) {
          const version = versionMatch[1];
          if (!/^\d+\.\d+\.\d+$/.test(version)) {
            issues.push(`❌ ${extensionName}: Invalid version format: ${version} (should be x.y.z)`);
            continue;
          }
        }

        validExtensions.push({
          name: extensionName,
          version: versionMatch ? versionMatch[1] : 'unknown'
        });

      } catch (error) {
        issues.push(`❌ ${extensionName}: Failed to read main.js - ${error.message}`);
      }
    }

    // Report results
    if (validExtensions.length > 0) {
      console.log('✅ Valid extensions:');
      validExtensions.forEach(ext => {
        console.log(`   ${ext.name} v${ext.version}`);
      });
      console.log();
    }

    if (issues.length > 0) {
      console.log('⚠️  Issues found:');
      issues.forEach(issue => console.log(`   ${issue}`));
      console.log();
      console.log('💡 To fix these issues, add EXTENSION_METADATA export to main.js:');
      console.log(`
export const EXTENSION_METADATA = {
  name: 'your-extension-name',
  version: '1.0.0',
  apiLevel: 1,
  coreMinVersion: '1.0.0',
  coreMaxVersion: '1.9.x',
  description: 'Your extension description',
  author: 'Your name'
};`);
      
      process.exit(1);
    } else {
      console.log('🎉 All extensions have valid version metadata!');
    }

  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    process.exit(1);
  }
}

// Run validation
validateExtensionVersions();
