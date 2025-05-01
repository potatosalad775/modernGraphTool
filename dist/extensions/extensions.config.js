/**
 * Extension Configuration
 */
export const EXTENSION_CONFIG = [
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
      // These targets must be included as INITIAL_TARGETS in config.js to take effect.
      INITIAL_TARGET_FILTERS: [
        { name: "KEMAR DF (KB006x)", filter: { tilt: -0.8, bass: 0, treble: 0, ear: 0 }},
        { name: "ISO 11904-2 DF", filter: { tilt: -0.8, bass: 0, treble: 0, ear: 0 }},
      ]
    }
  },
  {
    NAME: "squiglink-integration",
    DESCRIPTION: `squig.link integration for modernGraphTool`,
    ENABLED: false,
    CONFIG: {
      // Set these variables to your own GTM ID and site name
      ANALYTICS_SITE: "",       // Site name for attributing analytics events to your site
      ANALYTICS_GTM_ID: "",     // GTM ID used for analytics. If you don't already have one, you'll need to create a Google Tag Manager account
      LOG_ANALYTICS: true,      // If true, events are logged in console
      ENABLE_ANALYTICS: true,   // If true, analytic features are enabled
    },
  },
];
