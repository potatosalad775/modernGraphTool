# Target Customizer Extension for modernGraphTool

This extension adds a target customization feature to modernGraphTool.

## Features
- Tilt adjustment for each separate target
- Bass shelf / Treble shelf / Ear-gain adjustment for each separate target
- Preference adjustment filters

## Installation

1. Add this folder to your `extensions` folder in modernGraphTool.
2. Update `extensions/extensions.config.js` with the following:
```js
{
  NAME: "target-customizer",
  DESCRIPTION: `target customization feature set for modernGraphTool`,
  ENABLED: true,
  I18N_ENABLED: true,
  CONFIG: {
    // Targets that can be customized
    CUSTOMIZABLE_TARGETS: [ "KEMAR DF (KB006x)", "ISO 11904-2 DF" ],
    // Filter Profile Set
    FILTER_SET: [
      { name: 'Harman 2013', filter: { tilt: 0, bass: 6.6, treble: -1.4, ear: 0 }},
      { name: 'Harman 2015', filter: { tilt: 0, bass: 6.6, treble: -3, ear: -1.8 }},
      { name: 'Harman 2018', filter: { tilt: 0, bass: 4.8, treble: -4.4, ear: 0 }},
    ],
    // Applies custom filter to the specified target on initial load
    INITIAL_TARGET_FILTERS: [
      { name: "KEMAR DF (KB006x)", filter: { tilt: -0.8, bass: 6, treble: 0, ear: 0 }},
      { name: "ISO 11904-2 DF", filter: { tilt: -0.8, bass: 6, treble: 0, ear: 0 }},
    ]
  }
},
```