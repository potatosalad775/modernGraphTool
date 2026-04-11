/**
 * Default config values for the Config Editor.
 * Mirrors defaults/config.js — the canonical v2 default configuration.
 */

export interface ConfigFormState {
  INITIAL_PHONES: string[];
  INITIAL_TARGETS: string[];
  INITIAL_PANEL: string;
  NORMALIZATION: {
    TYPE: string;
    HZ_VALUE: number;
  };
  VISUALIZATION: {
    ASPECT_RATIO: string;
    DEFAULT_Y_SCALE: number;
    LABEL: LabelFormState;
    BASELINE_LABEL: LabelFormState;
    RIG_DESCRIPTION: string;
  };
  INTERFACE: {
    PREFERRED_DARK_MODE_THEME: string;
    ALLOW_REMOVING_PHONE_FROM_SELECTOR: boolean;
    SWITCH_PHONE_PANEL_ON_BRAND_CLICK: boolean;
    TARGET: {
      ALLOW_MULTIPLE_LINE_PER_TYPE: boolean;
      OMIT_TARGET_SUFFIX: boolean;
      COLLAPSE_TARGET_LIST_ON_INITIAL: boolean;
    };
    HIDE_DEV_DONATE_BUTTON: boolean;
  };
  URL: {
    AUTO_UPDATE_URL: boolean;
    COMPRESS_URL: boolean;
  };
  CDN_MODE_ENABLED: boolean;
  CDN_MODE: {
    MAJOR_VERSION: number;
    BASE: string;
  };
  LANGUAGE: {
    LANGUAGE_LIST: [string, string][];
    ENABLE_I18N: boolean;
    ENABLE_SYSTEM_LANG_DETECTION: boolean;
  };
  PATH: {
    PHONE_MEASUREMENT: string;
    TARGET_MEASUREMENT: string;
    PHONE_BOOK: string;
  };
  WATERMARK: WatermarkFormState[];
  TARGET_MANIFEST: I18nArrayFormState<TargetManifestEntryForm>;
  MULTI_SAMPLE: {
    DEFAULT_DISPLAY: string;
  };
  HPTF: {
    DEFAULT_DISPLAY: string;
    FILL_OPACITY: number;
  };
  TRACE_STYLING: {
    PHONE_TRACE_THICKNESS: number;
    TARGET_TRACE_THICKNESS: number;
    TARGET_TRACE_DASH: Array<{ name: string; dash: string }>;
  };
  TOPBAR: {
    TITLE: {
      TYPE: string;
      CONTENT: string;
    };
    LINK_LIST: I18nArrayFormState<TopbarLinkForm>;
  };
  PREFERENCE_BOUND_ENABLED: boolean;
  PREFERENCE_BOUND: {
    ENABLE_BOUND_ON_INITIAL_LOAD: boolean;
    BASE_DF_TARGET_FILE: string;
    COLOR_FILL: string;
    COLOR_BORDER: string;
  };
  TARGET_CUSTOMIZER_ENABLED: boolean;
  TARGET_CUSTOMIZER: {
    CUSTOMIZABLE_TARGETS: string[];
    FILTERS: FilterForm[];
    FILTER_PRESET: FilterPresetForm[];
    INITIAL_TARGET_FILTERS: InitialTargetFilterForm[];
  };
  SQUIGLINK_ENABLED: boolean;
  SQUIGLINK: {
    ENABLED: boolean;
    DEBUG: boolean;
    ANALYTICS_MEASUREMENT_IDS: string[];
    ANALYTICS_SITE: string;
    LOG_ANALYTICS: boolean;
    ENABLE_ANALYTICS: boolean;
    ENABLE_CROSS_SITE_SEARCH: boolean;
    ENABLE_SPONSOR: boolean;
  };
  DESCRIPTION: I18nArrayFormState<DescriptionItemForm>;
}

export interface LabelFormState {
  LOCATION: string;
  POSITION: { LEFT: string; RIGHT: string; UP: string; DOWN: string };
  TEXT_SIZE: string;
  TEXT_WEIGHT: string;
}

export interface WatermarkFormState {
  TYPE: string;
  CONTENT: string | string[];
  LOCATION: string;
  SIZE: string;
  FONT_FAMILY?: string;
  FONT_WEIGHT?: string;
  COLOR?: string;
  OPACITY?: string;
  POSITION?: { UP: string; DOWN: string; LEFT: string; RIGHT: string };
}

export interface TargetManifestEntryForm {
  type: string;
  files: string[];
}

export interface TopbarLinkForm {
  TITLE: string;
  URL: string;
}

export interface FilterForm {
  id: string;
  name: string;
  type: string;
  freq: number;
  q: number;
}

export interface FilterPresetForm {
  name: string;
  filter: Record<string, number>;
}

export interface InitialTargetFilterForm {
  name: string;
  filter: Record<string, number>;
}

export interface DescriptionItemForm {
  TYPE: string;
  CONTENT: string;
}

/** Generic i18n array form state: plain array or {default, i18n} wrapper */
export interface I18nArrayFormState<T> {
  useI18n: boolean;
  items: T[];
  i18n: Record<string, T[]>;
}

// ── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_LABEL: LabelFormState = {
  LOCATION: 'BOTTOM_LEFT',
  POSITION: { LEFT: '0', RIGHT: '0', UP: '0', DOWN: '0' },
  TEXT_SIZE: '14px',
  TEXT_WEIGHT: '600',
};

export const DEFAULT_BASELINE_LABEL: LabelFormState = {
  LOCATION: 'TOP_LEFT',
  POSITION: { LEFT: '0', RIGHT: '0', UP: '0', DOWN: '0' },
  TEXT_SIZE: '14px',
  TEXT_WEIGHT: '500',
};

export function createDefaultConfig(): ConfigFormState {
  return {
    INITIAL_PHONES: [],
    INITIAL_TARGETS: [],
    INITIAL_PANEL: 'graph',
    NORMALIZATION: {
      TYPE: 'Hz',
      HZ_VALUE: 500,
    },
    VISUALIZATION: {
      ASPECT_RATIO: 'CrinGraph',
      DEFAULT_Y_SCALE: 50,
      LABEL: { ...DEFAULT_LABEL },
      BASELINE_LABEL: { ...DEFAULT_BASELINE_LABEL },
      RIG_DESCRIPTION: 'Measured with IEC 60318-4 (711)',
    },
    INTERFACE: {
      PREFERRED_DARK_MODE_THEME: 'light',
      ALLOW_REMOVING_PHONE_FROM_SELECTOR: true,
      SWITCH_PHONE_PANEL_ON_BRAND_CLICK: true,
      TARGET: {
        ALLOW_MULTIPLE_LINE_PER_TYPE: true,
        OMIT_TARGET_SUFFIX: true,
        COLLAPSE_TARGET_LIST_ON_INITIAL: true,
      },
      HIDE_DEV_DONATE_BUTTON: false,
    },
    URL: {
      AUTO_UPDATE_URL: true,
      COMPRESS_URL: true,
    },
    CDN_MODE_ENABLED: false,
    CDN_MODE: {
      MAJOR_VERSION: 2,
      BASE: '',
    },
    LANGUAGE: {
      LANGUAGE_LIST: [['en', 'English'], ['ko', '한국어']],
      ENABLE_I18N: true,
      ENABLE_SYSTEM_LANG_DETECTION: true,
    },
    PATH: {
      PHONE_MEASUREMENT: './data/phones',
      TARGET_MEASUREMENT: './data/target',
      PHONE_BOOK: './data/phone_book.json',
    },
    WATERMARK: [
      {
        TYPE: 'TEXT',
        CONTENT: '\u00a9 2025 modernGraphTool',
        LOCATION: 'BOTTOM_RIGHT',
        SIZE: '14px',
        FONT_FAMILY: 'sans-serif',
        FONT_WEIGHT: '600',
      },
    ],
    TARGET_MANIFEST: {
      useI18n: false,
      items: [
        { type: 'Harman', files: ['Harman IE 2019v2', 'Harman IE 2017v2'] },
        { type: 'Neutral', files: ['KEMAR DF (KB006x)', 'ISO 11904-2 DF', 'IEF Neutral 2023'] },
        { type: 'Reviewer', files: ['Banbeucmas', 'HBB', 'Precogvision', 'Super 22 Adjusted'] },
        { type: 'Preference', files: ['AutoEQ', 'Rtings', 'Sonarworks'] },
        { type: '\u0394', files: ['Universal \u0394'] },
      ],
      i18n: {},
    },
    MULTI_SAMPLE: {
      DEFAULT_DISPLAY: 'average',
    },
    HPTF: {
      DEFAULT_DISPLAY: 'fill+curves',
      FILL_OPACITY: 0.3,
    },
    TRACE_STYLING: {
      PHONE_TRACE_THICKNESS: 2,
      TARGET_TRACE_THICKNESS: 1,
      TARGET_TRACE_DASH: [],
    },
    TOPBAR: {
      TITLE: {
        TYPE: 'HTML',
        CONTENT: '<h2>modernGraphTool</h2>',
      },
      LINK_LIST: {
        useI18n: false,
        items: [
          { TITLE: 'Github', URL: 'https://www.github.com' },
          { TITLE: 'Docs', URL: 'https://potatosalad775.github.io/modernGraphTool/docs' },
        ],
        i18n: {},
      },
    },
    PREFERENCE_BOUND_ENABLED: false,
    PREFERENCE_BOUND: {
      ENABLE_BOUND_ON_INITIAL_LOAD: false,
      BASE_DF_TARGET_FILE: 'KEMAR DF (KB006x) Target',
      COLOR_FILL: 'rgba(180,180,180,0.2)',
      COLOR_BORDER: 'rgba(120,120,120,0.5)',
    },
    TARGET_CUSTOMIZER_ENABLED: false,
    TARGET_CUSTOMIZER: {
      CUSTOMIZABLE_TARGETS: ['KEMAR DF (KB006x) Target', 'ISO 11904-2 DF'],
      FILTERS: [
        { id: 'tilt', name: 'Tilt', type: 'TILT', freq: 0, q: 0 },
        { id: 'bass', name: 'Bass', type: 'LSQ', freq: 105, q: 0.707 },
        { id: 'treble', name: 'Treble', type: 'HSQ', freq: 2500, q: 0.42 },
        { id: 'ear', name: 'Ear', type: 'PK', freq: 2750, q: 1 },
        { id: 'pssr', name: 'PSSR', type: 'HSQ', freq: 500, q: 0.4 },
      ],
      FILTER_PRESET: [
        { name: 'Harman 2013', filter: { bass: 6.6, treble: -1.4 } },
        { name: 'Harman 2015', filter: { bass: 6.6, treble: -3, ear: -1.8 } },
        { name: 'Harman 2018', filter: { bass: 4.8, treble: -4.4 } },
      ],
      INITIAL_TARGET_FILTERS: [
        { name: 'KEMAR DF (KB006x)', filter: { tilt: -0.8, bass: 6 } },
        { name: 'ISO 11904-2 DF', filter: { tilt: -0.8, bass: 6 } },
      ],
    },
    SQUIGLINK_ENABLED: false,
    SQUIGLINK: {
      ENABLED: true,
      DEBUG: false,
      ANALYTICS_MEASUREMENT_IDS: [],
      ANALYTICS_SITE: '',
      LOG_ANALYTICS: true,
      ENABLE_ANALYTICS: true,
      ENABLE_CROSS_SITE_SEARCH: true,
      ENABLE_SPONSOR: true,
    },
    DESCRIPTION: {
      useI18n: false,
      items: [
        { TYPE: 'HTML', CONTENT: '<p>Every measurements are done by using IEC 60318-4 (711) Ear Simulator.</p>' },
      ],
      i18n: {},
    },
  };
}
