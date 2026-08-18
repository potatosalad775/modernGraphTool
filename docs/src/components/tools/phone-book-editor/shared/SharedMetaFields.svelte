<script lang="ts">
	import type { PhoneLinkEntry, PhoneState } from '../../../../utils/phoneBookConverter';
	import RowsEditor from './RowsEditor.svelte';

	interface Props {
		phone: PhoneState;
	}

	let { phone = $bindable() }: Props = $props();

	const id = $props.id();

	/*
	 * The React version wrote `value || undefined` so a blanked field dropped its
	 * key. That is unnecessary here: `serializePhone` guards every one of these
	 * with a truthiness check, so `''` and `undefined` emit the same JSON, and
	 * binding straight to the field keeps the caret behaviour simple.
	 */
	const TEXT_FIELDS = [
		{ key: 'reviewScore', label: 'Review Score', type: 'text', placeholder: 'e.g. "A+" or "4.5"' },
		{ key: 'price', label: 'Price', type: 'text', placeholder: 'e.g. "$299"' },
		{ key: 'reviewLink', label: 'Review Link', type: 'url', placeholder: 'https://...' },
		{ key: 'shopLink', label: 'Shop Link', type: 'url', placeholder: 'https://...' }
	] as const;

	/** `links` is optional on import; RowsEditor needs a real array to bind to. */
	$effect(() => {
		phone.links ??= [];
	});
</script>

<div class="pbMetaGrid">
	{#each TEXT_FIELDS as f (f.key)}
		<div class="pbMetaField">
			<label for="{id}-{f.key}">{f.label}</label>
			<input
				id="{id}-{f.key}"
				type={f.type}
				class="ceInput"
				bind:value={phone[f.key]}
				placeholder={f.placeholder}
			/>
		</div>
	{/each}

	<div class="pbMetaField" style="grid-column: 1 / -1;">
		<label for="{id}-description">Description</label>
		<textarea
			id="{id}-description"
			class="ceTextarea"
			bind:value={phone.description}
			placeholder="Optional notes shown with the phone"
			style="min-height: 60px;"></textarea>
		<p class="pbKindDescription">
			Inline HTML is allowed — <code>&lt;a&gt;</code>, <code>&lt;b&gt;</code>,
			<code>&lt;em&gt;</code>, <code>&lt;br&gt;</code> and a few more. Everything else is stripped when
			the page renders it.
		</p>
	</div>

	<div class="pbMetaField" style="grid-column: 1 / -1;">
		<span class="pbMetaFieldLabel">Custom Links</span>
		<p class="pbKindDescription">
			Extra labelled links shown next to Review / Shop once the device is loaded. Use this when one
			<code>shopLink</code> isn't enough.
		</p>
		{#if phone.links}
			<RowsEditor
				bind:rows={phone.links}
				columns={[
					{ key: 'label', label: 'Label', placeholder: 'e.g. Amazon' },
					{ key: 'url', label: 'URL', placeholder: 'https://...' }
				]}
				createEmpty={(): PhoneLinkEntry => ({ label: '', url: '' })}
				minRows={0}
				addLabel="Add link"
			/>
		{/if}
	</div>
</div>
