<script lang="ts">
	import { onMount } from 'svelte';
	import type { Component } from 'svelte';
	import { Dialog } from 'bits-ui';
	import * as m from '$lib/paraglide/messages';
	import { appStore } from '$lib/stores/app-store.svelte';
	import Button from '../atoms/Button.svelte';
	import {
		ArrowRightLeft,
		ArrowUpDown,
		BookOpen,
		ExternalLink,
		Keyboard,
		MoveHorizontal
	} from '@lucide/svelte';

	const STORAGE_KEY = 'gt-tutorial-dismissed';

	type TutorialTarget = 'menu' | 'graph_handle' | 'divider' | 'keyboard';

	interface TutorialStep {
		title?: () => string;
		content: () => string;
		extra?: () => string;
		extra2?: () => string;
		guideLinkLabel?: () => string;
		icon: string | Component;
		target?: TutorialTarget;
	}

	const steps: TutorialStep[] = $derived.by(() => {
		const base: TutorialStep[] = [
			{
				title: m.tutorial_modal_intro_title,
				content: m.tutorial_modal_intro_content,
				icon: '👋'
			},
			{
				content: m.tutorial_modal_menu_content,
				icon: ArrowRightLeft,
				target: 'menu'
			},
			{
				content: m.tutorial_modal_graph_handle_content,
				icon: ArrowUpDown,
				target: 'graph_handle'
			}
		];

		if (appStore.isMobile) {
			base.push({
				title: m.tutorial_modal_pwa_title,
				content: m.tutorial_modal_pwa_content,
				extra: m.tutorial_modal_pwa_inst_ios,
				extra2: m.tutorial_modal_pwa_inst_android,
				icon: '📱'
			});
		} else {
			base.push({
				content: m.tutorial_modal_divider_content,
				icon: MoveHorizontal,
				target: 'divider'
			});
			base.push({
				content: m.tutorial_modal_shortcuts_content,
				icon: Keyboard,
				target: 'keyboard'
			});
		}

		base.push({
			title: m.tutorial_modal_guide_title,
			content: m.tutorial_modal_guide_content,
			guideLinkLabel: m.tutorial_modal_guide_link,
			icon: BookOpen
		});

		return base;
	});

	let open = $state(false);
	let currentStep = $state(0);
	let targetRect = $state<DOMRect | null>(null);
	let viewportSize = $state({ w: 0, h: 0 });

	const isFirst = $derived(currentStep === 0);
	const isLast = $derived(currentStep === steps.length - 1);
	const currentTarget = $derived<TutorialTarget | null>(steps[currentStep]?.target ?? null);
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
		if (!hasSpotlight || !targetRect || viewportSize.h === 0) {
			return 'top:50%;left:50%;transform:translate(-50%,-50%);';
		}
		const targetCenterY = targetRect.top + targetRect.height / 2;
		const placeBottom = targetCenterY < viewportSize.h / 2;
		return placeBottom
			? 'bottom:1rem;left:50%;transform:translateX(-50%);'
			: 'top:1rem;left:50%;transform:translateX(-50%);';
	});

	$effect(() => {
		if (!open || !currentTarget) {
			targetRect = null;
			return;
		}

		const target = currentTarget;
		const update = () => {
			viewportSize = { w: window.innerWidth, h: window.innerHeight };
			const el = document.querySelector(`[data-tutorial-target="${target}"]`);
			targetRect = el ? el.getBoundingClientRect() : null;
		};

		update();
		// The graph handle is created after the SVG mounts; retry shortly in case
		// the tutorial opens before the d3 group has been appended.
		const retry = window.setTimeout(update, 120);

		const ro = new ResizeObserver(update);
		ro.observe(document.body);
		window.addEventListener('resize', update);
		window.addEventListener('scroll', update, true);

		return () => {
			window.clearTimeout(retry);
			ro.disconnect();
			window.removeEventListener('resize', update);
			window.removeEventListener('scroll', update, true);
		};
	});

	onMount(() => {
		if (localStorage.getItem(STORAGE_KEY)) return;
		const timer = setTimeout(() => {
			open = true;
		}, 800);
		return () => clearTimeout(timer);
	});

	function dismiss() {
		open = false;
		currentStep = 0;
		localStorage.setItem(STORAGE_KEY, 'true');
	}

	function next() {
		if (isLast) dismiss();
		else currentStep++;
	}

	function prev() {
		if (!isFirst) currentStep--;
	}
</script>

<Dialog.Root
	bind:open
	onOpenChange={(v) => {
		if (!v) dismiss();
	}}
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
		<Dialog.Content
			class="fixed z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl bg-base-200 shadow-2xl transition-[top,bottom,left,transform] duration-300 ease-out"
			style={dialogStyle}
		>
			<div class="px-6 pt-6 pb-4">
				<div
					class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-lg"
				>
					{#if typeof steps[currentStep].icon === 'string'}
						{steps[currentStep].icon}
					{:else}
						{@const IconComponent = steps[currentStep].icon as Component}
						<IconComponent size={20} />
					{/if}
				</div>

				{#if steps[currentStep].title}
					<Dialog.Title class="text-base font-semibold text-base-content">
						{steps[currentStep].title?.()}
					</Dialog.Title>
				{:else}
					<Dialog.Title class="sr-only">Tutorial step {currentStep + 1}</Dialog.Title>
				{/if}

				<Dialog.Description class="mt-1.5 text-sm leading-relaxed text-base-content/70">
					{steps[currentStep].content()}
				</Dialog.Description>

				{#if steps[currentStep].extra}
					<div class="mt-3 space-y-1.5 text-xs text-base-content/55">
						<p>{steps[currentStep].extra?.()}</p>
						{#if steps[currentStep].extra2}
							<p>{steps[currentStep].extra2?.()}</p>
						{/if}
					</div>
				{/if}

				{#if steps[currentStep].guideLinkLabel}
					<a
						href="https://potatosalad775.github.io/modernGraphTool/docs/category/guide-for-users"
						target="_blank"
						rel="noopener noreferrer"
						class="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-colors hover:underline"
					>
						{steps[currentStep].guideLinkLabel?.()}
						<ExternalLink size={14} aria-hidden="true" />
					</a>
				{/if}
			</div>

			<div class="flex items-center justify-between border-t border-base-content/10 px-6 py-3">
				<div class="flex gap-1.5">
					{#each steps as _, i (i)}
						<button
							type="button"
							class="h-1.5 rounded-full transition-all {i === currentStep
								? 'w-4 bg-accent'
								: 'w-1.5 bg-base-content/20 hover:bg-base-content/35'}"
							onclick={() => (currentStep = i)}
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
							onclick={dismiss}
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
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
