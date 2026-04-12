<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { SvelteMap } from 'svelte/reactivity';
	import { squiglinkStore } from '$lib/stores/squiglink-store.svelte';
	import { Select } from 'bits-ui';
	import { ChevronDown } from '@lucide/svelte';

	interface SiteSelectorItem {
		type: string;
		value: string;
		label: string;
		href: string;
		username: string;
		dbIndex: number;
	}

	interface SiteSelectorGroup {
		type: string;
		items: SiteSelectorItem[];
	}

	const DB_TYPE_ORDER = ['5128', 'IEMs', 'Headphones', 'Earbuds'];

	onMount(() => {
		squiglinkStore.fetchSiteRegistry();
	});

	const groupedSites: SiteSelectorGroup[] = $derived.by(() => {
		const typeMap = new SvelteMap<string, SiteSelectorItem[]>();

		for (const site of squiglinkStore.sites) {
			for (let i = 0; i < site.dbs.length; i++) {
				const db = site.dbs[i];
				const items = typeMap.get(db.type) ?? [];
				const href = squiglinkStore.buildSiteUrl(site) + (db.folder || '/');
				items.push({
					type: db.type,
					value: site.name,
					label: site.name,
					href,
					username: site.username,
					dbIndex: i
				});
				typeMap.set(db.type, items);
			}
		}

		for (const items of typeMap.values()) {
			items.sort((a, b) => a.label.localeCompare(b.label));
		}

		const sortedTypes = [...typeMap.keys()].sort((a, b) => {
			const aIdx = DB_TYPE_ORDER.indexOf(a);
			const bIdx = DB_TYPE_ORDER.indexOf(b);
			if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
			if (aIdx !== -1) return -1;
			if (bIdx !== -1) return 1;
			return a.localeCompare(b);
		});

		return sortedTypes.map((type) => ({
			type,
			items: typeMap.get(type)!
		}));
	});

	const flatItems = $derived(
		groupedSites.flatMap((g) => g.items.map((i) => ({ value: i.value, label: i.label })))
	);

	const currentValue = $derived.by(() => {
		if (!browser) return '';
		const username = squiglinkStore.currentSiteUsername;
		if (!username) return '';

		const site = squiglinkStore.sites.find((s) => s.username === username);
		if (!site || site.dbs.length === 0) return '';

		// Match current pathname against DB folders (longest match wins)
		const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
		let bestIdx = 0;
		let bestMatchLen = 0;

		for (let i = 0; i < site.dbs.length; i++) {
			const folder = (site.dbs[i].folder || '/').replace(/\/+$/, '') || '/';

			if (folder === '/') {
				if (bestMatchLen === 0) bestIdx = i;
			} else if (pathname === folder || pathname.startsWith(folder + '/')) {
				if (folder.length > bestMatchLen) {
					bestMatchLen = folder.length;
					bestIdx = i;
				}
			}
		}

		return `${username}::${bestIdx}`;
	});

	const triggerLabel = $derived.by(() => {
		const username = squiglinkStore.currentSiteUsername;
		if (!username) return 'Select a site';
		return squiglinkStore.sites.find((s) => s.username === username)?.name ?? 'Select a site';
	});

</script>

{#if squiglinkStore.isEnabled && squiglinkStore.sites.length > 0}
	<Select.Root
		type="single"
		value={currentValue}
		items={flatItems}
	>
		<Select.Trigger
			class="inline-flex items-center justify-between gap-1 rounded border border-base-content/20
				min-w-36 bg-base-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
		>
			{triggerLabel}
			<ChevronDown class="h-3 w-3 shrink-0 text-base-content/60" />
		</Select.Trigger>

		<Select.Content
			side="bottom"
			sideOffset={4}
			class="z-50 max-h-80 overflow-y-auto rounded-lg border border-base-content/15
				bg-base-200 p-1 shadow-xl"
			style="min-width: 12rem;"
		>
			{#each groupedSites as group (group.type)}
				<Select.Group>
					<Select.GroupHeading
						class="px-2 py-1 text-[12px] font-semibold uppercase tracking-wider
							text-base-content/50"
					>
						{group.type}
					</Select.GroupHeading>

					{#each group.items as item (item.label + item.type)}
						<Select.Item
							value={item.value}
							label={item.label}
						>
							{#snippet child({ props, selected })}
								<a
									{...props}
									href={item.href}
									target="_blank"
									rel="external noopener noreferrer"
									class="block cursor-pointer rounded px-2 py-1 text-sm text-base-content
										no-underline outline-none data-highlighted:bg-base-300
										{selected ? 'font-medium text-accent' : ''}"
								>
									{item.label}
								</a>
							{/snippet}
						</Select.Item>
					{/each}
				</Select.Group>
			{/each}
		</Select.Content>
	</Select.Root>
{/if}
