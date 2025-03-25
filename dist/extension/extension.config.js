/**
 * Extension Configuration
 */
const EXTENSION_CONFIG = [
  {
    // name: (text) - Must be identical with folder name
    NAME: "template",
    // description: (text) - Not really needed in functionality, but just in case
    DESCRIPTION: `sample description`,
    // enabled: (true / false) - Enable or Disable Extension
    ENABLED: false,
  },
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
  {
    NAME: "frequency-tutorial",
    DESCRIPTION: `frequency tutorial for modernGraphTool`,
    ENABLED: true,
    CONFIG: {
      USE_ENGLISH_ONLY: false,
    },
  },
];

window.EXTENSION_CONFIG = EXTENSION_CONFIG;
