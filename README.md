# modernGraphTool_beta

A completely re-engineered graphtool, built with modern web technologies.

## Demo

https://silicagel.squig.link/alpha

## Why?

modernGraphTool draws its inspiration from [CrinGraph][CRINGRAPH], a widely-used tool developed by mlochbaum in 2019 for visualizing frequency response graphs. 

Over time, as users began creating their own measurement databases, numerous customized versions of CrinGraph with unique features started to appear.

However, its design was optimized for its original purpose, which made adding new features and maintaining codebase more challenging over time.

This project seeks to build upon CrinGraph's core functionality while introducing a more adaptable and expandable foundation.

## Features

### Frequency Response Graph Visualization
- Normalization options - (Hz / Midrange Average (300Hz~3kHz))
- Smoothing options - (1/48oct ~ 1/3oct)

### Headphone / Target Selector
- Search headphones by name or brand
- Use headphone / target as baseline
- Compatible with CrinGraph file structure (phone_book & target_manifest)

### Graph Tools
- Share with URL (+ Base62 encoding support)
- Save Frequency Response graph screenshot

### User Interface & Customization
- Multi-Language & Dark Mode support
- User configurable elements (Link, Watermark..)
- Based on 'Material Design 3' color palette

### Expandability
- API-based extension system
- User configurable extension

## Extension

modernGraphTool is designed to be extensible. You can safely add / remove / modify features without affecting its core.

This project is providing several extensions by default:
- ['Equalizer Extension with AutoEQ'](./dist/extension/equalizer/)
- ['Frequency Tutorial Extension'](./dist/extension/frequency-tutorial/)
- ['Squig.link Integration Extension'](./dist/extension/squiglink-integration/)

Documentation for developers will be available later.

## User Guide

All you need to do is to download the repository, and use the files inside the `dist` folder.

You cannot open the `index.html` file directly, as many browsers do not allow loading modules from local storage.

The easiest way to try out modernGraphTool in local is to use the [VSCode][VSCODE] + [Live Preview extension][VSCODE_LIVE_PREVIEW].

```
dist/
├── assets/                     # Static assets (Image, Strings..)
├── data/                       # Frequency Response data
│   ├── phones                  # 
│   │   ├── phone L.txt         # Phone FR Left Channel Data
│   │   └── phone R.txt         # Phone FR Right Channel Data
│   ├── target                  # 
│   │   └── DF Target.txt       # Target FR Data
│   └── phone_book.json         # phone_book.json
├── extension/                  # 
│   ├── equalizer               # Extension Module Folder
│   └── extension.config.js     # Extension user config
├── core.min.js                 # modernGraphTool Core Module (Bundled)
├── config.js                   # User config
├── theme.css                   # User theme
└── index.html                  # HTML
```

### Configuring modernGraphTool

You can customize modernGraphTool via `index.html`, `config.js` and `/extension/extension.config.js`.

### Migrating from CrinGraph

modernGraphTool is designed to be as compatible as possible with CrinGraph.

Specifically, the features related to Frequency Response data are designed to use the same data you used in CrinGraph, so you can simply copy over your data folder, and it should work just fine.

This repository is pre-loaded with the same sample data that can be found at ['Squig.link Lab' (fork of CrinGraph)][SQUIGLINK_LAB].

## Developer Guide

modernGraphTool is bundled with [Rollup.js][ROLLUP] for better performance.

To build modernGraphTool, you need to have Node.js installed. Then, run the following commands:

```
# Setup Dependencies
npm install

# Build
npm run build

# Start
npm run start
```

## Coming Soon

- ~~UI optimization for mobile devices~~
- ~~squig.link integration plugin (extension)~~
- Over-engineered color wheel (extension)
- Tilted target (extension)

## License

modernGraphTool is open source software licensed under MIT License.

[CRINGRAPH]: https://github.com/mlochbaum/CrinGraph
[VSCODE]: https://code.visualstudio.com/
[VSCODE_LIVE_PREVIEW]: https://marketplace.visualstudio.com/items?itemName=ms-vscode.live-server
[ROLLUP]: https://rollupjs.org/
[SQUIGLINK_LAB]: https://github.com/squiglink/lab