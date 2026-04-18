<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { toast } from 'svelte-sonner';
	import { graphEngine } from '$lib/graph/GraphEngine.svelte.js';
	import { analyticsService } from '$lib/services/analytics-service.svelte.js';
	import Button from '../atoms/Button.svelte';
	import { Camera } from '@lucide/svelte';

	// Force light-theme values for SVG export so the PNG looks the same regardless
	// of the active theme. Mirrors the `:root` block in defaults/theme.css.
	const LIGHT_THEME_VARS: Record<string, string> = {
		'--color-graph-grid-major': 'rgba(0, 0, 0, 0.15)',
		'--color-graph-grid-minor': 'rgba(0, 0, 0, 0.06)',
		'--color-graph-axis-label': 'rgba(0, 0, 0, 0.6)',
		'--color-graph-grid-text': 'rgba(0, 0, 0, 0.5)',
		'--color-graph-baseline': 'rgba(0, 0, 0, 0.25)',
		'--color-graph-bg': 'transparent',
		'--color-base-100': 'oklch(98% 0.003 247.858)',
		'--color-base-200': 'oklch(96% 0.007 247.896)',
		'--color-base-content': 'oklch(20% 0.042 265.755)'
	};

	async function inlineImageHref(image: SVGImageElement): Promise<void> {
		const href =
			image.getAttribute('href') ?? image.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
		if (!href || href.startsWith('data:')) return;
		try {
			const res = await fetch(href);
			if (!res.ok) return;
			const blob = await res.blob();
			const dataUrl = await new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => resolve(reader.result as string);
				reader.onerror = () => reject(reader.error);
				reader.readAsDataURL(blob);
			});
			image.setAttribute('href', dataUrl);
			image.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
		} catch {
			// leave the original href; the image will simply be missing from the PNG
		}
	}

	async function downloadScreenshot() {
		analyticsService.trackGeneralEvent('clicked_download');
		const svgNode = graphEngine.svg?.node();
		if (!svgNode) return;

		const clone = svgNode.cloneNode(true) as SVGSVGElement;

		clone.querySelectorAll('.y-scaler-handle').forEach((el) => el.remove());

		await Promise.all(
			Array.from(clone.querySelectorAll('image')).map((el) =>
				inlineImageHref(el as SVGImageElement)
			)
		);

		// Get dimensions from viewBox
		const viewBox = svgNode.getAttribute('viewBox');
		const [, , vbWidth, vbHeight] = (viewBox ?? '0 0 800 450').split(' ').map(Number);
		clone.setAttribute('width', String(vbWidth));
		clone.setAttribute('height', String(vbHeight));

		// Mount the clone in a hidden, light-themed container so var(--color-*)
		// references resolve to light values regardless of the active theme.
		const lightContainer = document.createElement('div');
		lightContainer.style.cssText =
			'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;';
		for (const [name, value] of Object.entries(LIGHT_THEME_VARS)) {
			lightContainer.style.setProperty(name, value);
		}
		lightContainer.appendChild(clone);
		document.body.appendChild(lightContainer);

		let svgUrl: string;
		try {
			// Apply computed styles to all elements in the clone (read from the
			// clone so styles resolve under the forced light-theme container).
			const cloneElements = clone.querySelectorAll('*');
			const styleProps = [
				'fill',
				'stroke',
				'font-size',
				'font-family',
				'font-weight',
				'opacity',
				'stroke-width',
				'stroke-dasharray'
			];
			cloneElements.forEach((el) => {
				const computed = getComputedStyle(el);
				const cloneEl = el as HTMLElement;
				for (const prop of styleProps) {
					const val = computed.getPropertyValue(prop);
					if (val) cloneEl.style.setProperty(prop, val);
				}
			});

			// Always export with a pure white background.
			const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			bgRect.setAttribute('width', String(vbWidth));
			bgRect.setAttribute('height', String(vbHeight));
			bgRect.setAttribute('fill', '#ffffff');
			clone.insertBefore(bgRect, clone.firstChild);

			const svgData = new XMLSerializer().serializeToString(clone);
			const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
			svgUrl = URL.createObjectURL(svgBlob);
		} finally {
			lightContainer.remove();
		}

		const scale = 2;
		const canvas = document.createElement('canvas');
		canvas.width = vbWidth * scale;
		canvas.height = vbHeight * scale;
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			URL.revokeObjectURL(svgUrl);
			return;
		}

		const img = new Image();
		img.onload = () => {
			ctx.scale(scale, scale);
			ctx.drawImage(img, 0, 0);
			URL.revokeObjectURL(svgUrl);

			const pngUrl = canvas.toDataURL('image/png');
			const a = document.createElement('a');
			a.href = pngUrl;
			a.download = 'graph.png';
			a.click();
			toast.success(m.screenshot_button_label());
		};
		img.onerror = () => {
			URL.revokeObjectURL(svgUrl);
			toast.error('Screenshot failed');
		};
		img.src = svgUrl;
	}
</script>

<Button
	title={m.screenshot_button_label()}
	onclick={downloadScreenshot}
	variant="muted"
	class="h-9! gap-1.5 px-3!"
>
	<Camera class="h-4 w-4" aria-hidden="true" />
	{m.screenshot_button_label()}
</Button>
