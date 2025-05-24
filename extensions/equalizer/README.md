# Equalizer Extension for modernGraphTool

This extension adds a Equalizer feature to modernGraphTool.

## Installation

1. Add this folder to your `extensions` folder in modernGraphTool.
2. Update `extensions/extensions.config.js` with the following:
```js
{
  NAME: "equalizer",
  DESCRIPTION: `equalizer panel for modernGraphTool`,
  ENABLED: true,
  I18N_ENABLED: true, // This enables modernGraphTool's core to manage equalizer extension's language strings.
  CONFIG: {
    INITIAL_EQ_BANDS: 5, // Number of Equalizer Bands at start
    MAXIMUM_EQ_BANDS: 20, // Maximum Number of Equalizer Bands
  },
},
```