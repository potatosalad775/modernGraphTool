<script lang="ts">
	import { onMount } from 'svelte';
	import type { Component } from 'svelte';
	import { Dialog } from 'bits-ui';
	import * as m from '#lib/paraglide/messages.js';
	import { appStore } from '#lib/stores/app-store.svelte.js';
	import { menuStore } from '#lib/stores/menu-store.svelte.js';
	import { tutorialStore } from '#lib/stores/tutorial-store.svelte.js';
	import Button from '../atoms/Button.svelte';
	import { ExternalLink } from '@lucide/svelte';
	import { tourSteps, type TutorialTarget } from './tutorial-steps.js';
	import TutorialText from './TutorialText.svelte';
	import { revealBox, scrollParent } from '#lib/utils/scroll-anchor.js';

	const steps = $derived(tourSteps(tutorialStore.tour, appStore.isMobile));

	let targetRect = $state<DOMRect | null>(null);
	let innerHeight = $state(0);
	let dialogHeight = $state(0);

	const currentStep = $derived(Math.min(tutorialStore.step, steps.length - 1));
	const step = $derived(steps[currentStep]);
	const isFirst = $derived(currentStep === 0);
	const isLast = $derived(currentStep === steps.length - 1);
	const currentTarget = $derived<TutorialTarget | null>(step?.target ?? null);
	const hasSpotlight = $derived(currentTarget !== null && targetRect !== null);

	const spotlightStyle = $derived.by(() => {
		if (!targetRect) return '';
		const pad = 6;
		const top = targetRect.top - pad;
		const left = targetRect.left - pad;
		const width = targetRect.width + pad * 2;
		const height = targetRect.height + pad * 2;
		return `top:${top}px;left:${left}px;width:${width}px;height:${height}px;box-shadow:0 0 0 9999px rgba(0,0,0,0.55);`;
	});

	const dialogStyle = $derived.by(() => {
		if (!hasSpotlight || !targetRect || innerHeight === 0) {
			return 'top:50%;left:50%;transform:translate(-50%,-50%);';
		}
		// Pinned 1rem from an edge, clear of the spotlight's 6 px padding.
		const needed = dialogHeight + 16 + 12;
		const spaceAbove = targetRect.top;
		const spaceBelow = innerHeight - targetRect.bottom;
		const fitsAbove = spaceAbove >= needed;
		const fitsBelow = spaceBelow >= needed;
		// The side the dialog fits on, the roomier one if both. If neither — a tall target,
		// the band list on a phone — the bottom: the target was scrolled to its top, so the
		// dialog covers its end and leaves the heading and first controls in view.
		const placeBottom = fitsBelow && fitsAbove ? spaceBelow >= spaceAbove : !fitsAbove;
		return placeBottom
			? 'bottom:1rem;left:50%;transform:translateX(-50%);'
			: 'top:1rem;left:50%;transform:translateX(-50%);';
	});

	/**
	 * A short screen — a DAP's, a phone in landscape. The dialog tightens up, and on a
	 * spotlight step drops its tip lines so it covers less of the target. A step without
	 * a target keeps them: on the PWA step they are the install instructions.
	 */
	const compact = $derived(innerHeight > 0 && innerHeight < 600);
	const showTips = $derived(!(compact && hasSpotlight));

	/** The bounding box of every element carrying the target, or null if none is laid out. */
	function measure(elements: Element[]): DOMRect | null {
		const rects = elements.map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0);
		if (rects.length === 0) return null;
		const top = Math.min(...rects.map((r) => r.top));
		const left = Math.min(...rects.map((r) => r.left));
		const bottom = Math.max(...rects.map((r) => r.bottom));
		const right = Math.max(...rects.map((r) => r.right));
		return new DOMRect(left, top, right - left, bottom - top);
	}

	$effect(() => {
		// Closing: keep the last rect. Clearing it re-centres the dialog and darkens the
		// overlay, and bits-ui keeps the content mounted until those transitions finish.
		if (!tutorialStore.isOpen) return;
		if (!currentTarget) {
			targetRect = null;
			return;
		}

		const target = currentTarget;
		const query = () => Array.from(document.querySelectorAll(`[data-tutorial-target="${target}"]`));
		const update = () => {
			const rect = measure(query());
			targetRect = rect;
			return rect;
		};

		// On a phone the Equalizer panel is one scrolling column, so a later section's
		// header can start below the fold. Scroll once per step; the scroll listener
		// below then follows it there. Every element the step frames, and against the
		// scroller's own view: on a phone the menu bar sits below it, inside the window.
		const elements = query();
		const box = measure(elements);
		const container = elements[0] && scrollParent(elements[0]);
		// 6 px: the spotlight's padding, so its ring isn't clipped either.
		if (box && container) revealBox(container, box, 6);

		// Follow the target frame by frame until it has held still for a while: the
		// graph handle is created after the SVG mounts, and the Equalizer tour opens
		// before that panel's slide-in has started. Svelte's Web Animations
		// transitions fire no `animationend`, and a fixed delay misses a late landing.
		let frame = 0;
		let still = 0;
		let last = '';
		const follow = () => {
			// The returned rect, not `targetRect`: reading that state here would make
			// this effect depend on what it writes.
			const r = update();
			const key = r ? `${r.x},${r.y},${r.width},${r.height}` : '';
			still = key === last ? still + 1 : 0;
			last = key;
			if (still < 20) frame = requestAnimationFrame(follow);
		};
		follow();

		const ro = new ResizeObserver(update);
		ro.observe(document.body);
		window.addEventListener('resize', update);
		window.addEventListener('scroll', update, true);

		return () => {
			cancelAnimationFrame(frame);
			ro.disconnect();
			window.removeEventListener('resize', update);
			window.removeEventListener('scroll', update, true);
		};
	});

	// Open straight away: on a first visit this text block is the LCP element, so a
	// settle-in delay counts against LCP in full. Spotlight steps track their own
	// late-mounting targets (the effect above).
	onMount(() => {
		if (!tutorialStore.isDismissed('welcome')) tutorialStore.open('welcome');
	});

	// The Equalizer tour, the first time that panel is opened. Waits out any tour
	// already showing — and so follows straight on from the welcome tour when a
	// visit starts on the Equalizer.
	$effect(() => {
		if (menuStore.currentPanel !== 'equalizer' || tutorialStore.isOpen) return;
		if (!tutorialStore.isDismissed('equalizer')) tutorialStore.open('equalizer');
	});

	function next() {
		if (isLast) tutorialStore.dismiss();
		else tutorialStore.step = currentStep + 1;
	}

	function prev() {
		if (!isFirst) tutorialStore.step = currentStep - 1;
	}
</script>

<svelte:window bind:innerHeight />

<Dialog.Root
	bind:open={
		() => tutorialStore.isOpen,
		(v) => {
			if (!v) tutorialStore.dismiss();
		}
	}
>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-40 transition-colors duration-300 {hasSpotlight
				? ''
				: 'bg-black/50 backdrop-blur-sm'}"
		/>
		{#if hasSpotlight}
			<div
				aria-hidden="true"
				class="pointer-events-none fixed z-40 rounded-lg border-2 border-accent transition-all duration-300 ease-out"
				style={spotlightStyle}
			></div>
		{/if}
		<!--
			A tap outside is a mis-tap or a reach for the spotlit control, not a request
			to end the tour — which would also mark it seen. Skip, Done and Escape close it.
		-->
		<Dialog.Content
			interactOutsideBehavior="ignore"
			class="fixed z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl bg-base-200 shadow-2xl transition-[top,bottom,left,transform] duration-300 ease-out"
			style={dialogStyle}
		>
			<!-- Measured for placement: whether the dialog fits beside its target. -->
			<div bind:clientHeight={dialogHeight}>
				<div class={compact ? 'px-4 py-3' : 'px-6 py-4'}>
					{#if step.icon}
						{@const icon = step.icon}
						<div
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-lg {compact
								? 'mb-2'
								: 'mb-3'}"
						>
							{#if typeof icon === 'string'}
								{icon}
							{:else}
								{@const IconComponent = icon as Component}
								<IconComponent size={20} />
							{/if}
						</div>
					{/if}

					{#if step.title}
						<Dialog.Title class="text-base font-semibold text-base-content">
							<TutorialText text={step.title()} />
						</Dialog.Title>
					{:else}
						<Dialog.Title class="sr-only">Tutorial step {currentStep + 1}</Dialog.Title>
					{/if}

					<Dialog.Description class="mt-1 text-sm leading-relaxed text-base-content/70">
						<TutorialText text={step.content()} />
					</Dialog.Description>

					{#if step.tips && showTips}
						<div class="mt-3 space-y-1.5 text-xs text-base-content/55">
							{#each step.tips as tip, i (i)}
								<p><TutorialText text={tip()} /></p>
							{/each}
						</div>
					{/if}

					{#if step.guideLinkLabel}
						<a
							href="https://potatosalad775.github.io/modernGraphTool/docs/category/guide-for-users"
							target="_blank"
							rel="noopener noreferrer"
							class="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-colors hover:underline"
						>
							{step.guideLinkLabel()}
							<ExternalLink size={14} aria-hidden="true" />
						</a>
					{/if}
				</div>

				<div
					class="flex items-center justify-between border-t border-base-content/10 {compact
						? 'px-4 py-2'
						: 'px-6 py-3'}"
				>
					<div class="flex gap-1.5">
						{#each steps as _, i (i)}
							<button
								type="button"
								class="h-1.5 rounded-full transition-all {i === currentStep
									? 'w-4 bg-accent'
									: 'w-1.5 bg-base-content/20 hover:bg-base-content/35'}"
								onclick={() => (tutorialStore.step = i)}
								aria-label="Go to step {i + 1}"
							></button>
						{/each}
					</div>

					<div class="flex items-center gap-2">
						{#if !isLast}
							<Button
								title={m.tutorial_modal_btn_skip()}
								variant="ghost"
								size="sm"
								class="text-base-content/50 hover:text-base-content/70"
								onclick={() => tutorialStore.dismiss()}
							>
								{m.tutorial_modal_btn_skip()}
							</Button>
						{/if}

						{#if !isFirst}
							<Button title={m.tutorial_modal_btn_prev()} onclick={prev} variant="ghost" size="sm">
								{m.tutorial_modal_btn_prev()}
							</Button>
						{/if}

						<Button
							title={isLast ? m.tutorial_modal_btn_done() : m.tutorial_modal_btn_next()}
							onclick={next}
							variant="primary"
							size="sm"
						>
							{isLast ? m.tutorial_modal_btn_done() : m.tutorial_modal_btn_next()}
						</Button>
					</div>
				</div>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
