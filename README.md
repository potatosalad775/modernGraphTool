# modernGraphTool_v2_beta

A completely re-engineered graphtool for frequency response visualization, built with modern web technologies.

You can discover more at the [modernGraphTool documentation page][DOCS].

> *modernGraphTool_**beta** is still in the early stages of development. \
> Frequent breaking changes and design revisions may occur.*

## Demo

https://potatosalad775.github.io/modernGraphTool

Also available in Squiglink: https://silicagel.squig.link

## Features

- **Frequency Response Graph** — Interactive D3.js SVG visualization with HpTF overlay support
- **Parametric Equalizer** — Full PEQ editor with auto EQ generation and audio preview
- **Target Customizer** — Custom HRTF target curves with tilt, bass, and treble adjustment
- **squig.link Integration** — Cross-site device search, shop links, and sponsor content
- **Built-in Device PEQ Bridge** — Write EQ settings directly to 20+ supported devices, originally by jeromeof
- **Internationalization** — English and Korean (Paraglide JS compile-time i18n)
- **Light & Dark Mode** — Colorful UI with operator-customizable theme system

## Getting Started

```bash
# Install dependencies
npm install

# Start development server (http://localhost:5173)
npm run dev

# Build for production (outputs to ./dist)
npm run build
```

## Documentation

See the [documentation site][DOCS] for feature guides, admin setup, and developer reference.

## Download

See the [Release Page][RELEASE] for download options.

## Contributing

Contributions are always welcome, no matter how small or large!

Please refer to [CONTRIBUTING.md](CONTRIBUTING.md) for more information.

## License

modernGraphTool is open source software licensed under the MIT License.

<sup>The `defaults/` folder contains sample measurement data from the [Squiglink Lab][SQUIGLINK_LAB] project.</sup>  
<sup>The Device PEQ bridge is based on work by [jeromeof][DEVICE_PEQ].</sup>

[DOCS]: https://potatosalad775.github.io/modernGraphTool/docs
[RELEASE]: https://github.com/potatosalad775/modernGraphTool/releases
[SQUIGLINK_LAB]: https://github.com/squiglink/lab
[DEVICE_PEQ]: https://github.com/jeromeof/devicePEQ
