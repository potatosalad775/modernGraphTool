# modernGraphTool AI Coding Instructions

## Project Overview
modernGraphTool is a web-based frequency response visualization tool for audio devices (earphones/headphones). It uses a modular extension-based architecture built with vanilla JavaScript, Web Components, and ES modules.

## Core Architecture

### Module System
- **Core Entry Point**: `src/core-ui.js` - Main app component that orchestrates the entire UI
- **Core API**: `src/core-api.js` - Exports all core modules as a unified namespace
- **Extension System**: `src/core-extension.js` - Dynamically loads extensions from `extensions/extensions.config.js`
- **Event System**: `src/core-event.js` - Custom event dispatcher for cross-component communication

### Build System
- **Rollup**: Main bundler that creates `dist/core.min.js` from `src/core-ui.js`
- **Development**: Use `npm run dev` (starts watchers + dev server in one command)
- **Extensions**: Each extension with rollup config builds separately to `dist/extensions/`
- **Critical**: Extensions import from `"../../core.min.js"` - this is the bundled core API

### Web Components Pattern
All UI components extend `HTMLElement` and use `customElements.define()`:
```javascript
class MyComponent extends HTMLElement {
  constructor() {
    super();
    this.innerHTML = `<div>Content</div>`;
  }
  connectedCallback() { /* setup */ }
  disconnectedCallback() { /* cleanup */ }
}
customElements.define('my-component', MyComponent);
```

## Extension Development

### Extension Structure
```
extensions/my-extension/
├── main.js              # Entry point - exports default class
├── rollup.config.js     # If using compiled components
├── strings/en.json      # I18n strings (if I18N_ENABLED: true)
└── components/          # Extension-specific components
```

### Extension Registration
1. Add config to `extensions/extensions.config.js` EXTENSION_CONFIG array
2. Extension class must extend HTMLElement and call `MenuState.addExtensionMenu()`
3. Template in `extensions/template/main.js` shows complete pattern

### Extension Integration Points
- **MenuState.addExtensionMenu()**: Adds extension to menu system
- **DataProvider.frDataMap**: Access frequency response data
- **CoreEvent**: Custom event system for component communication
- **MetadataParser.phoneMetadata**: Device metadata access

## Data Flow Architecture

### Core Data Management
- **DataProvider**: Central frequency response data store using Map() structure
- **MetadataParser**: Handles device metadata parsing and management  
- **FRParser/FRNormalizer/FRSmoother**: Data processing pipeline
- **RenderEngine**: Visualization rendering system

### Key Data Structures
- `frDataMap`: Map of UUID -> frequency response objects
- Each FR object has: `{uuid, type, identifier, channels, metadata, visibility}`
- Extensions access data via `DataProvider.frDataMap` and `MetadataParser.phoneMetadata`

## Development Workflows

### Local Development
```bash
npm install           # Setup dependencies
npm run dev          # Start development (watchers + dev server)
npm run dev:build    # Watch-only mode (no server)
npm run preview      # Build + serve (test production build)
```

### Extension Development
```bash
npm run dev:ext:my-extension  # Watch specific extension (if has rollup config)
npm run build:ext:my-extension # Build specific extension
```

### Build Process
- Core builds to `dist/core.min.js` with source maps
- Extensions with rollup configs build to `dist/extensions/[name]/`
- Extensions without rollup get copied via `copy:extensions` script
- Final dist structure mirrors development structure

## Key Conventions

### Import Patterns
- **Core modules**: Import from `"../../core.min.js"` in extensions
- **Extension components**: Use relative imports within extension
- **Styles**: Use `import styles from "./file.css" with { type: "css" }`

### Event System
- Use CoreEvent for cross-component communication
- Custom events follow pattern: `extension-name:event-type`
- Examples: `equalizer:filters-changed`, `core:menu-change`

### Component Naming
- Web component names must contain hyphens: `my-component`
- File names match component names: `my-component.js`
- Class names use PascalCase: `MyComponent`

### Configuration
- Extension config in `extensions/extensions.config.js`
- Core config in `dist/config.js` (runtime configuration)
- I18n strings in `*/strings/en.json` files

## File Organization

### Core Structure
- `src/model/`: Data management and business logic
- `src/ui/components/`: Reusable UI components  
- `src/ui/visualization/`: Graph rendering system
- `src/styles/`: Global CSS files

### Critical Files to Understand
- `src/core-ui.js`: Main app layout and initialization
- `src/model/menu-state.js`: Menu system and extension registration
- `src/model/data-provider.js`: Central data management
- `extensions/extensions.config.js`: Extension configuration
- `extensions/template/main.js`: Extension development template

## Testing & Debugging

### Development Server
- Runs on `http://localhost:8000` via `@web/dev-server`
- Live reload enabled for source changes
- Console shows extension loading status

### Common Debug Points
- Extension loading errors appear in console with clear extension names
- Check `DataProvider.frDataMap` and `MetadataParser.phoneMetadata` in dev tools
- Custom events visible in dev tools Event Listeners tab

When working on this project, always consider the extension-based architecture and ensure new components follow the established Web Components pattern.
