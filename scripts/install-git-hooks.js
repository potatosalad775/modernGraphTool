#!/usr/bin/env node

import { copyFile, chmod, access } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

async function installGitHooks() {
  console.log('🪝 Installing Git hooks for version management...\n');
  
  try {
    const hookSource = join(__dirname, 'git-hooks', 'pre-commit');
    const hookTarget = join(PROJECT_ROOT, '.git', 'hooks', 'pre-commit');
    
    // Check if .git directory exists
    try {
      await access(join(PROJECT_ROOT, '.git'));
    } catch (error) {
      console.log('⚠️  No .git directory found. Skipping git hook installation.');
      return;
    }
    
    // Copy the pre-commit hook
    await copyFile(hookSource, hookTarget);
    
    // Make it executable
    await chmod(hookTarget, 0o755);
    
    console.log('✅ Pre-commit hook installed successfully!');
    console.log('💡 This hook will validate versions before each commit');
    console.log('💡 To disable temporarily, use: git commit --no-verify\n');
    
  } catch (error) {
    console.error('❌ Failed to install git hooks:', error.message);
    process.exit(1);
  }
}

installGitHooks();
