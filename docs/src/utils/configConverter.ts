/**
 * Config Converter Utilities
 *
 * Parses v1 and CrinGraph config formats and converts them to the v2 format.
 * Also provides v2 parsing + form-state conversion for the Config Editor.
 * All functions are pure — no DOM dependencies.
 */

import {
  createDefaultConfig,
  type ConfigFormState,
  type I18nArrayFormState,
  type TargetManifestEntryForm,
  type TopbarLinkForm,
  type DescriptionItemForm,
  type WatermarkFormState,
  type FilterForm,
  type FilterPresetForm,
  type InitialTargetFilterForm,
} from './configDefaults';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConversionResult {
  output: string;
  warnings: string[];
}

// ── Parsers ──────────────────────────────────────────────────────────────────

/**
 * Parse v1 config.js — expects `const CONFIG = {...}; window.GRAPHTOOL_CONFIG = CONFIG;`
 */
export function parseV1Config(source: string): Record<string, any> {
  try {
    const fn = new Function(`
      const window = {};
      ${source}
      return window.GRAPHTOOL_CONFIG || (typeof CONFIG !== 'undefined' ? CONFIG : undefined);
    `);
    const result = fn();
    if (!result || typeof result !== 'object') {
      throw new Error('Could not extract CONFIG object from config.js');
    }
    return result;
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(`Syntax error in config.js: ${e.message}`);
    }
    throw e;
  }
}

/**
 * Parse v1 extensions.config.js — expects `export const EXTENSION_CONFIG = [...]`
 */
export function parseV1Extensions(source: string): any[] {
  try {
    // Strip ESM export keyword since Function constructor doesn't support it
    const cleaned = source.replace(/export\s+/g, '');
    const fn = new Function(`
      ${cleaned}
      return typeof EXTENSION_CONFIG !== 'undefined' ? EXTENSION_CONFIG : undefined;
    `);
    const result = fn();
    if (!Array.isArray(result)) {
      throw new Error('Could not extract EXTENSION_CONFIG array from extensions.config.js');
    }
    return result;
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(`Syntax error in extensions.config.js: ${e.message}`);
    }
    throw e;
  }
}

/**
 * Parse CrinGraph config.js — flat global variable declarations + function definitions.
 * Strips DOM-dependent functions before evaluation.
 */
export function parseCrinGraphConfig(source: string): Record<string, any> {
  try {
    // Strip function definitions and DOM-dependent code to avoid ReferenceErrors.
    // Remove: function watermark(...){...}, function tsvParse(...){...},
    //         function setLayout(...){...}, setLayout(); calls,
    //         and everything after "Functions to support config options"
    let cleaned = source;

    // Remove everything after the "Functions to support" comment (helper code, DOM stuff)
    const funcCommentIdx = cleaned.indexOf('Functions to support config options');
    if (funcCommentIdx !== -1) {
      // Find the line start before the comment
      const lineStart = cleaned.lastIndexOf('\n', funcCommentIdx);
      cleaned = cleaned.substring(0, lineStart > 0 ? lineStart : funcCommentIdx);
    }

    // Also strip any remaining `let whichXToUse = ...` assignments that reference DOM/undefined vars
    cleaned = cleaned.replace(/let\s+which\w+ToUse\s*=\s*[^;]+;/g, '');

    // Known variable names to extract
    const knownVars = [
      'init_phones', 'DIR', 'default_channels', 'default_normalization',
      'default_norm_db', 'default_norm_hz', 'max_channel_imbalance',
      'alt_layout', 'alt_sticky_graph', 'alt_animated', 'alt_header', 'alt_tutorial',
      'site_url', 'share_url', 'watermark_text', 'watermark_image_url',
      'page_title', 'page_description', 'accessories', 'externalLinksBar',
      'expandable', 'expandableOnly', 'headerHeight',
      'darkModeButton', 'targetDashed', 'targetColorCustom',
      'labelsPosition', 'stickyLabels', 'analyticsEnabled',
      'extraEnabled', 'extraUploadEnabled', 'extraEQEnabled',
      'extraEQBands', 'extraEQBandsMax',
      'targets',
      'preference_bounds_name', 'preference_bounds_dir', 'preference_bounds_startup',
      'allowSquigDownload', 'PHONE_BOOK',
      'default_y_scale', 'default_DF_name', 'dfBaseline',
      'default_bass_shelf', 'default_tilt', 'default_ear', 'default_treble',
      'tiltableTargets', 'compTargets',
      'compensateMeasurementByDefault', 'default_comp_target',
      'showCustomDFAdjustmentButton', 'showCustomDFAdjustmentButtonOnDesktop',
      'allowCreatorSupport', 'enableNonConfidenceIntervalTutorial',
      'allowLanguageSelector', 'availableLanguages', 'defaultLanguage',
      'useBrowserLangAsDefault',
      'translateHeader', 'translateTutorial', 'translateAccessories',
      'translateTargetTypes', 'translateAlertMessages',
      'allowMultipleTargets',
      'harmanFilters',
      'headerLogoText', 'headerLogoImgUrl', 'headerLinks',
      'tutorialDefinitions',
    ];

    const returnExpr = knownVars
      .map(v => `${v}: typeof ${v} !== 'undefined' ? ${v} : undefined`)
      .join(',\n      ');

    const fn = new Function(`
      ${cleaned}
      return { ${returnExpr} };
    `);
    return fn();
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(`Syntax error in CrinGraph config.js: ${e.message}`);
    }
    throw e;
  }
}

// ── v1 → v2 Conversion ──────────────────────────────────────────────────────

export function convertV1ToV2(
  v1Config: Record<string, any>,
  extensions: any[] | null,
): ConversionResult {
  const warnings: string[] = [];
  const v2: Record<string, any> = {};

  // Direct copy sections
  v2.INITIAL_PHONES = v1Config.INITIAL_PHONES ?? [];
  v2.INITIAL_TARGETS = v1Config.INITIAL_TARGETS ?? [];
  v2.INITIAL_PANEL = v1Config.INITIAL_PANEL ?? 'graph';
  v2.NORMALIZATION = v1Config.NORMALIZATION ?? { TYPE: 'Hz', HZ_VALUE: 500 };

  // VISUALIZATION — add ASPECT_RATIO, validate Y_SCALE
  const vis = { ...(v1Config.VISUALIZATION || {}) };
  if (!vis.ASPECT_RATIO) {
    vis.ASPECT_RATIO = 'CrinGraph';
  }
  const validYScales = [30, 40, 50, 60, 80];
  if (vis.DEFAULT_Y_SCALE && !validYScales.includes(vis.DEFAULT_Y_SCALE)) {
    warnings.push(
      `DEFAULT_Y_SCALE ${vis.DEFAULT_Y_SCALE} is not valid in v2 (valid: ${validYScales.join(', ')}). Mapped to 80.`,
    );
    vis.DEFAULT_Y_SCALE = 80;
  }
  v2.VISUALIZATION = vis;

  v2.INTERFACE = v1Config.INTERFACE ?? {
    PREFERRED_DARK_MODE_THEME: 'light',
    ALLOW_REMOVING_PHONE_FROM_SELECTOR: true,
    SWITCH_PHONE_PANEL_ON_BRAND_CLICK: true,
    TARGET: {
      ALLOW_MULTIPLE_LINE_PER_TYPE: true,
      OMIT_TARGET_SUFFIX: true,
      COLLAPSE_TARGET_LIST_ON_INITIAL: true,
    },
    HIDE_DEV_DONATE_BUTTON: false,
  };

  v2.URL = v1Config.URL ?? { AUTO_UPDATE_URL: true, COMPRESS_URL: true };
  v2.LANGUAGE = v1Config.LANGUAGE ?? {
    LANGUAGE_LIST: [['en', 'English']],
    ENABLE_I18N: false,
    ENABLE_SYSTEM_LANG_DETECTION: false,
  };
  v2.PATH = v1Config.PATH ?? {
    PHONE_MEASUREMENT: './data/phones',
    TARGET_MEASUREMENT: './data/target',
    PHONE_BOOK: './data/phone_book.json',
  };

  // WATERMARK — copy as-is (COLOR and OPACITY are supported in v2)
  v2.WATERMARK = v1Config.WATERMARK ?? [];

  v2.TARGET_MANIFEST = v1Config.TARGET_MANIFEST ?? { default: [], i18n: {} };

  // New v2 sections
  v2.MULTI_SAMPLE = { DEFAULT_DISPLAY: 'average' };
  v2.HPTF = { DEFAULT_DISPLAY: 'fill+curves', FILL_OPACITY: 0.3 };

  v2.TRACE_STYLING = v1Config.TRACE_STYLING ?? {
    PHONE_TRACE_THICKNESS: 2,
    TARGET_TRACE_THICKNESS: 1,
    TARGET_TRACE_DASH: [],
  };

  v2.TOPBAR = v1Config.TOPBAR ?? {
    TITLE: { TYPE: 'TEXT', CONTENT: 'modernGraphTool' },
    LINK_LIST: [],
  };

  // Extension configs → v2 sections
  if (extensions && extensions.length > 0) {
    const extMap = new Map<string, any>(extensions.map((e) => [e.NAME, e]));

    // PREFERENCE_BOUND from preference-bound extension
    const pb = extMap.get('preference-bound');
    if (pb?.ENABLED && pb.CONFIG) {
      v2.PREFERENCE_BOUND = {
        ENABLE_BOUND_ON_INITIAL_LOAD: pb.CONFIG.ENABLE_BOUND_ON_INITIAL_LOAD ?? false,
        BASE_DF_TARGET_FILE: pb.CONFIG.BASE_DF_TARGET_FILE ?? 'KEMAR DF (KB006x) Target',
        COLOR_FILL: pb.CONFIG.COLOR_FILL ?? 'rgba(180,180,180,0.2)',
        COLOR_BORDER: pb.CONFIG.COLOR_BORDER ?? 'rgba(120,120,120,0.5)',
      };
    }

    // TARGET_CUSTOMIZER from target-customizer extension
    const tc = extMap.get('target-customizer');
    if (tc?.ENABLED && tc.CONFIG) {
      v2.TARGET_CUSTOMIZER = {
        CUSTOMIZABLE_TARGETS: tc.CONFIG.CUSTOMIZABLE_TARGETS ?? [],
        FILTERS: (tc.CONFIG.FILTERS ?? []).map((f: any) => ({
          id: f.id,
          name: f.name,
          type: f.type,
          freq: f.freq,
          q: f.q,
        })),
        FILTER_PRESET: tc.CONFIG.FILTER_PRESET ?? [],
        INITIAL_TARGET_FILTERS: tc.CONFIG.INITIAL_TARGET_FILTERS ?? [],
      };
    }

    // SQUIGLINK from squiglink-integration extension
    const sq = extMap.get('squiglink-integration');
    if (sq?.ENABLED && sq.CONFIG) {
      v2.SQUIGLINK = {
        ENABLED: true,
        DEBUG: false,
        ANALYTICS_MEASUREMENT_IDS: sq.CONFIG.ANALYTICS_GTM_ID
          ? [sq.CONFIG.ANALYTICS_GTM_ID]
          : [],
        ANALYTICS_SITE: sq.CONFIG.ANALYTICS_SITE ?? '',
        LOG_ANALYTICS: sq.CONFIG.LOG_ANALYTICS ?? true,
        ENABLE_ANALYTICS: sq.CONFIG.ENABLE_ANALYTICS ?? true,
        ENABLE_CROSS_SITE_SEARCH: true,
        ENABLE_SPONSOR: true,
      };
    }
  }

  v2.DESCRIPTION = v1Config.DESCRIPTION ?? {
    default: [],
    i18n: {},
  };

  return { output: generateV2ConfigString(v2), warnings };
}

// ── CrinGraph → v2 Conversion ────────────────────────────────────────────────

function parseYScale(val: any): number {
  if (typeof val === 'number') {
    const valid = [30, 40, 50, 60, 80];
    return valid.includes(val) ? val : 50;
  }
  if (typeof val === 'string') {
    if (val === 'crin') return 50;
    const num = parseInt(val.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num) && [30, 40, 50, 60, 80].includes(num)) return num;
  }
  return 50;
}

function mapLabelPosition(val: any): string {
  const mapping: Record<string, string> = {
    'bottom-left': 'BOTTOM_LEFT',
    'bottom-right': 'BOTTOM_RIGHT',
    'top-left': 'TOP_LEFT',
    'top-right': 'TOP_RIGHT',
    default: 'BOTTOM_LEFT',
  };
  return mapping[String(val ?? '').toLowerCase()] || 'BOTTOM_LEFT';
}

const LANG_NAMES: Record<string, string> = {
  en: 'English', ko: '한국어', ja: '日本語', zh: '中文',
  es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português',
  it: 'Italiano', ru: 'Русский', ar: 'العربية', hi: 'हिन्दी',
  th: 'ไทย', vi: 'Tiếng Việt', id: 'Bahasa Indonesia',
};

export function convertCrinGraphToV2(
  crin: Record<string, any>,
): ConversionResult {
  const warnings: string[] = [];
  const v2: Record<string, any> = {};

  // INITIAL_PHONES
  v2.INITIAL_PHONES = crin.init_phones ?? [];
  v2.INITIAL_TARGETS = [];
  v2.INITIAL_PANEL = 'graph';

  // NORMALIZATION
  const normType = crin.default_normalization;
  if (normType === 'dB') {
    v2.NORMALIZATION = {
      TYPE: 'Hz',
      HZ_VALUE: crin.default_norm_hz ?? 500,
    };
    warnings.push(
      'CrinGraph "dB" normalization mapped to v2 "Hz" normalization. You may need to adjust the HZ_VALUE.',
    );
  } else {
    v2.NORMALIZATION = {
      TYPE: 'Hz',
      HZ_VALUE: crin.default_norm_hz ?? 500,
    };
  }

  // VISUALIZATION
  v2.VISUALIZATION = {
    ASPECT_RATIO: 'CrinGraph',
    DEFAULT_Y_SCALE: parseYScale(crin.default_y_scale),
    LABEL: {
      LOCATION: mapLabelPosition(crin.labelsPosition),
      POSITION: { LEFT: '0', RIGHT: '0', UP: '0', DOWN: '0' },
      TEXT_SIZE: '14px',
      TEXT_WEIGHT: '600',
    },
    BASELINE_LABEL: {
      LOCATION: 'TOP_LEFT',
      POSITION: { LEFT: '0', RIGHT: '0', UP: '0', DOWN: '0' },
      TEXT_SIZE: '14px',
      TEXT_WEIGHT: '500',
    },
    RIG_DESCRIPTION: 'Measured with IEC 60318-4 (711)',
  };

  // INTERFACE
  v2.INTERFACE = {
    PREFERRED_DARK_MODE_THEME: crin.darkModeButton === true ? 'system' : 'light',
    ALLOW_REMOVING_PHONE_FROM_SELECTOR: true,
    SWITCH_PHONE_PANEL_ON_BRAND_CLICK: true,
    TARGET: {
      ALLOW_MULTIPLE_LINE_PER_TYPE: true,
      OMIT_TARGET_SUFFIX: true,
      COLLAPSE_TARGET_LIST_ON_INITIAL: true,
    },
    HIDE_DEV_DONATE_BUTTON: false,
  };

  // URL
  v2.URL = {
    AUTO_UPDATE_URL: crin.share_url ?? true,
    COMPRESS_URL: true,
  };

  // LANGUAGE
  const langCodes: string[] = crin.availableLanguages ?? ['en'];
  v2.LANGUAGE = {
    LANGUAGE_LIST: langCodes.map((code: string) => [code, LANG_NAMES[code] || code]),
    ENABLE_I18N: crin.allowLanguageSelector ?? false,
    ENABLE_SYSTEM_LANG_DETECTION: crin.useBrowserLangAsDefault ?? false,
  };

  // PATH — CrinGraph uses a single DIR; v2 splits phones/targets
  v2.PATH = {
    PHONE_MEASUREMENT: './data/phones',
    TARGET_MEASUREMENT: './data/target',
    PHONE_BOOK: './data/phone_book.json',
  };
  if (crin.DIR && crin.DIR !== 'data/') {
    warnings.push(
      `CrinGraph DIR="${crin.DIR}" detected. v2 uses separate phone/target paths. You may need to reorganize your data directory.`,
    );
  }

  // WATERMARK
  const watermarks: any[] = [];
  if (crin.watermark_text) {
    watermarks.push({
      TYPE: 'TEXT',
      CONTENT: crin.watermark_text,
      LOCATION: 'BOTTOM_RIGHT',
      SIZE: '14px',
      FONT_FAMILY: 'sans-serif',
      FONT_WEIGHT: '600',
    });
  }
  if (crin.watermark_image_url) {
    watermarks.push({
      TYPE: 'IMAGE',
      CONTENT: crin.watermark_image_url,
      LOCATION: 'TOP_RIGHT',
      SIZE: '50px',
      OPACITY: '0.2',
    });
  }
  v2.WATERMARK = watermarks;

  // TARGET_MANIFEST
  const targets = crin.targets ?? [];
  v2.TARGET_MANIFEST = {
    default: targets.map((t: any) => ({
      type: t.type ?? t.name ?? '',
      files: t.files ?? [],
    })),
    i18n: {},
  };

  // MULTI_SAMPLE & HPTF (new v2 features)
  v2.MULTI_SAMPLE = { DEFAULT_DISPLAY: 'average' };
  v2.HPTF = { DEFAULT_DISPLAY: 'fill+curves', FILL_OPACITY: 0.3 };

  // TRACE_STYLING
  v2.TRACE_STYLING = {
    PHONE_TRACE_THICKNESS: 2,
    TARGET_TRACE_THICKNESS: 1,
    TARGET_TRACE_DASH: crin.targetDashed ? [] : [],
  };

  // TOPBAR
  v2.TOPBAR = {
    TITLE: {
      TYPE: 'TEXT',
      CONTENT: crin.page_title || crin.headerLogoText || 'Graph Tool',
    },
    LINK_LIST: (crin.headerLinks ?? []).map((link: any) => ({
      TITLE: link.name ?? '',
      URL: link.url ?? '',
    })),
  };

  // PREFERENCE_BOUND — only emit if relevant fields present
  if (crin.preference_bounds_startup !== undefined || crin.default_DF_name) {
    const dfName = crin.default_DF_name || 'KEMAR DF (KB006x)';
    const dfTarget = dfName.endsWith(' Target') ? dfName : dfName + ' Target';
    v2.PREFERENCE_BOUND = {
      ENABLE_BOUND_ON_INITIAL_LOAD: crin.preference_bounds_startup ?? false,
      BASE_DF_TARGET_FILE: dfTarget,
      COLOR_FILL: 'rgba(180,180,180,0.2)',
      COLOR_BORDER: 'rgba(120,120,120,0.5)',
    };
  }

  // TARGET_CUSTOMIZER — only emit if tiltableTargets present
  if (crin.tiltableTargets && crin.tiltableTargets.length > 0) {
    const customizableTargets = crin.tiltableTargets.map((t: string) =>
      t.endsWith(' Target') ? t : t + ' Target',
    );

    // Map harmanFilters presets
    const filterPreset = (crin.harmanFilters ?? []).map((hf: any) => {
      const filter: Record<string, number> = {};
      if (hf.tilt !== undefined && hf.tilt !== 0) filter.tilt = hf.tilt;
      if (hf.bass_shelf !== undefined && hf.bass_shelf !== 0) filter.bass = hf.bass_shelf;
      if (hf.treble !== undefined && hf.treble !== 0) filter.treble = hf.treble;
      if (hf.ear !== undefined && hf.ear !== 0) filter.ear = hf.ear;
      return { name: hf.name ?? '', filter };
    });

    // Build initial target filters from CrinGraph defaults
    const initialFilter: Record<string, number> = {};
    if (crin.default_tilt !== undefined && crin.default_tilt !== 0)
      initialFilter.tilt = crin.default_tilt;
    if (crin.default_bass_shelf !== undefined && crin.default_bass_shelf !== 0)
      initialFilter.bass = crin.default_bass_shelf;
    if (crin.default_treble !== undefined && crin.default_treble !== 0)
      initialFilter.treble = crin.default_treble;
    if (crin.default_ear !== undefined && crin.default_ear !== 0)
      initialFilter.ear = crin.default_ear;

    const initialTargetFilters = crin.tiltableTargets.map((t: string) => ({
      name: t,
      filter: { ...initialFilter },
    }));

    v2.TARGET_CUSTOMIZER = {
      CUSTOMIZABLE_TARGETS: customizableTargets,
      FILTERS: [
        { id: 'tilt', name: 'Tilt', type: 'TILT', freq: 0, q: 0 },
        { id: 'bass', name: 'Bass', type: 'LSQ', freq: 105, q: 0.707 },
        { id: 'treble', name: 'Treble', type: 'HSQ', freq: 2500, q: 0.42 },
        { id: 'ear', name: 'Ear', type: 'PK', freq: 2750, q: 1 },
      ],
      FILTER_PRESET: filterPreset,
      INITIAL_TARGET_FILTERS: initialTargetFilters,
    };
  }

  // SQUIGLINK — only emit if analytics enabled
  if (crin.analyticsEnabled === true) {
    v2.SQUIGLINK = {
      ENABLED: true,
      DEBUG: false,
      ANALYTICS_MEASUREMENT_IDS: [],
      ANALYTICS_SITE: '',
      LOG_ANALYTICS: true,
      ENABLE_ANALYTICS: true,
      ENABLE_CROSS_SITE_SEARCH: true,
      ENABLE_SPONSOR: true,
    };
  }

  // DESCRIPTION
  v2.DESCRIPTION = {
    default: crin.page_description
      ? [{ TYPE: 'HTML', CONTENT: `<p>${crin.page_description}</p>` }]
      : [],
    i18n: {},
  };

  return { output: generateV2ConfigString(v2), warnings };
}

// ── Output Generation ────────────────────────────────────────────────────────

/**
 * Pretty-print a JS value with proper indentation.
 * Produces JS-style output (unquoted keys, single-quoted strings).
 */
export function prettyPrint(value: any, indent: number): string {
  const pad = '  '.repeat(indent);
  const innerPad = '  '.repeat(indent + 1);

  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    // Check if it's a simple array (all primitives, short enough for one line)
    const isSimple = value.every(
      (v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
    );
    if (isSimple && JSON.stringify(value).length < 80) {
      return '[' + value.map((v) => prettyPrint(v, 0)).join(', ') + ']';
    }
    // Check if it's an array of [code, name] pairs (language list)
    const isLangPairs = value.every(
      (v) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string',
    );
    if (isLangPairs) {
      const items = value.map(
        (v) => `${innerPad}[${prettyPrint(v[0], 0)}, ${prettyPrint(v[1], 0)}]`,
      );
      return '[\n' + items.join(',\n') + '\n' + pad + ']';
    }
    // Complex array
    const items = value.map((v) => `${innerPad}${prettyPrint(v, indent + 1)}`);
    return '[\n' + items.join(',\n') + '\n' + pad + ']';
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    // Check for short inline objects
    const jsonLen = JSON.stringify(value).length;
    if (jsonLen < 60 && !entries.some(([, v]) => typeof v === 'object' && v !== null)) {
      const items = entries.map(([k, v]) => `${formatKey(k)}: ${prettyPrint(v, 0)}`);
      return '{ ' + items.join(', ') + ' }';
    }
    const items = entries.map(
      ([k, v]) => `${innerPad}${formatKey(k)}: ${prettyPrint(v, indent + 1)}`,
    );
    return '{\n' + items.join(',\n') + ',\n' + pad + '}';
  }

  return String(value);
}

/** Format object key — unquoted if valid identifier, quoted otherwise */
export function formatKey(key: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `"${key}"`;
}

/**
 * Generate a complete v2 config.js string with section comments.
 */
export function generateV2ConfigString(config: Record<string, any>): string {
  const sections: string[] = [];

  sections.push(`/**
 * modernGraphTool Configuration
 * Generated by Config Editor
 */
const CONFIG = {`);

  // INITIAL_PHONES / TARGETS / PANEL
  sections.push(`  // Phone & Targets to display on initial load.
  INITIAL_PHONES: ${prettyPrint(config.INITIAL_PHONES, 1)},
  INITIAL_TARGETS: ${prettyPrint(config.INITIAL_TARGETS, 1)},
  INITIAL_PANEL: ${prettyPrint(config.INITIAL_PANEL, 1)},`);

  // NORMALIZATION
  sections.push(`  // Default Normalization Type and Value.
  NORMALIZATION: ${prettyPrint(config.NORMALIZATION, 1)},`);

  // VISUALIZATION
  sections.push(`  // Default Visualization Settings.
  VISUALIZATION: ${prettyPrint(config.VISUALIZATION, 1)},`);

  // INTERFACE
  sections.push(`  // User Interface Settings
  INTERFACE: ${prettyPrint(config.INTERFACE, 1)},`);

  // URL
  sections.push(`  // URL Settings
  URL: ${prettyPrint(config.URL, 1)},`);

  // LANGUAGE
  sections.push(`  // Language Settings
  LANGUAGE: ${prettyPrint(config.LANGUAGE, 1)},`);

  // PATH
  sections.push(`  // File Path Settings
  PATH: ${prettyPrint(config.PATH, 1)},`);

  // WATERMARK
  sections.push(`  // Watermark Settings
  WATERMARK: ${prettyPrint(config.WATERMARK, 1)},`);

  // TARGET_MANIFEST
  sections.push(`  // Target configuration
  TARGET_MANIFEST: ${prettyPrint(config.TARGET_MANIFEST, 1)},`);

  // MULTI_SAMPLE
  if (config.MULTI_SAMPLE) {
    sections.push(`  // Multi-Sample Measurement Settings
  MULTI_SAMPLE: ${prettyPrint(config.MULTI_SAMPLE, 1)},`);
  }

  // HPTF
  if (config.HPTF) {
    sections.push(`  // HpTF (Headphone Transfer Function) Sample Deviation Settings
  HPTF: ${prettyPrint(config.HPTF, 1)},`);
  }

  // TRACE_STYLING
  sections.push(`  // Graph Trace Styling
  TRACE_STYLING: ${prettyPrint(config.TRACE_STYLING, 1)},`);

  // TOPBAR
  sections.push(`  // Topbar Link List
  TOPBAR: ${prettyPrint(config.TOPBAR, 1)},`);

  // PREFERENCE_BOUND (optional)
  if (config.PREFERENCE_BOUND) {
    sections.push(`  // Preference Bound Settings
  PREFERENCE_BOUND: ${prettyPrint(config.PREFERENCE_BOUND, 1)},`);
  }

  // TARGET_CUSTOMIZER (optional)
  if (config.TARGET_CUSTOMIZER) {
    sections.push(`  // Target Customizer Settings
  TARGET_CUSTOMIZER: ${prettyPrint(config.TARGET_CUSTOMIZER, 1)},`);
  }

  // SQUIGLINK (optional)
  if (config.SQUIGLINK) {
    sections.push(`  // squig.link Integration Settings
  SQUIGLINK: ${prettyPrint(config.SQUIGLINK, 1)},`);
  }

  // DESCRIPTION
  sections.push(`  // Misc Panel Description
  DESCRIPTION: ${prettyPrint(config.DESCRIPTION, 1)},`);

  sections.push(`};

window.GRAPHTOOL_CONFIG = CONFIG;`);

  return sections.join('\n');
}

// ── v2 Parsing & Form-State Conversion ──────────────────────────────────────

/**
 * Parse v2 config.js — same format as v1: `const CONFIG = {...}; window.GRAPHTOOL_CONFIG = CONFIG;`
 */
export function parseV2Config(source: string): Record<string, any> {
  try {
    const fn = new Function(`
      const window = {};
      ${source}
      return window.GRAPHTOOL_CONFIG || (typeof CONFIG !== 'undefined' ? CONFIG : undefined);
    `);
    const result = fn();
    if (!result || typeof result !== 'object') {
      throw new Error('Could not extract CONFIG object from config.js');
    }
    return result;
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(`Syntax error in config.js: ${e.message}`);
    }
    throw e;
  }
}

/** Detect if a value uses the i18n wrapper pattern { default: [...], i18n: {...} } */
function isI18nWrapped(val: any): val is { default: any[]; i18n: Record<string, any[]> } {
  return val && typeof val === 'object' && !Array.isArray(val) && 'default' in val;
}

/** Convert a raw config i18n-capable field to I18nArrayFormState */
function toI18nArrayState<T>(val: any): I18nArrayFormState<T> {
  if (isI18nWrapped(val)) {
    return {
      useI18n: true,
      items: val.default ?? [],
      i18n: val.i18n ?? {},
    };
  }
  if (Array.isArray(val)) {
    return { useI18n: false, items: val, i18n: {} };
  }
  return { useI18n: false, items: [], i18n: {} };
}

/**
 * Convert a parsed v2 config object into ConfigFormState for the editor.
 */
export function configToFormState(raw: Record<string, any>): ConfigFormState {
  const defaults = createDefaultConfig();

  const state: ConfigFormState = {
    INITIAL_PHONES: raw.INITIAL_PHONES ?? defaults.INITIAL_PHONES,
    INITIAL_TARGETS: raw.INITIAL_TARGETS ?? defaults.INITIAL_TARGETS,
    INITIAL_PANEL: raw.INITIAL_PANEL ?? defaults.INITIAL_PANEL,
    NORMALIZATION: {
      TYPE: raw.NORMALIZATION?.TYPE ?? defaults.NORMALIZATION.TYPE,
      HZ_VALUE: raw.NORMALIZATION?.HZ_VALUE ?? defaults.NORMALIZATION.HZ_VALUE,
    },
    VISUALIZATION: {
      ASPECT_RATIO: raw.VISUALIZATION?.ASPECT_RATIO ?? defaults.VISUALIZATION.ASPECT_RATIO,
      DEFAULT_Y_SCALE: raw.VISUALIZATION?.DEFAULT_Y_SCALE ?? defaults.VISUALIZATION.DEFAULT_Y_SCALE,
      LABEL: raw.VISUALIZATION?.LABEL
        ? { ...defaults.VISUALIZATION.LABEL, ...raw.VISUALIZATION.LABEL, POSITION: { ...defaults.VISUALIZATION.LABEL.POSITION, ...(raw.VISUALIZATION.LABEL?.POSITION ?? {}) } }
        : { ...defaults.VISUALIZATION.LABEL },
      BASELINE_LABEL: raw.VISUALIZATION?.BASELINE_LABEL
        ? { ...defaults.VISUALIZATION.BASELINE_LABEL, ...raw.VISUALIZATION.BASELINE_LABEL, POSITION: { ...defaults.VISUALIZATION.BASELINE_LABEL.POSITION, ...(raw.VISUALIZATION.BASELINE_LABEL?.POSITION ?? {}) } }
        : { ...defaults.VISUALIZATION.BASELINE_LABEL },
      RIG_DESCRIPTION: raw.VISUALIZATION?.RIG_DESCRIPTION ?? defaults.VISUALIZATION.RIG_DESCRIPTION,
    },
    INTERFACE: {
      PREFERRED_DARK_MODE_THEME: raw.INTERFACE?.PREFERRED_DARK_MODE_THEME ?? defaults.INTERFACE.PREFERRED_DARK_MODE_THEME,
      ALLOW_REMOVING_PHONE_FROM_SELECTOR: raw.INTERFACE?.ALLOW_REMOVING_PHONE_FROM_SELECTOR ?? defaults.INTERFACE.ALLOW_REMOVING_PHONE_FROM_SELECTOR,
      SWITCH_PHONE_PANEL_ON_BRAND_CLICK: raw.INTERFACE?.SWITCH_PHONE_PANEL_ON_BRAND_CLICK ?? defaults.INTERFACE.SWITCH_PHONE_PANEL_ON_BRAND_CLICK,
      TARGET: {
        ALLOW_MULTIPLE_LINE_PER_TYPE: raw.INTERFACE?.TARGET?.ALLOW_MULTIPLE_LINE_PER_TYPE ?? defaults.INTERFACE.TARGET.ALLOW_MULTIPLE_LINE_PER_TYPE,
        OMIT_TARGET_SUFFIX: raw.INTERFACE?.TARGET?.OMIT_TARGET_SUFFIX ?? defaults.INTERFACE.TARGET.OMIT_TARGET_SUFFIX,
        COLLAPSE_TARGET_LIST_ON_INITIAL: raw.INTERFACE?.TARGET?.COLLAPSE_TARGET_LIST_ON_INITIAL ?? defaults.INTERFACE.TARGET.COLLAPSE_TARGET_LIST_ON_INITIAL,
      },
      HIDE_DEV_DONATE_BUTTON: raw.INTERFACE?.HIDE_DEV_DONATE_BUTTON ?? defaults.INTERFACE.HIDE_DEV_DONATE_BUTTON,
    },
    URL: {
      AUTO_UPDATE_URL: raw.URL?.AUTO_UPDATE_URL ?? defaults.URL.AUTO_UPDATE_URL,
      COMPRESS_URL: raw.URL?.COMPRESS_URL ?? defaults.URL.COMPRESS_URL,
    },
    CDN_MODE_ENABLED: !!raw.CDN_MODE,
    CDN_MODE: {
      MAJOR_VERSION: raw.CDN_MODE?.MAJOR_VERSION ?? defaults.CDN_MODE.MAJOR_VERSION,
      BASE: raw.CDN_MODE?.BASE ?? defaults.CDN_MODE.BASE,
    },
    LANGUAGE: {
      LANGUAGE_LIST: raw.LANGUAGE?.LANGUAGE_LIST ?? defaults.LANGUAGE.LANGUAGE_LIST,
      ENABLE_I18N: raw.LANGUAGE?.ENABLE_I18N ?? defaults.LANGUAGE.ENABLE_I18N,
      ENABLE_SYSTEM_LANG_DETECTION: raw.LANGUAGE?.ENABLE_SYSTEM_LANG_DETECTION ?? defaults.LANGUAGE.ENABLE_SYSTEM_LANG_DETECTION,
    },
    PATH: {
      PHONE_MEASUREMENT: raw.PATH?.PHONE_MEASUREMENT ?? defaults.PATH.PHONE_MEASUREMENT,
      TARGET_MEASUREMENT: raw.PATH?.TARGET_MEASUREMENT ?? defaults.PATH.TARGET_MEASUREMENT,
      PHONE_BOOK: raw.PATH?.PHONE_BOOK ?? defaults.PATH.PHONE_BOOK,
    },
    WATERMARK: (raw.WATERMARK ?? defaults.WATERMARK).map((w: any): WatermarkFormState => ({
      TYPE: w.TYPE ?? 'TEXT',
      CONTENT: w.CONTENT ?? '',
      LOCATION: w.LOCATION ?? 'BOTTOM_RIGHT',
      SIZE: w.SIZE ?? '14px',
      FONT_FAMILY: w.FONT_FAMILY,
      FONT_WEIGHT: w.FONT_WEIGHT,
      COLOR: w.COLOR,
      OPACITY: w.OPACITY,
      POSITION: w.POSITION,
    })),
    TARGET_MANIFEST: toI18nArrayState<TargetManifestEntryForm>(raw.TARGET_MANIFEST ?? defaults.TARGET_MANIFEST),
    MULTI_SAMPLE: {
      DEFAULT_DISPLAY: raw.MULTI_SAMPLE?.DEFAULT_DISPLAY ?? defaults.MULTI_SAMPLE.DEFAULT_DISPLAY,
    },
    HPTF: {
      DEFAULT_DISPLAY: raw.HPTF?.DEFAULT_DISPLAY ?? defaults.HPTF.DEFAULT_DISPLAY,
      FILL_OPACITY: raw.HPTF?.FILL_OPACITY ?? defaults.HPTF.FILL_OPACITY,
    },
    TRACE_STYLING: {
      PHONE_TRACE_THICKNESS: raw.TRACE_STYLING?.PHONE_TRACE_THICKNESS ?? defaults.TRACE_STYLING.PHONE_TRACE_THICKNESS,
      TARGET_TRACE_THICKNESS: raw.TRACE_STYLING?.TARGET_TRACE_THICKNESS ?? defaults.TRACE_STYLING.TARGET_TRACE_THICKNESS,
      TARGET_TRACE_DASH: raw.TRACE_STYLING?.TARGET_TRACE_DASH ?? defaults.TRACE_STYLING.TARGET_TRACE_DASH,
    },
    TOPBAR: {
      TITLE: {
        TYPE: raw.TOPBAR?.TITLE?.TYPE ?? defaults.TOPBAR.TITLE.TYPE,
        CONTENT: raw.TOPBAR?.TITLE?.CONTENT ?? defaults.TOPBAR.TITLE.CONTENT,
      },
      LINK_LIST: toI18nArrayState<TopbarLinkForm>(raw.TOPBAR?.LINK_LIST ?? defaults.TOPBAR.LINK_LIST),
    },
    PREFERENCE_BOUND_ENABLED: !!raw.PREFERENCE_BOUND,
    PREFERENCE_BOUND: {
      ENABLE_BOUND_ON_INITIAL_LOAD: raw.PREFERENCE_BOUND?.ENABLE_BOUND_ON_INITIAL_LOAD ?? defaults.PREFERENCE_BOUND.ENABLE_BOUND_ON_INITIAL_LOAD,
      BASE_DF_TARGET_FILE: raw.PREFERENCE_BOUND?.BASE_DF_TARGET_FILE ?? defaults.PREFERENCE_BOUND.BASE_DF_TARGET_FILE,
      COLOR_FILL: raw.PREFERENCE_BOUND?.COLOR_FILL ?? defaults.PREFERENCE_BOUND.COLOR_FILL,
      COLOR_BORDER: raw.PREFERENCE_BOUND?.COLOR_BORDER ?? defaults.PREFERENCE_BOUND.COLOR_BORDER,
    },
    TARGET_CUSTOMIZER_ENABLED: !!raw.TARGET_CUSTOMIZER,
    TARGET_CUSTOMIZER: {
      CUSTOMIZABLE_TARGETS: raw.TARGET_CUSTOMIZER?.CUSTOMIZABLE_TARGETS ?? defaults.TARGET_CUSTOMIZER.CUSTOMIZABLE_TARGETS,
      FILTERS: (raw.TARGET_CUSTOMIZER?.FILTERS ?? defaults.TARGET_CUSTOMIZER.FILTERS).map((f: any): FilterForm => ({
        id: f.id ?? '', name: f.name ?? '', type: f.type ?? 'PK', freq: f.freq ?? 0, q: f.q ?? 0,
      })),
      FILTER_PRESET: (raw.TARGET_CUSTOMIZER?.FILTER_PRESET ?? defaults.TARGET_CUSTOMIZER.FILTER_PRESET).map((p: any): FilterPresetForm => ({
        name: p.name ?? '', filter: p.filter ?? {},
      })),
      INITIAL_TARGET_FILTERS: (raw.TARGET_CUSTOMIZER?.INITIAL_TARGET_FILTERS ?? defaults.TARGET_CUSTOMIZER.INITIAL_TARGET_FILTERS).map((t: any): InitialTargetFilterForm => ({
        name: t.name ?? '', filter: t.filter ?? {},
      })),
    },
    SQUIGLINK_ENABLED: !!raw.SQUIGLINK,
    SQUIGLINK: {
      ENABLED: raw.SQUIGLINK?.ENABLED ?? defaults.SQUIGLINK.ENABLED,
      DEBUG: raw.SQUIGLINK?.DEBUG ?? defaults.SQUIGLINK.DEBUG,
      ANALYTICS_MEASUREMENT_IDS: raw.SQUIGLINK?.ANALYTICS_MEASUREMENT_IDS ?? defaults.SQUIGLINK.ANALYTICS_MEASUREMENT_IDS,
      ANALYTICS_SITE: raw.SQUIGLINK?.ANALYTICS_SITE ?? defaults.SQUIGLINK.ANALYTICS_SITE,
      LOG_ANALYTICS: raw.SQUIGLINK?.LOG_ANALYTICS ?? defaults.SQUIGLINK.LOG_ANALYTICS,
      ENABLE_ANALYTICS: raw.SQUIGLINK?.ENABLE_ANALYTICS ?? defaults.SQUIGLINK.ENABLE_ANALYTICS,
      ENABLE_CROSS_SITE_SEARCH: raw.SQUIGLINK?.ENABLE_CROSS_SITE_SEARCH ?? defaults.SQUIGLINK.ENABLE_CROSS_SITE_SEARCH,
      ENABLE_SPONSOR: raw.SQUIGLINK?.ENABLE_SPONSOR ?? defaults.SQUIGLINK.ENABLE_SPONSOR,
    },
    DESCRIPTION: toI18nArrayState<DescriptionItemForm>(raw.DESCRIPTION ?? defaults.DESCRIPTION),
  };

  return state;
}

/** Convert I18nArrayFormState back to raw config format (plain array or i18n wrapper) */
function fromI18nArrayState<T>(state: I18nArrayFormState<T>): any {
  if (!state.useI18n) return state.items;
  return { default: state.items, i18n: state.i18n };
}

/**
 * Convert ConfigFormState back to a v2 config.js string.
 */
export function formStateToConfigString(state: ConfigFormState): string {
  const config: Record<string, any> = {};

  config.INITIAL_PHONES = state.INITIAL_PHONES;
  config.INITIAL_TARGETS = state.INITIAL_TARGETS;
  config.INITIAL_PANEL = state.INITIAL_PANEL;
  config.NORMALIZATION = state.NORMALIZATION;
  config.VISUALIZATION = state.VISUALIZATION;
  config.INTERFACE = state.INTERFACE;
  config.URL = state.URL;

  if (state.CDN_MODE_ENABLED) {
    const cdn: Record<string, any> = { MAJOR_VERSION: state.CDN_MODE.MAJOR_VERSION };
    if (state.CDN_MODE.BASE) cdn.BASE = state.CDN_MODE.BASE;
    config.CDN_MODE = cdn;
  }

  config.LANGUAGE = state.LANGUAGE;
  config.PATH = state.PATH;
  config.WATERMARK = state.WATERMARK;
  config.TARGET_MANIFEST = fromI18nArrayState(state.TARGET_MANIFEST);
  config.MULTI_SAMPLE = state.MULTI_SAMPLE;
  config.HPTF = state.HPTF;
  config.TRACE_STYLING = state.TRACE_STYLING;
  config.TOPBAR = {
    TITLE: state.TOPBAR.TITLE,
    LINK_LIST: fromI18nArrayState(state.TOPBAR.LINK_LIST),
  };

  if (state.PREFERENCE_BOUND_ENABLED) {
    config.PREFERENCE_BOUND = state.PREFERENCE_BOUND;
  }
  if (state.TARGET_CUSTOMIZER_ENABLED) {
    config.TARGET_CUSTOMIZER = state.TARGET_CUSTOMIZER;
  }
  if (state.SQUIGLINK_ENABLED) {
    config.SQUIGLINK = state.SQUIGLINK;
  }

  config.DESCRIPTION = fromI18nArrayState(state.DESCRIPTION);

  return generateV2ConfigString(config);
}
