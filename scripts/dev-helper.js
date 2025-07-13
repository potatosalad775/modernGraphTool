#!/usr/bin/env node
/**
 * Development Helper Script
 * Provides better error handling and dev experience
 */

import { spawn } from 'child_process';
import { readFileSync, existsSync, watchFile, unwatchFile } from 'fs';
import { join } from 'path';
import { createServer } from 'net';

const PROJECT_ROOT = new URL('..', import.meta.url).pathname;

function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const colors = {
    info: '\x1b[36m',    // cyan
    warn: '\x1b[33m',    // yellow
    error: '\x1b[31m',   // red
    success: '\x1b[32m', // green
    reset: '\x1b[0m'
  };
  
  console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
}

function validateExtensionConfigs() {
  try {
    const configPath = join(PROJECT_ROOT, 'extensions/extensions.config.js');
    const configContent = readFileSync(configPath, 'utf8');
    
    // Basic validation - check for common syntax errors
    if (!configContent.includes('EXTENSION_CONFIG')) {
      throw new Error('EXTENSION_CONFIG array not found');
    }
    
    log('✓ Extension configurations validated', 'success');
    return true;
  } catch (error) {
    log(`✗ Extension config validation failed: ${error.message}`, 'error');
    return false;
  }
}

function waitForInitialBuild(buildProcess) {
  return new Promise((resolve) => {
    let cleanDetected = false;
    
    // Monitor build output for clean operation
    buildProcess.stdout.on('data', (data) => {
      const output = data.toString();
      
      // Detect clean operation
      if (output.includes('clean') && output.includes('rm -rf')) {
        cleanDetected = true;
        log('⏳ Clean detected, waiting for build to complete...', 'info');
        
        // Wait 3 seconds after clean for build to complete
        // This is much more reliable than trying to parse all the concurrent output
        setTimeout(() => {
          log('✓ Build should be ready, starting server...', 'success');
          resolve();
        }, 3000);
      }
      
      // Forward output
      process.stdout.write(data);
    });
    
    buildProcess.stderr.on('data', (data) => {
      process.stderr.write(data);
    });
    
    // Fallback if clean isn't detected (shouldn't happen, but just in case)
    setTimeout(() => {
      if (!cleanDetected) {
        log('⚠️  Clean not detected, starting server anyway...', 'warn');
        resolve();
      }
    }, 5000);
  });
}

function checkPortAvailability(port = 8000) {
  return new Promise((resolve) => {
    const server = createServer();
    
    server.listen(port, () => {
      server.once('close', () => resolve(true));
      server.close();
    });
    
    server.on('error', () => resolve(false));
  });
}

async function main() {
  log('🚀 Starting modernGraphTool development environment...', 'info');
  
  // Validate configurations
  if (!validateExtensionConfigs()) {
    process.exit(1);
  }
  
  // Check if port is available
  const portAvailable = await checkPortAvailability();
  if (!portAvailable) {
    log('⚠️  Port 8000 is already in use', 'warn');
    log('   You can still run the watchers with: npm run dev:build', 'info');
  }
  
  log('✓ All checks passed, starting build process...', 'success');
  
  // Start the build watchers first (without server)
  log('🔧 Starting file watchers...', 'info');
  const buildProcess = spawn('npm', ['run', 'watch:all'], {
    stdio: ['inherit', 'pipe', 'pipe'],
    cwd: PROJECT_ROOT,
    shell: true
  });
  
  // Wait for initial build to complete (monitors output)
  await waitForInitialBuild(buildProcess);
  
  // Now start the server
  log('🌐 Starting development server...', 'info');
  log('📂 Project will be available at: http://localhost:8000', 'info');
  log('🔧 Press Ctrl+C to stop all processes', 'info');
  
  const serverProcess = spawn('npm', ['run', 'serve'], {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
    shell: true
  });
  
  // Handle errors
  buildProcess.on('error', (error) => {
    log(`Failed to start build process: ${error.message}`, 'error');
    process.exit(1);
  });
  
  serverProcess.on('error', (error) => {
    log(`Failed to start server: ${error.message}`, 'error');
    process.exit(1);
  });
  
  // Handle cleanup
  process.on('SIGINT', () => {
    log('🛑 Shutting down development environment...', 'info');
    buildProcess.kill('SIGINT');
    serverProcess.kill('SIGINT');
    process.exit(0);
  });
}

main().catch(error => {
  log(`Unexpected error: ${error.message}`, 'error');
  process.exit(1);
});
