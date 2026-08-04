/**
 * modernGraphTool Configuration
 *
 * This file holds the settings most deployments change. Everything else has a
 * sensible built-in default and is listed further down as a commented stub —
 * uncomment a stub to start using that feature.
 *
 * Full reference for every option, with examples:
 *   https://potatosalad775.github.io/modernGraphTool/docs/guide-for-admins/customize-page
 *
 * Prefer not to hand-edit? Build this file visually, or import an existing one:
 *   https://potatosalad775.github.io/modernGraphTool/docs/config-generator
 */
const CONFIG = {
	// Phone & Targets to display on initial load.
	// Note that this will be overridden by URL if it's present.
	INITIAL_PHONES: ['Demo Variations var2'],
	INITIAL_TARGETS: ['KEMAR DF (KB006x)'],
	INITIAL_PANEL: 'graph', // (phone, graph, misc)

	// Default Normalization Type and Value.
	NORMALIZATION: {
		TYPE: 'Hz', // ("Hz" or "Avg" - 300~3000Hz Midrange Average Normalization)
		HZ_VALUE: 500 // This will be ignored if NORMALIZATION.TYPE is "Avg"
	},

	// Default Visualization Settings.
	VISUALIZATION: {
		ASPECT_RATIO: '16:9', // ("16:9" or "CrinGraph") — 16:9 = 800×450, CrinGraph = 800×346
		DEFAULT_Y_SCALE: 50, // (30, 40, 50, 60, 80)
		RIG_DESCRIPTION: 'Measured with IEC 60318-4 (711)' // Please don't leave this line empty, pretty please?
		// Add LABEL / BASELINE_LABEL here to move the on-graph labels. LOCATION is
		// the anchor corner (BOTTOM_LEFT, BOTTOM_RIGHT, TOP_LEFT, TOP_RIGHT) and
		// POSITION nudges it from there. Defaults match the layout you see now.
		// → docs: VISUALIZATION
	},

	// User Interface Settings
	INTERFACE: {
		PREFERRED_DARK_MODE_THEME: 'light', // ("light", "dark", "system")
		PANEL_POSITION: 'left', // ("left" or "right") — which side the menu+panel column sits on in desktop UI. Mobile UI is unaffected.
		ALLOW_REMOVING_PHONE_FROM_SELECTOR: true, // Setting it to false will prevent user from removing phone from selector.
		SWITCH_PHONE_PANEL_ON_BRAND_CLICK: true, // Switch to phone list when brand button is clicked (in mobile UI)
		HIDE_DEV_DONATE_BUTTON: false, // This option determines whether to hide "Donate" button on Misc Panel or not.
		TARGET: {
			ALLOW_MULTIPLE_LINE_PER_TYPE: true, // Display targets in multiple lines by 'type'. Adds a collapse button.
			OMIT_TARGET_SUFFIX: true, // Omit the 'Target' suffix to save some space.
			COLLAPSE_TARGET_LIST_ON_INITIAL: true // Whether the target list starts collapsed.
		}
	},

	// File Path Settings
	PATH: {
		PHONE_MEASUREMENT: './data/phones',
		TARGET_MEASUREMENT: './data/target',
		PHONE_BOOK: './data/phone_book.json' // Changing this value is HIGHLY NOT RECOMMENDED, since it WOULD break squig.link integrations.
	},

	// Target list, grouped by type. Supports i18n — see docs → TARGET_MANIFEST.
	TARGET_MANIFEST: [
		{ type: 'Harman', files: ['Harman IE 2019v2', 'Harman IE 2017v2'] },
		{ type: 'Neutral', files: ['KEMAR DF (KB006x)', 'ISO 11904-2 DF', 'IEF Neutral 2023'] },
		{ type: 'Reviewer', files: ['Banbeucmas', 'HBB', 'Precogvision', 'Super 22 Adjusted'] },
		{ type: 'Preference', files: ['AutoEQ', 'Rtings', 'Sonarworks'] },
		{ type: 'Δ', files: ['Universal ∆'] }
	],

	// Per-target Tilt / Bass / Treble / Ear sliders. Those four filters and the
	// Harman 2013/2015/2018 presets are built in; list which targets get the
	// sliders, and optionally the adjustment each starts at.
	// → docs: TARGET_CUSTOMIZER
	TARGET_CUSTOMIZER: {
		CUSTOMIZABLE_TARGETS: ['KEMAR DF (KB006x) Target', 'ISO 11904-2 DF'],
		// FILTER_PRESET replaces the built-in Harman 2013/2015/2018 presets.
		// FILTERS replaces the built-in filter list — it does not extend it, so
		// restate the ones you want to keep. This example is the four defaults
		// plus the Harman 2025 MoA set:
		// FILTERS: [
		//   { id: 'tilt', name: 'Tilt (dB/oct)', type: 'TILT', freq: 0, q: 0 },
		//   { id: 'bass', name: 'Bass (dB)', type: 'LSQ', freq: 105, q: 0.707 },
		//   { id: 'treble', name: 'Treble (dB)', type: 'HSQ', freq: 2500, q: 0.42 },
		//   { id: 'ear', name: 'Ear (dB)', type: 'PK', freq: 2750, q: 1 },
		//   { id: 'harman_moa_2025_bass', name: 'Harman MoA 2025 Bass (dB)',
		//     type: 'LSQ', freq: 164, q: 0.4, description: 'Based on Harman 2025 MoA Research.' },
		//   { id: 'harman_moa_2025_treble', name: 'Harman MoA 2025 Treble (dB)',
		//     type: 'HSQ', freq: 4304, q: 0.41, description: 'Based on Harman 2025 MoA Research.' },
		//   { id: 'harman_moa_2025_ear', name: 'Harman MoA 2025 Ear (dB)',
		//     type: 'PK', freq: 3000, q: 2, description: 'Based on Harman 2025 MoA Research.' },
		// ],
		INITIAL_TARGET_FILTERS: [
			{ name: 'KEMAR DF (KB006x)', filter: { tilt: -0.8, bass: 6 } },
			{ name: 'ISO 11904-2 DF', filter: { tilt: -0.8, bass: 6 } }
		]
	},

	// Shaded upper/lower preference-range overlay. Needs Bounds U.txt and
	// Bounds D.txt in your data/ folder. → docs: PREFERENCE_BOUND
	PREFERENCE_BOUND: {
		ENABLE_BOUND_ON_INITIAL_LOAD: false, // Show the bounds immediately on page load
		BASE_DF_TARGET_FILE: 'KEMAR DF (KB006x) Target', // Reference DF target; "" disables the feature
		COLOR_FILL: 'rgba(180,180,180,0.2)',
		COLOR_BORDER: 'rgba(120,120,120,0.5)'
	},

	// Language selector on the Misc panel. ENABLE_I18N must be true for it to
	// appear at all. LANGUAGE_LIST restricts which of the build's locales are
	// offered — omit it to offer all of them. → docs: LANGUAGE
	LANGUAGE: {
		ENABLE_I18N: true,
		ENABLE_SYSTEM_LANG_DETECTION: true,
		LANGUAGE_LIST: [
			['cs', 'Čeština'],
			['en', 'English'],
			['ko', '한국어'],
			['ru', 'Русский'],
			['uk', 'Українська']
		]
	},

	// Topbar title. 'TEXT', 'HTML' and 'IMAGE' types are supported.
	// LINK_LIST adds links next to it, and supports i18n — see docs → TOPBAR.
	TOPBAR: {
		TITLE: { TYPE: 'HTML', CONTENT: '<h2>modernGraphTool</h2>' },
		LINK_LIST: [
			{ TITLE: 'Github', URL: 'https://www.github.com' },
			{ TITLE: 'Docs', URL: 'https://potatosalad775.github.io/modernGraphTool/docs' }
		]
	},

	// URL Settings
	URL: {
		AUTO_UPDATE_URL: true, // Update the URL when phone/target selection changes.
		COMPRESS_URL: true // Compresses URL with Base62 encoding
	},

	// ─────────────────────────────────────────────────────────────────────────
	// Optional features — each falls back to a built-in default while commented
	// out. To switch one on, uncomment it and edit the values; the trailing
	// commas are already in place, so nothing else needs changing.
	// Full option lists live in the docs section named after each one.
	// ─────────────────────────────────────────────────────────────────────────

	// Watermark — text and/or images drawn over the graph. Accepts an array;
	// one entry is picked at random per page load. → docs: WATERMARK
	// WATERMARK: [
	//   { TYPE: 'TEXT', CONTENT: '© 2025 modernGraphTool', LOCATION: 'BOTTOM_RIGHT',
	//     POSITION: { UP: '43', DOWN: '0', LEFT: '32', RIGHT: '0' },
	//     OPACITY: '0.3', SIZE: '14px', FONT_FAMILY: 'sans-serif', FONT_WEIGHT: '600' },
	// ],

	// Curve thickness, color palette and target dash patterns. Defaults to the
	// colorblind-safe Okabe-Ito palette. → docs: TRACE_STYLING
	// TRACE_STYLING: {
	//   PHONE_TRACE_THICKNESS: 2,
	//   TARGET_TRACE_THICKNESS: 1,
	//   CURVE_COLOR_PALETTE: ['#0072B2', '#E69F00', '#009E73', '#CC79A7'],
	//   CURVE_COLOR_PALETTE_RANDOMIZE: true,
	//   TARGET_TRACE_DASH: [{ name: 'KEMAR DF (KB006x)', dash: '10 10' }],
	// },

	// Sample sets — variants measured more than once (repeat runs, pad swaps,
	// seating positions). Configured per variant in phone_book.json; this only
	// sets the defaults. → docs: SAMPLES
	// SAMPLES: {
	//   DEFAULT_COUNT: 1,               // Runs per variant when the phone book declares none
	//   DEFAULT_DISPLAY: ['avg'],       // Any of 'avg', 'curves' (per-run), 'fill' (min/max band)
	//   FILL_OPACITY: 0.3,
	// },

	// Search other measurement databases from the device search box. On by
	// default, using the shared GraphAggregator index. → docs: CROSS_SITE_SEARCH
	// CROSS_SITE_SEARCH: {
	//   ENABLED: true,
	//   INDEX_URLS: [],          // Empty = official index + its mirror
	//   SQUIGLINK_FALLBACK: true,
	// },

	// Link the review score in the phone list to your ranking page.
	// Placeholders: {brand}, {model}, {slug}, {fullName}. → docs: RANKING_URL
	// RANKING_URL: '',

	// Per-curve download button in the selection list. Exports the curve exactly
	// as displayed — smoothing, normalization, target adjustments and EQ are
	// baked in — as CrinGraph-style "Frequency dB" .txt files. Off by default.
	// → docs: DOWNLOAD
	// DOWNLOAD: {
	//   ENABLED: true,
	// },

	// Only active on *.squig.link domains: analytics, sponsor banner, shop links.
	// → docs: SQUIGLINK
	// SQUIGLINK: {
	//   ENABLED: true,
	//   ANALYTICS_MEASUREMENT_IDS: [],   // GA4 IDs, e.g. ['G-XXXXXXX']
	//   ANALYTICS_SITE: '',
	//   ENABLE_ANALYTICS: true,
	//   ENABLE_SPONSOR: true,
	// },

	// CDN deployment only — for the thin cdn-index.html. Leave commented out
	// when deploying the full dist/ folder. → docs: CDN_MODE
	// CDN_MODE: {
	//   MAJOR_VERSION: 2,        // Auto-updates within this major version
	//   // BASE: 'https://cdn.jsdelivr.net/gh/potatosalad775/modernGraphTool@cdn',
	//   // BASE_PATH: '/cdn',    // Only when served from a subdirectory
	// },

	// Deprecated, still read so existing files keep working. Migrate to SAMPLES.
	// MULTI_SAMPLE.DEFAULT_DISPLAY: 'average' -> ['avg'], 'all' -> ['avg','curves']
	// HPTF.FILL_OPACITY -> SAMPLES.FILL_OPACITY
	// MULTI_SAMPLE: { DEFAULT_DISPLAY: 'average' },
	// HPTF: { DEFAULT_DISPLAY: 'fill+curves', FILL_OPACITY: 0.3 },

	// ─────────────────────────────────────────────────────────────────────────

	// Information about your database, shown on the Misc panel.
	// 'TEXT', 'HTML' and 'IMAGE' types are supported, and it accepts i18n.
	// Kept last on purpose: it closes the object, so every stub above can be
	// uncommented as-is without leaving a trailing comma dangling.
	DESCRIPTION: [
		{
			TYPE: 'HTML',
			CONTENT: '<p>Every measurements are done by using IEC 60318-4 (711) Ear Simulator.</p>'
		}
	]
};

window.GRAPHTOOL_CONFIG = CONFIG;
