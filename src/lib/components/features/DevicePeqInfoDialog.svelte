<script lang="ts">
	import { Dialog } from 'bits-ui';
	import * as m from '$lib/paraglide/messages.js';

	type Category = 'hid' | 'serial' | 'ble' | 'network';
	type VendorGroup = { category: Category; vendor: string; models: string[] };
	type Tab = 'overview' | 'devices' | 'howto';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let activeTab = $state<Tab>('overview');
	let deviceGroups = $state<VendorGroup[] | null>(null);
	let loading = $state(false);

	async function loadDevices() {
		if (deviceGroups || loading) return;
		loading = true;
		try {
			const { getHidConfig, getSerialConfig, getBleConfig, getNetworkHandlers } =
				await import('$lib/device-peq/registry.js');
			const [hid, serial, ble, network] = await Promise.all([
				getHidConfig(),
				getSerialConfig(),
				getBleConfig(),
				getNetworkHandlers()
			]);
			// Throwaway accumulator — the grouped result is copied into the `deviceGroups`
			// $state below, so this Map is never read reactively. SvelteMap would only add
			// proxy overhead here.
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const byKey = new Map<string, VendorGroup>();
			const add = (category: Category, vendor: string, models: string[]) => {
				const key = `${category}:${vendor}`;
				const existing = byKey.get(key);
				if (existing) {
					for (const model of models) {
						if (!existing.models.includes(model)) existing.models.push(model);
					}
				} else {
					byKey.set(key, { category, vendor, models: [...models] });
				}
			};
			for (const cfg of hid) add('hid', cfg.manufacturer, Object.keys(cfg.devices));
			for (const cfg of serial) add('serial', cfg.manufacturer, Object.keys(cfg.devices));
			for (const cfg of ble) add('ble', cfg.manufacturer, Object.keys(cfg.devices));
			for (const deviceType of Object.keys(network)) add('network', deviceType, []);
			deviceGroups = Array.from(byKey.values());
		} catch (e) {
			console.error('Failed to load device registry for info dialog:', e);
			deviceGroups = [];
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (open && activeTab === 'devices') {
			loadDevices();
		}
	});

	const CATEGORIES: { key: Category; label: () => string }[] = [
		{ key: 'hid', label: () => m.equalizer_device_peq_info_devices_category_hid() },
		{ key: 'serial', label: () => m.equalizer_device_peq_info_devices_category_serial() },
		{ key: 'ble', label: () => m.equalizer_device_peq_info_devices_category_ble() },
		{ key: 'network', label: () => m.equalizer_device_peq_info_devices_category_network() }
	];
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/40" />
		<Dialog.Content
			class="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-11/12 max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-base-200 p-6 shadow-2xl"
		>
			<Dialog.Title class="text-lg font-semibold text-base-content">
				{m.equalizer_device_peq_info_title()}
			</Dialog.Title>

			<div role="tablist" class="mt-4 flex gap-4 border-b border-base-content/10">
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === 'overview'}
					onclick={() => (activeTab = 'overview')}
					class="-mb-px border-b-2 px-1 pb-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none {activeTab ===
					'overview'
						? 'border-accent text-base-content'
						: 'border-transparent text-base-content/60 hover:text-base-content'}"
				>
					{m.equalizer_device_peq_info_tab_overview()}
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === 'devices'}
					onclick={() => (activeTab = 'devices')}
					class="-mb-px border-b-2 px-1 pb-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none {activeTab ===
					'devices'
						? 'border-accent text-base-content'
						: 'border-transparent text-base-content/60 hover:text-base-content'}"
				>
					{m.equalizer_device_peq_info_tab_devices()}
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === 'howto'}
					onclick={() => (activeTab = 'howto')}
					class="-mb-px border-b-2 px-1 pb-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none {activeTab ===
					'howto'
						? 'border-accent text-base-content'
						: 'border-transparent text-base-content/60 hover:text-base-content'}"
				>
					{m.equalizer_device_peq_info_tab_howto()}
				</button>
			</div>

			<div class="mt-4 flex-1 overflow-y-auto pr-1 text-sm text-base-content/80">
				{#if activeTab === 'overview'}
					<p class="mb-4">{m.equalizer_device_peq_info_overview_intro()}</p>
					<ul class="list-disc space-y-2 pl-5">
						<li>{m.equalizer_device_peq_info_overview_hid()}</li>
						<li>{m.equalizer_device_peq_info_overview_serial()}</li>
						<li>{m.equalizer_device_peq_info_overview_ble()}</li>
						<li>{m.equalizer_device_peq_info_overview_network()}</li>
					</ul>
				{:else if activeTab === 'devices'}
					{#if !deviceGroups}
						<p class="text-base-content/60">{m.equalizer_device_peq_info_devices_loading()}</p>
					{:else}
						<div class="space-y-5">
							{#each CATEGORIES as cat (cat.key)}
								{@const groups = deviceGroups.filter((g) => g.category === cat.key)}
								{#if groups.length > 0}
									<section>
										<h3
											class="mb-2 text-xs font-semibold tracking-wide text-base-content/60 uppercase"
										>
											{cat.label()}
										</h3>
										<ul class="space-y-1.5">
											{#each groups as group (group.vendor)}
												<li class="leading-relaxed">
													<strong class="text-base-content">{group.vendor}</strong
													>{#if group.models.length > 0}: {group.models.join(', ')}{/if}
												</li>
											{/each}
										</ul>
									</section>
								{/if}
							{/each}
						</div>
					{/if}
				{:else}
					<ol class="list-decimal space-y-2 pl-5">
						<li>{m.equalizer_device_peq_info_howto_step_1()}</li>
						<li>{m.equalizer_device_peq_info_howto_step_2()}</li>
						<li>{m.equalizer_device_peq_info_howto_step_3()}</li>
						<li>{m.equalizer_device_peq_info_howto_step_4()}</li>
						<li>{m.equalizer_device_peq_info_howto_step_5()}</li>
					</ol>
					<p class="mt-4 text-xs text-base-content/60">
						{m.equalizer_device_peq_info_howto_note()}
					</p>
				{/if}
			</div>

			<Dialog.Close
				class="mt-4 -mb-2 h-12 w-full rounded-lg text-center text-sm text-base-content/60 transition-colors hover:bg-base-300 focus-visible:ring-2 focus-visible:ring-base-content/80 focus-visible:outline-none"
			>
				{m.equalizer_device_peq_info_close()}
			</Dialog.Close>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
