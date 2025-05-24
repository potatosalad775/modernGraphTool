# squig.link integration Extension for modernGraphTool

This extension adds a squig.link integration feature to modernGraphTool.

## Installation

1. Add this folder to your `extensions` folder in modernGraphTool.
2. Update `extensions/extensions.config.js` with the following:
```js
{
  NAME: "squiglink-integration",
  DESCRIPTION: `squig.link integration for modernGraphTool`,
  ENABLED: true,
  CONFIG: {
    // Set these variables to your own GTM ID and site name
    ANALYTICS_SITE: "",       // Site name for attributing analytics events to your site
    ANALYTICS_GTM_ID: "",     // GTM ID used for analytics. If you don't already have one, you'll need to create a Google Tag Manager account
    LOG_ANALYTICS: true,      // If true, events are logged in console
    ENABLE_ANALYTICS: true,   // If true, analytic features are enabled
  },
},
```