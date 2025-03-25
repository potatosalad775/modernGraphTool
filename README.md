# modernGraphTool_beta

A completely re-engineered graphtool, built with modern web technologies.

## Demo

https://silicagel.squig.link/alpha

## Why?

modernGraphTool draws its inspiration from [CrinGraph][CRINGRAPH], a widely-used tool developed by mlochbaum in 2019 for visualizing frequency response graphs. 

Over time, as users began creating their own measurement databases, customized versions of CrinGraph with unique features started to appear. However, its design was optimized for its original purpose, which made adding new features more challenging over time. 

This project seeks to build upon CrinGraph's core functionality while introducing a more adaptable and expandable foundation.

## Features

### Frequency Response Graph Visualization
- Normalization Options - (dB / Midrange Average (300Hz~3kHz))
- Smoothing Options - (1/48oct ~ 1/3oct)

### Headphone / Target Selector
- Search Headphones by Name or Brand
- Use Headphone / Target as Baseline

### Graph Tools
- Share with URL (+ Base62 encoding support)
- Save FR Graph Screenshot

### User Interface & Customization
- Multi-Language & Dark Mode Support
- User-Configurable Elements (Color Palette, Link, Watermark..)

### Expandability
- API-based Extension System
- User-Configurable Extension

## Extension

modernGraphTool is designed to be extensible. You can safely add / remove / modify features without affecting its core.

This project is providing ['Equalizer Extension with AutoEQ'](./dist/extension/equalizer/) and ['Frequency Tutorial Extension'](./dist/extension/frequency-tutorial/) as examples.

Documentation will be available later.

## User Guide

All you need to do is to download the repository, and use the files inside the `dist` folder.

You cannot open the `index.html` file directly, as many browsers do not allow loading modules from local storage.

The easiest way to try out modernGraphTool in local is to use the [VSCode][VSCODE] + [Live Preview extension][VSCODE_LIVE_PREVIEW].

### Configuring modernGraphTool

You can customize modernGraphTool via `config.js` and `/extension/extension.config.js`.

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

## License

modernGraphTool is open source software licensed under MIT License.

[CRINGRAPH]: https://github.com/mlochbaum/CrinGraph
[VSCODE]: https://code.visualstudio.com/
[VSCODE_LIVE_PREVIEW]: https://marketplace.visualstudio.com/items?itemName=ms-vscode.live-server
[ROLLUP]: https://rollupjs.org/
