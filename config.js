/**
 * modernGraphTool Configuration - User editable settings
 */
const CONFIG = {
  // Phone & Targets to display on initial load.
  // Note that this will be overridden by URL if it's present.
  INITIAL_PHONES: ["Demo Variations var2"],
  INITIAL_TARGETS: ["KEMAR DF (KB006x)"],
  INITIAL_PANEL: "graph",                               // (phone, graph, misc)
  // Default Normalization Type and Value.
  NORMALIZATION: {
    TYPE: "Hz",                                         // ("Hz" or "Avg" - 300~3000Hz Midrange Average Normalization)
    HZ_VALUE: 500,                                      // This will be ignored if NORMALIZATION.TYPE is "Avg"
  },
  // Default Visualization Settings.
  VISUALIZATION: {
    DEFAULT_Y_SCALE: 60,                                // (40, 60, 80, 100)
    LABEL: {                                            // Phone & Target Label Text Settings
      LOCATION: "BOTTOM_LEFT",                          // (BOTTOM_LEFT, BOTTOM_RIGHT, TOP_LEFT, TOP_RIGHT)
      POSITION: {
        LEFT: "0", RIGHT: "0", UP: "0", DOWN: "0",      // Fine-tune Label Location
      },                                          
      TEXT_SIZE: "20px", 
      TEXT_WEIGHT: "600",                               // (100 ~ 900)
    },
    BASELINE_LABEL: {
      LOCATION: "TOP_LEFT",
      POSITION: {
        LEFT: "0", RIGHT: "0", UP: "0", DOWN: "0",
      },
      TEXT_SIZE: "15px",
      TEXT_WEIGHT: "500",                               // (100 ~ 900)
    },
    RIG_DESCRIPTION: "Measured with IEC 60318-4 (711)", // Please don't leave this line empty, pretty please?
  },
  // User Interface Settings
  INTERFACE: {
    PREFERRED_DARK_MODE_THEME: "light",                 // ("light", "dark", "system")
    ALLOW_REMOVING_PHONE_FROM_SELECTOR: true,           // Setting it to false will prevent user from removing phone from selector.
    SWITCH_PHONE_PANEL_ON_BRAND_CLICK: true,            // Switch to phone list when brand button is clicked (in mobile UI)
    TARGET: {
      ALLOW_MULTIPLE_LINE_PER_TYPE: true,               // This will display targets in multiple line by 'type's. Enabling this option adds collapse button to hide/show target lists.
      OMIT_TARGET_SUFFIX: true,                         // This option will omit 'target' suffix to save some space.
      COLLAPSE_TARGET_LIST_ON_INITIAL: true,            // This option determines whether target list is collapsed on initial load or not.
    },
    HIDE_DEV_DONATE_BUTTON: false,                      // This option determines whether to hide "Donate" button on Misc Panel or not.
  },
  // URL Settings
  URL: {
    AUTO_UPDATE_URL: true,                              // This will automatically update URL when phone/target is changed.
    COMPRESS_URL: true,                                 // Compresses URL with Base62 encoding
  },
  // Language Settings
  LANGUAGE: {
    LANGUAGE_LIST: [                                    // List of available languages. (Automatically fallbacks to "en" if not found)
      ["en", "English"], ["ko", "한국어"]
    ],                        
    ENABLE_I18N: true,                                  // Enable internationalization (Add Language selector to Misc Panel)
    ENABLE_SYSTEM_LANG_DETECTION: true,                 // Enable system language detection
  },
  // File Path Settings
  PATH: {
    PHONE_MEASUREMENT: "./data/phones",
    TARGET_MEASUREMENT: "./data/target",
    PHONE_BOOK: "./data/phone_book.json",               // Changing this value is HIGHLY NOT RECOMMENDED, since it WOULD break squig.link integrations.
  },
  // Watermark Settings
  WATERMARK: [
    { TYPE: "TEXT", CONTENT: "© 2025 modernGraphTool", LOCATION: "BOTTOM_RIGHT",
      SIZE: "15px", FONT_FAMILY: "sans-serif", FONT_WEIGHT: "600", COLOR: "#000000", OPACITY: "0.4",
    },
    // You can even put multiple TEXT or IMAGE in Array. Randomly picked content will be rendered on every load.
    { TYPE: "IMAGE", SIZE: "50px", LOCATION: "TOP_RIGHT", POSITION: {UP: "0", DOWN: "15", LEFT: "46", RIGHT: "0"}, OPACITY: "0.2",
      CONTENT: [
        "./assets/images/icon_1.png", "./assets/images/icon_2.png", "./assets/images/icon_3.png",
      ] 
    }
  ],
  // Target configuration
  TARGET_MANIFEST: {
    // TARGET_MANIFEST works with modernGraphTool Core's internationalization features.
    // You can configure target data in default(EN) language...
    default: [
      { type:"Harman",      files:["Harman IE 2019v2","Harman IE 2017v2"] },
      { type:"Neutral",     files:["KEMAR DF (KB006x)","ISO 11904-2 DF","IEF Neutral 2023"] },
      { type:"Reviewer",    files:["Banbeucmas","HBB","Precogvision","Super 22 Adjusted"] },
      { type:"Preference",  files:["AutoEQ","Rtings","Sonarworks"] },
      { type:"Δ",           files:["Universal ∆"] }
    ],
    // And add more languages as you want.
    i18n: {
      ko: [{ type:"하만" }, { type:"뉴트럴" }, { type:"리뷰어" }, { type:"선호도" }]
    }
  },
  // ... Of course, if you're not interested in localization, you can just skip this setting, as below. 
  //     Note that there are no 'default' and 'i18n' elements here.
  //  TARGET_MANIFEST: [
  //    { type:"Harman",      files:["Harman IE 2019v2","Harman IE 2017v2"] },
  //    { type:"Neutral",     files:["KEMAR DF (KB006x)","ISO 11904-2 DF","IEF Neutral 2023"] },
  //    { type:"Reviewer",    files:["Banbeucmas","HBB","Precogvision","Super 22 Adjusted"] },
  //    { type:"Preference",  files:["AutoEQ","Rtings","Sonarworks"] }
  //  ],
  // Graph Trace Styling
  TRACE_STYLING: {
    PHONE_TRACE_THICKNESS: 2,
    TARGET_TRACE_THICKNESS: 1,
    // For more information about 'stroke-dasharray' attribute, please refer to:
    // https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/stroke-dasharray
    // ... If you want to hide target graph trace, please set 'dash' to '0 1'.
    // ... Or, you can set 'dash' to 'null' to make it look like a solid line.
    TARGET_TRACE_DASH: [{ name: "KEMAR DF (KB006x)", dash: "10 10" }],
  },
  // Topbar Link List
  TOPBAR: {
    TITLE: {
      //TYPE: "TEXT", CONTENT: "modernGraphTool",
      //TYPE: "IMAGE", CONTENT: "./assets/images/sample.jpg",
      TYPE: "HTML", CONTENT: "<h2>modernGraphTool</h2>",
    },
    // 'LINK_LIST' also supports i18n like 'TARGET_MANIFEST'.
    // You MUST add 'http(s)://' to the URL Website PATH.
    LINK_LIST: {
      default: [
        { TITLE: "Github", URL: "https://www.github.com" },
        { TITLE: "Docs", URL: "https://potatosalad775.github.io/modernGraphTool/docs" }, 
      ],
      i18n: {
        ko: [
          { TITLE: "깃허브", URL: "https://www.github.com" },
          { TITLE: "가이드", URL: "https://potatosalad775.github.io/modernGraphTool/docs" }, 
        ]
      }
    },
    // .. You can skip localization options like below.
    //  LINK_LIST: [
    //    { TITLE: "Google", URL: "https://www.google.com" },
    //    { TITLE: "Github", URL: "https://www.github.com" },
    //  ],
  },
  // Misc Panel Description
  // You can add some useful information about your database over here.
  // 'TEXT', 'HTML', 'IMAGE' types are supported.
  DESCRIPTION: {
    default: [
      //{ TYPE: "TEXT", CONTENT: "Every measurements are done by using IEC 60318-4 (711) Ear Simulator." },
      { TYPE: "HTML", CONTENT: "<p>Every measurements are done by using IEC 60318-4 (711) Ear Simulator.</p>" },
    ],
    i18n: {
      ko: [
        //{ TYPE: "TEXT", CONTENT: "모든 데이터는 IEC 60318-4 (711) 이어 시뮬레이터를 활용해 측정되었습니다." },
        { TYPE: "HTML", CONTENT: "<p>모든 데이터는 IEC 60318-4 (711) 이어 시뮬레이터를 활용해 측정되었습니다.</p>" },
      ]
    }
  }
};

window.GRAPHTOOL_CONFIG = CONFIG;
