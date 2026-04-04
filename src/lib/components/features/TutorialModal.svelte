<script lang="ts">
	import { onMount } from 'svelte';
	import { Dialog } from 'bits-ui';
	import * as m from '$lib/paraglide/messages';
	import { appStore } from '$lib/stores/app-store.svelte';

	const STORAGE_KEY = 'gt-tutorial-dismissed';

	interface TutorialStep {
		title?: () => string;
		content: () => string;
		extra?: () => string;
		extra2?: () => string;
		icon: string;
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
				icon: '↔'
			}
		];

		if (appStore.isMobile) {
			base.push({
				content: m.tutorial_modal_graph_handle_content,
				icon: '↕'
			});
		} else {
			base.push({
				content: m.tutorial_modal_divider_content,
				icon: '⇔'
			});
		}

		base.push({
			title: m.tutorial_modal_pwa_title,
			content: m.tutorial_modal_pwa_content,
			extra: m.tutorial_modal_pwa_inst_ios,
			extra2: m.tutorial_modal_pwa_inst_android,
			icon: '📱'
		});

		return base;
	});

	let open = $state(false);
	let currentStep = $state(0);

	const isFirst = $derived(currentStep === 0);
	const isLast = $derived(currentStep === steps.length - 1);

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

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) dismiss(); }}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
		/>
		<Dialog.Content
			class="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2
				rounded-xl bg-base-200 shadow-2xl"
		>
			<div class="px-6 pt-6 pb-4">
				<div class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-lg">
					{steps[currentStep].icon}
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
			</div>

			<div class="flex items-center justify-between border-t border-base-content/10 px-6 py-3">
				<div class="flex gap-1.5">
					{#each steps as _, i}
						<button
							type="button"
							class="h-1.5 rounded-full transition-all {i === currentStep ? 'w-4 bg-accent' : 'w-1.5 bg-base-content/20 hover:bg-base-content/35'}"
							onclick={() => (currentStep = i)}
							aria-label="Go to step {i + 1}"
						></button>
					{/each}
				</div>

				<div class="flex items-center gap-2">
					{#if !isLast}
						<button
							type="button"
							class="px-3 py-1.5 text-xs text-base-content/50 hover:text-base-content/70"
							onclick={dismiss}
						>
							{m.tutorial_modal_btn_skip()}
						</button>
					{/if}

					{#if !isFirst}
						<button
							type="button"
							class="rounded-md px-3 py-1.5 text-xs font-medium text-base-content/70 hover:bg-base-300"
							onclick={prev}
						>
							{m.tutorial_modal_btn_prev()}
						</button>
					{/if}

					<button
						type="button"
						class="rounded-md bg-accent px-4 py-1.5 text-xs font-medium text-accent-content hover:bg-accent/80"
						onclick={next}
					>
						{isLast ? m.tutorial_modal_btn_done() : m.tutorial_modal_btn_next()}
					</button>
				</div>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
