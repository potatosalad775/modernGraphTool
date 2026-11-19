<script lang="ts" module>
	/*
	 * The icon set for the three tools.
	 *
	 * Inline SVG rather than the glyphs the Docusaurus port used (`&#9654;`, `↑`,
	 * `×`, `A↓`). Those pick up whatever the reader's emoji/symbol fallback font
	 * supplies, so their weight and baseline drifted between platforms and none of
	 * them optically centred inside a square button.
	 *
	 * Starlight's own `<Icon>` is an Astro component and cannot be called from a
	 * Svelte island, so these are drawn to match it: 24×24 box, `currentColor`,
	 * 2px round-joined strokes.
	 */
	export type IconName =
		| 'chevron'
		| 'check'
		| 'minus'
		| 'plus'
		| 'close'
		| 'arrow-up'
		| 'arrow-down'
		| 'sort'
		| 'trash'
		| 'copy'
		| 'download'
		| 'upload'
		| 'external'
		| 'alert'
		| 'star';

	const PATHS: Record<IconName, string> = {
		chevron: 'M9 5l7 7-7 7',
		check: 'M4 12l5 5L20 6',
		minus: 'M5 12h14',
		plus: 'M12 5v14M5 12h14',
		close: 'M6 6l12 12M18 6L6 18',
		'arrow-up': 'M12 19V5M5 12l7-7 7 7',
		'arrow-down': 'M12 5v14M19 12l-7 7-7-7',
		sort: 'M7 4v16M3 17l4 4 4-4M14 7h7M14 12h5M14 17h3',
		trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
		copy: 'M9 9h10v10H9zM5 15V5h10',
		download: 'M12 3v12M7 11l5 5 5-5M4 20h16',
		upload: 'M12 17V5M7 9l5-5 5 5M4 20h16',
		external: 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5',
		alert: 'M12 3.5L2.5 20h19zM12 9.5V14M12 17v.01',
		star: 'M12 2.6l2.5 6.6 7 .3-5.5 4.4 1.9 6.8-5.9-3.9-5.9 3.9 1.9-6.8-5.5-4.4 7-.3z'
	};
</script>

<script lang="ts">
	interface Props {
		name: IconName;
		/** Extra classes; `ceIcon` supplies the default 1rem box. */
		class?: string;
		/** Fills the shape as well as stroking it: a rated star against an unrated one. */
		filled?: boolean;
	}

	let { name, class: className = 'ceIcon', filled = false }: Props = $props();
</script>

<svg
	class={className}
	viewBox="0 0 24 24"
	fill={filled ? 'currentColor' : 'none'}
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	<path d={PATHS[name]} />
</svg>
