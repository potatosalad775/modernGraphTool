<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { toast } from 'svelte-sonner';
	import { graphEngine } from '$lib/graph/GraphEngine.svelte.js';
	import { analyticsService } from '$lib/services/analytics-service.svelte.js';
	import Button from '../atoms/Button.svelte';
	import { Camera } from '@lucide/svelte';

	async function downloadScreenshot() {
		analyticsService.trackGeneralEvent('clicked_download');
		const svgNode = graphEngine.svg?.node();
		if (!svgNode) return;

		const clone = svgNode.cloneNode(true) as SVGSVGElement;

		// Get dimensions from viewBox
		const viewBox = svgNode.getAttribute('viewBox');
		const [, , vbWidth, vbHeight] = (viewBox ?? '0 0 800 450').split(' ').map(Number);
		clone.setAttribute('width', String(vbWidth));
		clone.setAttribute('height', String(vbHeight));

		// Apply computed styles to all elements in the clone
		const sourceElements = svgNode.querySelectorAll('*');
		const cloneElements = clone.querySelectorAll('*');
		const styleProps = ['fill', 'stroke', 'font-size', 'font-family', 'font-weight', 'opacity', 'stroke-width', 'stroke-dasharray'];
		sourceElements.forEach((src, i) => {
			const computed = getComputedStyle(src);
			const cloneEl = cloneElements[i] as HTMLElement;
			if (!cloneEl) return;
			for (const prop of styleProps) {
				const val = computed.getPropertyValue(prop);
				if (val) cloneEl.style.setProperty(prop, val);
			}
		});

		// Determine background color
		const graphArea = document.querySelector('.graph-area');
		const bgColor = graphArea
			? getComputedStyle(graphArea).backgroundColor
			: getComputedStyle(document.documentElement).getPropertyValue('--color-base-200').trim();

		// Add background rect
		const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		bgRect.setAttribute('width', String(vbWidth));
		bgRect.setAttribute('height', String(vbHeight));
		bgRect.setAttribute('fill', bgColor);
		clone.insertBefore(bgRect, clone.firstChild);

		const svgData = new XMLSerializer().serializeToString(clone);
		const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
		const svgUrl = URL.createObjectURL(svgBlob);

		const scale = 2;
		const canvas = document.createElement('canvas');
		canvas.width = vbWidth * scale;
		canvas.height = vbHeight * scale;
		const ctx = canvas.getContext('2d');
		if (!ctx) { URL.revokeObjectURL(svgUrl); return; }

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
	class="h-9! px-3! gap-1.5"
>
	<Camera class="h-4 w-4" aria-hidden="true" />
	{m.screenshot_button_label()}
</Button>
