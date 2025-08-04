# Version Management System

## Overview

This automated version management system provides centralized version control for modernGraphTool core and all extensions, with automatic documentation synchronization.

## Features

- ✅ **Centralized Version Management** - Single source of truth in `package.json`
- ✅ **Automatic Core Updates** - Updates `src/core-api.js` when core version changes
- ✅ **Extension Version Control** - Manages individual extension versions in their `main.js` files
- ✅ **Documentation Sync** - Automatically updates `.mdx` documentation files (English + Korean)
- ✅ **Version Validation** - Ensures consistent version formats and metadata
- ✅ **Interactive CLI** - User-friendly interface for version management
- ✅ **Git Integration** - Pre-commit hooks and GitHub Actions support

## Quick Start

### Check Current Status
```bash
npm run version:status
```

### Interactive Version Management
```bash
npm run version:interactive
```

### Command Line Interface
```bash
# Bump core version
npm run version:bump-core patch|minor|major

# Bump specific extension
npm run version:bump-ext <extension-name> patch|minor|major

# Update all extensions minimum core version
npm run version:update-min-core [version]

# Sync documentation
npm run version:sync-docs
```

## Usage Examples

### 1. Release New Core Version
```bash
# Bump core from 1.0.0 to 1.0.1 (patch)
npm run version:bump-core patch

# Bump core from 1.0.1 to 1.1.0 (minor) 
npm run version:bump-core minor

# Bump core from 1.1.0 to 2.0.0 (major)
npm run version:bump-core major
```

This will:
- Update `package.json` version
- Update `src/core-api.js` VERSION constant
- Sync all documentation files

### 2. Release New Extension Version
```bash
# Bump equalizer extension version
npm run version:bump-ext equalizer minor

# Bump graph-color-wheel extension version  
npm run version:bump-ext graph-color-wheel patch
```

This will:
- Update extension's `main.js` EXTENSION_METADATA
- Update corresponding documentation files in both languages

### 3. Update Minimum Core Requirements
```bash
# Update all extensions to require current core version
npm run version:update-min-core

# Update all extensions to require specific core version
npm run version:update-min-core 1.2.0
```

### 4. Sync Documentation Only
```bash
npm run version:sync-docs
```

## File Structure

```
scripts/
├── version-manager.js              # Main version management logic
├── interactive-version-manager.js  # Interactive CLI interface
├── pre-commit-version-check.js     # Pre-commit validation
└── version-config.json             # Configuration file

.github/workflows/
└── version-management.yml          # GitHub Actions workflow
```

## Configuration

Edit `scripts/version-config.json` to customize:

```json
{
  "core": {
    "versionSource": "package.json",
    "files": ["src/core-api.js"]
  },
  "extensions": {
    "directory": "extensions",
    "defaultVersionIncrement": "patch",
    "exclude": []
  },
  "documentation": {
    "directories": [
      "docs/docs/extensions",
      "docs/i18n/ko/docusaurus-plugin-content-docs/current/extensions"
    ]
  }
}
```

## Extension Requirements

All extensions must export `EXTENSION_METADATA` in their `main.js`:

```javascript
export const EXTENSION_METADATA = {
  name: 'your-extension-name',
  version: '1.0.0',
  apiLevel: 1,
  coreMinVersion: '1.0.0',
  coreMaxVersion: '1.9.x',
  description: 'Your extension description',
  author: 'Your name'
};
```

## Documentation Format

Documentation files must include a technical specifications table:

```markdown
## Technical Specifications

| Property | Value |
|----------|-------|
| **Extension Name** | `extension-name` |
| **Latest Version** | 1.0.0 |
| **Minimum Core API Level** | 1 |
| **Minimum Core Version** | 1.0.0 |
| **I18N Support** | Yes |
```

## Automated Workflows

### Pre-commit Hook
Validates version consistency before commits:
```bash
node scripts/pre-commit-version-check.js
```

### GitHub Actions
- Validates versions on PR/push
- Auto-syncs documentation on main branch
- Generates version reports

## Validation Rules

1. **Version Format**: Must follow semantic versioning (x.y.z)
2. **Required Metadata**: Extensions must have name, version, apiLevel, coreMinVersion
3. **Documentation Sync**: Version numbers must match between code and docs
4. **Core Compatibility**: Extensions must specify valid core version ranges

## Troubleshooting

### Common Issues

**❌ Extension metadata not found**
```bash
# Fix: Add EXTENSION_METADATA export to main.js
export const EXTENSION_METADATA = { ... };
```

**❌ Invalid version format**
```bash
# Fix: Use semantic versioning (1.0.0, not 1.0 or v1.0.0)
version: '1.0.0'
```

**❌ Documentation out of sync**
```bash
# Fix: Run documentation sync
npm run version:sync-docs
```

### Debug Mode
Enable verbose logging:
```bash
VERBOSE=true npm run version:status
```

## Integration with Development Workflow

### Recommended Workflow
1. **Development**: Work on features/fixes
2. **Testing**: Run `npm run validate-versions` 
3. **Version Bump**: Use `npm run version:interactive`
4. **Documentation**: Auto-synced by version manager
5. **Commit**: Pre-commit hook validates everything
6. **Release**: GitHub Actions handle CI/CD

### Best Practices
- Always bump versions when releasing changes
- Use patch for bug fixes, minor for features, major for breaking changes
- Update minimum core version when using new core APIs
- Test extensions after bumping minimum core requirements

## API Reference

### VersionManager Class
```javascript
import { VersionManager } from './scripts/version-manager.js';

const manager = new VersionManager();
await manager.init();

// Update core version
await manager.updateCoreVersion('1.1.0');

// Update extension version
await manager.updateExtensionVersion('equalizer', '1.0.2');

// Sync documentation
await manager.updateDocumentation();
```

## Contributing

When adding new features to the version management system:

1. Update `version-config.json` for new configuration options
2. Add tests for new functionality
3. Update this README with new commands/features
4. Ensure backward compatibility with existing extensions
