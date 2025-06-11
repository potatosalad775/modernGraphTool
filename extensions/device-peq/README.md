# devicePEQ Extension for modernGraphTool

This extension adds a [devicePEQ plugin by jeromeof](https://github.com/jeromeof/devicePEQ) to modernGraphTool.

**You MUST have [`equalizer` extension](../equalizer) installed & enabled in modernGraphTool for this extension to work.**

## Installation

1. Add this folder to your `extensions` folder in modernGraphTool.
2. Update `extensions/extensions.config.js` with the following:
```js
// Highly recommended to insert this config **after** `equalizer` extension's config
{
  NAME: "device-peq",
  DESCRIPTION: `modernGraphTool-compatible wrapper for devicePEQ project by jeromeof (tested with v0.8)`,
  ENABLED: true,
  CONFIG: {
    ADVANCED: false, // Allow users to manipulate advanced dialogs (might be dangerous)
    SHOW_LOGS: false, // Show logs in console
  }
},
```

## Updating devicePEQ

The plugin files of devicePEQ is located at `extensions/device-peq/devicePEQ` folder. You can update it manually by replacing the files in this folder with the latest version.

## Disclaimer

This extension is pre-loaded with [devicePEQ plugin (v0.8) by jeromeof](https://github.com/jeromeof/devicePEQ).
