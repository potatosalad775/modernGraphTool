<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { toast } from '#lib/services/toast.js';
	import { graphEngine } from '#lib/graph/GraphEngine.svelte.js';
	import { analyticsService } from '#lib/services/analytics-service.svelte.js';
	import Button from '../atoms/Button.svelte';
	import { Camera } from '@lucide/svelte';

	import { exportBackgroundFills, resolveLightTheme } from '#lib/utils/light-theme.js';

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
		const svgNode = graphEngine.svg.node();
		if (!svgNode) return;

		const clone = svgNode.cloneNode(true) as SVGSVGElement;

		clone.querySelectorAll('.y-scaler-handle').forEach((el) => el.remove());

		await Promise.all(Array.from(clone.querySelectorAll('image')).map((el) => inlineImageHref(el)));

		// Get dimensions from viewBox
		const viewBox = svgNode.getAttribute('viewBox');
		const [, , vbWidth, vbHeight] = (viewBox ?? '0 0 800 450').split(' ').map(Number);
		clone.setAttribute('width', String(vbWidth));
		clone.setAttribute('height', String(vbHeight));

		// Mount the clone in a hidden container that carries the light palette inline, so
		// var(--color-*) references resolve to light values regardless of the active theme
		// (`.dark` on <html> would otherwise win by inheritance). The palette is read from the
		// loaded theme.css, so an operator's own light theme is what gets exported.
		const lightVars = resolveLightTheme();
		const lightContainer = document.createElement('div');
		lightContainer.style.cssText =
			'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;';
		for (const [name, value] of Object.entries(lightVars)) {
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

			// Pure white, plus the light theme's own graph background when it sets one.
			const bgRects = exportBackgroundFills(lightVars).map((fill) => {
				const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
				rect.setAttribute('width', String(vbWidth));
				rect.setAttribute('height', String(vbHeight));
				rect.setAttribute('fill', fill);
				return rect;
			});
			clone.prepend(...bgRects);

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
			toast.error(m.screenshot_button_failed());
		};
		img.src = svgUrl;
	}
</script>

<Button
	label={m.screenshot_button_label()}
	onclick={downloadScreenshot}
	variant="muted"
	size="toolbar"
>
	{#snippet icon()}<Camera class="h-4 w-4" aria-hidden="true" />{/snippet}
</Button>
