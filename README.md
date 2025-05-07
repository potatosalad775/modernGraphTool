# modernGraphTool_beta

A completely re-engineered graphtool, built with modern web technologies.

## Demo

https://potatosalad775.github.io/modernGraphTool

## Why?

modernGraphTool draws its inspiration from [CrinGraph][CRINGRAPH], a widely-used tool developed by mlochbaum in 2019 for visualizing frequency response graphs. 

Over time, as users began creating their own measurement databases, numerous customized versions of CrinGraph with unique features started to appear.

However, its design was optimized for its original purpose, which made adding new features and maintaining codebase more challenging over time.

This project seeks to build upon CrinGraph's core functionality while introducing a more adaptable and expandable foundation.

## Features

You can discover more at the [modernGraphTool documentation page][DOCS].

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

## Developer Guide

modernGraphTool is bundled with [Rollup.js][ROLLUP] for better performance.

To build modernGraphTool, you need to have Node.js installed. Then, run the following commands:

```
# Setup Dependencies
npm install

# Start Local Server
npm run dev
npm run start

# Build
npm run build
```

## License

modernGraphTool is open source software licensed under MIT License.

[CRINGRAPH]: https://github.com/mlochbaum/CrinGraph
[VSCODE]: https://code.visualstudio.com/
[VSCODE_LIVE_PREVIEW]: https://marketplace.visualstudio.com/items?itemName=ms-vscode.live-server
[ROLLUP]: https://rollupjs.org/
[SQUIGLINK_LAB]: https://github.com/squiglink/lab
[DOCS]: https://potatosalad775.github.io/modernGraphTool/docs