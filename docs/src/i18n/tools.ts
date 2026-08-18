/**
 * Translations for the three interactive tools.
 *
 * Keyed by the English source string, which is how the Docusaurus original
 * worked (`<Translate>` + `i18n/ko/code.json`) — keeping the keys means the
 * Korean strings carried over verbatim and stay greppable against the old file.
 *
 * A missing key falls back to the English source, so a partial translation is
 * fine. Several strings were already untranslated on the old site and are
 * simply absent here rather than being duplicated as English-to-English.
 *
 * This is separate from Starlight's own UI i18n, which covers the site chrome.
 */

export type ToolLang = 'en' | 'ko';

const ko: Record<string, string> = {
	// ── Page headers ─────────────────────────────────────────────────────────
	'Config Editor': '설정 파일 편집기',
	'Build or edit your modernGraphTool config.js with a visual editor. Import an existing config, adjust settings, and export the result.':
		'비주얼 편집기로 modernGraphTool의 config.js를 만들거나 수정할 수 있습니다. 기존 설정을 불러오고, 항목을 조정한 뒤 결과를 내보내세요.',
	'phone_book.json Editor': 'phone_book.json 편집기',
	'Theme Generator': '테마 생성기',
	'Build a custom theme.css for modernGraphTool with a visual editor. Adjust colors, preview the result, and export the CSS.':
		'비주얼 편집기로 modernGraphTool의 theme.css를 만들 수 있습니다. 색상을 조정하고 결과를 미리 본 뒤 CSS를 내보내세요.',

	// ── Theme generator ──────────────────────────────────────────────────────
	'Semantic Colors': 'Semantic 컬러',
	'Random All': '전체 무작위',
	'Base Tone': '기본 톤',
	'Base Hue': '기본 색상(Hue)',
	'Base Saturation': '기본 채도',
	'Light Surface': '라이트 표면 밝기',
	'Dark Surface': '다크 표면 밝기',
	'Controls the base palette (backgrounds, text, borders). Hue and saturation tint every surface; the surface sliders set how light each mode starts. A near-white surface can only hold a faint tint, so lower Light Surface to push saturation further.':
		'배경, 텍스트, 테두리에 쓰이는 기본 팔레트를 조정합니다. 색상과 채도는 모든 표면에 색조를 입히고, 표면 슬라이더는 각 모드의 밝기 기준을 정합니다. 흰색에 가까운 표면은 옅은 색조만 표현할 수 있으므로, 채도를 더 올리려면 라이트 표면 밝기를 낮추세요.'
};

const dictionaries: Record<ToolLang, Record<string, string> | undefined> = {
	en: undefined,
	ko
};

/**
 * Returns a `t()` bound to one locale. The tool pages build both an English and
 * a Korean route, so the locale is known at build time and never at runtime.
 */
export function createTranslator(lang: ToolLang): (source: string) => string {
	const dict = dictionaries[lang];
	return (source) => dict?.[source] ?? source;
}

/** Narrows Astro's `currentLocale`, which is `string | undefined`. */
export function toToolLang(locale: string | undefined): ToolLang {
	return locale === 'ko' ? 'ko' : 'en';
}
