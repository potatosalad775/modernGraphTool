<script lang="ts">
	import type { BrandState, PhoneKind, PhoneState } from '../../../utils/phoneBookConverter';
	import { phoneBook, moveBy } from './phone-book-store.svelte';
	import SharedMetaFields from './shared/SharedMetaFields.svelte';
	import SimplePhoneFields from './types/SimplePhoneFields.svelte';
	import DetailedPhoneFields from './types/DetailedPhoneFields.svelte';
	import VariationsPhoneFields from './types/VariationsPhoneFields.svelte';
	import PrefixVariationsPhoneFields from './types/PrefixVariationsPhoneFields.svelte';
	import SampleSetPhoneFields from './types/SampleSetPhoneFields.svelte';

	interface Props {
		brand: BrandState;
		phone: PhoneState;
		index: number;
		count: number;
		isExpanded: boolean;
		onToggleExpand: () => void;
	}

	let { brand, phone = $bindable(), index, count, isExpanded, onToggleExpand }: Props = $props();

	const DOCS_BASE = './guide-for-admins/manage-data';
	const base = import.meta.env.BASE_URL.replace(/\/$/, '');

	interface KindOption {
		value: PhoneKind;
		label: string;
		description: string;
		docAnchor: string;
	}

	const KIND_OPTIONS: KindOption[] = [
		{
			value: 'simple',
			label: 'Simple',
			description:
				'Just the device name — the tool auto-loads "{name} L.txt" and "{name} R.txt". Easiest option when the filename matches the display name.',
			docAnchor: '#simple-string-definition'
		},
		{
			value: 'detailed',
			label: 'Detailed',
			description:
				'Separate display name, file base name, and optional suffix. Use this when the filename differs from the display name, or when you want to add review/shop links.',
			docAnchor: '#detailed-phone-object-definition'
		},
		{
			value: 'variations',
			label: 'Variations (file / suffix arrays)',
			description:
				'Group several measurements under one model — e.g. different eartips or pad swaps. Each variant has its own file and visible suffix.',
			docAnchor: '#variations-grouping-multiple-data-files-under-one-phone-name'
		},
		{
			value: 'prefix',
			label: 'Variations (common prefix)',
			description:
				'Like Variations, but the distinguishing part of the filename is also the UI suffix. Handy when all files share a long common prefix.',
			docAnchor: '#variations-grouping-multiple-data-files-under-one-phone-name'
		},
		{
			value: 'sampleSet',
			label: 'Sample Sets (variants)',
			description:
				'Declare each variant explicitly, and give any of them several measurement runs — repeat runs, seating positions, one measurement per ear pad. Each set can be drawn as an averaged curve, individual run curves, a shaded min/max band, or any combination.',
			docAnchor: '#sample-sets'
		}
	];

	let kindOption = $derived(KIND_OPTIONS.find((o) => o.value === phone.kind)!);
	let passthroughKeys = $derived(phone.passthrough ? Object.keys(phone.passthrough) : []);

	let summary = $derived.by(() => {
		switch (phone.kind) {
			case 'simple':
				return phone.simple?.value || '(unnamed)';
			case 'detailed':
				return phone.detailed?.name || '(unnamed)';
			case 'variations':
				return phone.variations?.name
					? `${phone.variations.name} — ${phone.variations.rows.length} variants`
					: '(unnamed)';
			case 'prefix':
				return phone.prefix?.name
					? `${phone.prefix.name} — ${phone.prefix.files.length} variants`
					: '(unnamed)';
			case 'sampleSet': {
				const set = phone.sampleSet;
				if (!set?.name) return '(unnamed)';
				const n = set.variants.length;
				return `${set.name} — ${n} variant${n === 1 ? '' : 's'}`;
			}
		}
	});
</script>

<div class="pbPhoneCard">
	<!--
		Stays a <div> with button semantics rather than a real <button>: the header
		holds the move/remove buttons, and nesting a button inside a button is
		invalid HTML.
	-->
	<div
		class="pbPhoneHeader pbPhoneHeaderClickable"
		role="button"
		tabindex="0"
		aria-expanded={isExpanded}
		onclick={onToggleExpand}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				onToggleExpand();
			}
		}}
	>
		<span class="pbBrandChevron" class:pbBrandChevronOpen={isExpanded}>&#9654;</span>
		<span class="pbPhoneKindBadge">{kindOption.label}</span>
		<span class="pbPhoneSummary">{summary}</span>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="pbBrandActions" onclick={(e) => e.stopPropagation()}>
			<button
				type="button"
				class="pbIconBtn"
				onclick={() => moveBy(brand.phones, phone, 'up')}
				disabled={index === 0}
				title="Move up"
			>
				↑
			</button>
			<button
				type="button"
				class="pbIconBtn"
				onclick={() => moveBy(brand.phones, phone, 'down')}
				disabled={index === count - 1}
				title="Move down"
			>
				↓
			</button>
			<button
				type="button"
				class="pbIconBtn pbIconBtnDanger"
				onclick={() => brand.phones.splice(index, 1)}
				title="Remove phone"
			>
				×
			</button>
		</div>
	</div>

	{#if isExpanded}
		<div class="pbPhoneBody">
			<div class="pbKindSelectRow">
				<div class="pbKindSelectLabelRow">
					<label for="{phone.id}-kind">Type</label>
					<select
						id="{phone.id}-kind"
						class="ceSelect"
						value={phone.kind}
						onchange={(e) => phoneBook.switchKind(brand, phone, e.currentTarget.value as PhoneKind)}
					>
						{#each KIND_OPTIONS as o (o.value)}
							<option value={o.value}>{o.label}</option>
						{/each}
					</select>
				</div>
				<div class="pbKindDescription">
					{kindOption.description}
					<a
						href="{base}/{DOCS_BASE.replace(/^\.?\//, '')}{kindOption.docAnchor}"
						target="_blank"
						rel="noopener noreferrer">Learn more</a
					>
				</div>
			</div>

			{#if phone.kind === 'simple'}
				<SimplePhoneFields bind:phone />
			{:else if phone.kind === 'detailed'}
				<DetailedPhoneFields bind:phone />
			{:else if phone.kind === 'variations'}
				<VariationsPhoneFields bind:phone />
			{:else if phone.kind === 'prefix'}
				<PrefixVariationsPhoneFields bind:phone />
			{:else if phone.kind === 'sampleSet'}
				<SampleSetPhoneFields bind:phone />
			{/if}

			{#if phone.kind !== 'simple'}
				<SharedMetaFields bind:phone />
			{/if}

			{#if passthroughKeys.length > 0}
				<div class="pbPassthroughWarning">
					Preserved unknown keys from import: {passthroughKeys.join(', ')}
				</div>
			{/if}
		</div>
	{/if}
</div>
