# Preference Bound Extension for modernGraphTool

This extension adds a preference bound feature to modernGraphTool.

## Installation

1. Add this folder to your `extensions` folder in modernGraphTool.
2. Update `extensions/extensions.config.js` with the following:
```js
{
  NAME: "preference-bound",
  DESCRIPTION: `preference bound overlay for modernGraphTool`,
  ENABLED: true,
  I18N_ENABLED: true,
  CONFIG: {
    // Preference Bound requires a file containing bound data.
    // This file must be inside /extensions/preference-bound/data/.
    // When 'BOUND_DATA_FILE' is set to 'Bounds', it will look for the file 'Bounds U.txt' and 'Bounds D.txt'
    // ... where 'U' and 'D' stand for Upper and Lower Bound respectively.
    BOUND_DATA_FILE: "Bounds", 
    // Preference Bound requires base Diffuse Target to be drawn upon.
    // Since original concept of Preference Bound was made upon 5128 DF targets,
    // ... it's generally recommended to use Diffuse Field Targets as baseline,
    // ... or custom 'Delta' 5128-DF Target for IEC 60318-4 if you have one. 
    BASE_DF_TARGET_FILE: "KEMAR DF (KB006x) Target", // needs to be inside /extensions/preference-bound/data/
    // Other configs
    ENABLE_BOUND_ON_INITIAL_LOAD: true,
    COLOR_FILL: "rgba(180, 180, 180, 0.2)",
    COLOR_BORDER: "rgba(120, 120, 120, 0.2)",
  }
},
```

## Disclaimer

This extension is using [d3-interpolate-path by pbeshai](https://github.com/pbeshai/d3-interpolate-path) for smoother path interpolation.