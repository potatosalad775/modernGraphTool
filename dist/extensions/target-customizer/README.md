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
    FILTERS: [
      { id: "tilt", name: "Tilt", description: "Filter for adjusting the overall tonal balance",
        type: "TILT", freq: 0, q: 0 },
      { id: "bass", name: "Bass", description: "Filter for adjusting low frequencies",
        type: "LSQ", freq: 105, q: 0.707 },
      { id: "treble", name: "Treble", description: "Filter for adjusting high frequencies",
        type: "HSQ", freq: 2500, q: 0.42 },
      { id: "ear", name: "Ear", description: "Filter for adjusting ear gain",
        type: "PK", freq: 2750, q: 1 },
      { id: "pssr", name: "PSSR", description: "Predicted Steady State Response",
        type: "HSQ", freq: 500, q: 0.4 },
    ],
    // Targets that can be customized
    CUSTOMIZABLE_TARGETS: [ "KEMAR DF (KB006x)", "ISO 11904-2 DF" ],
    // Filter Preset
    FILTER_PRESET: [
      { name: 'Harman 2013', filter: { bass: 6.6, treble: -1.4 }},
      { name: 'Harman 2015', filter: { bass: 6.6, treble: -3, ear: -1.8 }},
      { name: 'Harman 2018', filter: { bass: 4.8, treble: -4.4 }},
    ],
    // Applies custom filter to the specified target on initial load
    INITIAL_TARGET_FILTERS: [
      { name: "KEMAR DF (KB006x)", filter: { tilt: -0.8, bass: 6 }},
      { name: "ISO 11904-2 DF", filter: { tilt: -0.8, bass: 6 }},
    ]
  }
},
```