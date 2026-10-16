<script lang="ts">
	import { formatRoomCode, intentLink, landingUrl, PROTO, webLink } from 'peq-link/client';
	import type { Ended } from 'peq-link/client';
	import { CircleAlert, Link2, TriangleAlert } from '@lucide/svelte';
	import * as m from '#lib/paraglide/messages.js';
	import { linkStore } from '#lib/stores/link-store.svelte.js';
	import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
	import { linkService } from '#lib/services/link-service.svelte.js';
	import { DEFAULT_LINK_SERVER } from '#lib/services/link-config.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import Button from '../atoms/Button.svelte';
	import InfoPopover from '../atoms/InfoPopover.svelte';

	/**
	 * "Link with uniPEQ": start a link, show the code and QR code until uniPEQ joins and approves,
	 * then the link's state. The session itself is `linkService`'s and outlives this panel.
	 */

	/**
	 * "Open uniPEQ": on Android an intent link that opens the app, which joins the room; elsewhere
	 * uniPEQ on the web in a new tab, with the room in its address.
	 */
	const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

	const phase = $derived(linkStore.phase);
	const room = $derived(linkStore.room);
	const server = $derived(linkStore.server);
	const waiting = $derived(phase === 'waiting' || phase === 'connecting');
	const openUrl = $derived(
		room && server ? (isAndroid ? intentLink(server, room) : webLink(server, room)) : null
	);
	/** The web app opens beside this page, which has to stay open to keep the link. */
	const openTarget = isAndroid ? undefined : '_blank';
	/** The QR code's target: an App Link that opens uniPEQ, or the landing page without it. */
	const landing = $derived(room && server ? landingUrl(server, room) : null);
	/** A typed code joins uniPEQ's default server only. */
	const otherServer = $derived(!!server && new URL(server).origin !== DEFAULT_LINK_SERVER);

	/** The docs site only carries a Korean translation besides English. */
	const docsUrl = $derived(
		`https://potatosalad775.github.io/modernGraphTool/docs/${getLocale() === 'ko' ? 'ko/' : ''}features/unipeq-link/`
	);

	let starting = $state(false);
	async function start() {
		starting = true;
		try {
			await linkService.start();
		} finally {
			starting = false;
		}
	}

	// ── QR code: rendered here from a module matrix, so no image or inline script is needed ──

	let qr = $state.raw<{ size: number; path: string } | null>(null);
	$effect(() => {
		const url = landing;
		qr = null;
		if (!url) return;
		let live = true;
		void import('uqr').then(({ encode }) => {
			if (!live) return;
			const { data, size } = encode(url, { ecc: 'M', border: 2 });
			let path = '';
			data.forEach((row, y) =>
				row.forEach((dark, x) => {
					if (dark) path += `M${x} ${y}h1v1h-1z`;
				})
			);
			qr = { size, path };
		});
		return () => {
			live = false;
		};
	});

	// ── Linked: one line saying where things stand ──

	const notice = $derived.by((): { tone: 'warning' | 'muted'; text: string } | null => {
		if (phase === 'stalled') return { tone: 'warning', text: m.link_stalled() };
		if (linkStore.readOnly) {
			// uniPEQ edits only with a device connected: without one, that's what's missing.
			const text = linkStore.device ? m.link_read_only() : m.link_read_only_no_device();
			return { tone: 'warning', text };
		}
		if (linkStore.deviceRejected) return { tone: 'warning', text: m.link_device_rejected() };
		if (linkStore.pausedMs !== null) {
			return {
				tone: 'muted',
				text: m.link_paused({ seconds: Math.round(linkStore.pausedMs / 1000) })
			};
		}
		return null;
	});

	function endedText(ended: Ended): string {
		switch (ended.reason) {
			case 'unlink':
				return ended.by === 'peer' ? m.link_ended_unlink_peer() : m.link_ended_unlink();
			case 'denied':
				return m.link_ended_denied();
			case 'version':
				// The side with the lower major is the one to update.
				return (ended.peerProto?.[0] ?? 0) < PROTO[0]
					? m.link_ended_version_unipeq()
					: m.link_ended_version_site();
			case 'timeout':
				return m.link_ended_timeout();
			case 'replaced':
				return m.link_ended_replaced();
			case 'room-full':
				return m.link_ended_room_full();
			case 'elsewhere':
				return m.link_ended_elsewhere();
			default:
				return m.link_ended_unlink();
		}
	}
</script>

<div class="flex flex-col gap-2">
	{#if waiting && room}
		<!-- Waiting: the code, the QR code and a button that opens uniPEQ -->
		<p class="text-xs text-base-content/70">
			{phase === 'connecting' ? m.link_connecting() : m.link_waiting()}
		</p>
		<div class="flex items-center gap-3">
			{#if qr}
				<svg
					viewBox="0 0 {qr.size} {qr.size}"
					class="size-32 shrink-0 rounded"
					role="img"
					aria-label={m.link_qr_label()}
				>
					<rect width={qr.size} height={qr.size} class="qr-light" />
					<path d={qr.path} class="qr-dark" shape-rendering="crispEdges" />
				</svg>
			{:else}
				<div class="size-32 shrink-0 rounded bg-base-300" aria-hidden="true"></div>
			{/if}
			<div class="flex min-w-0 flex-col gap-1">
				<span class="text-xs text-base-content/60">{m.link_code_label()}</span>
				<span class="font-mono text-lg font-semibold tracking-wider text-base-content select-all">
					{formatRoomCode(room)}
				</span>
			</div>
		</div>
		{#if otherServer}
			<p class="text-xs text-base-content/60">{m.link_other_server()}</p>
		{/if}
		<div class="flex justify-end gap-1">
			{#if openUrl}
				<Button
					title={m.link_open_unipeq()}
					variant="primary"
					size="sm"
					class="flex-1"
					href={openUrl}
					target={openTarget}
					rel={openTarget && 'noopener'}
				>
					{m.link_open_unipeq()}
				</Button>
			{/if}
			<Button
				title={m.link_cancel()}
				variant="destructive"
				size="sm"
				onclick={() => linkService.unlink()}
			>
				{m.link_cancel()}
			</Button>
		</div>
	{:else if phase === 'approval'}
		<!-- uniPEQ has the channel and is asking its user -->
		<p class="text-xs text-base-content/70" role="status">{m.link_approve()}</p>
		<div class="flex gap-1">
			{#if openUrl}
				<Button
					title={m.link_open_unipeq()}
					variant="primary"
					size="sm"
					class="flex-1"
					href={openUrl}
					target={openTarget}
					rel={openTarget && 'noopener'}
				>
					{m.link_open_unipeq()}
				</Button>
			{/if}
			<Button
				title={m.link_cancel()}
				variant="destructive"
				size="sm"
				onclick={() => linkService.unlink()}
			>
				{m.link_cancel()}
			</Button>
		</div>
	{:else if linkStore.linked}
		<!-- Linked, or stalled: uniPEQ hasn't answered for a while -->
		<div class="flex items-start justify-between gap-2">
			<div class="ml-px flex min-w-0 items-start gap-2">
				<Link2 class="mt-px size-3.5 shrink-0 text-success" aria-hidden="true" />
				<div class="flex min-w-0 flex-col gap-0.5">
					<p class="text-xs text-base-content">
						{linkStore.device ? m.link_linked_device() : m.link_no_device()}
					</p>
					<!-- Hardware EQ names a device it shows in its own row, below -->
					{#if linkStore.device?.name != undefined && !devicePeqStore.connection}
						<p class="text-[11px] text-base-content/70">{linkStore.device.name}</p>
					{/if}
				</div>
			</div>
			<Button
				title={m.link_unlink()}
				variant="destructive"
				size="sm"
				class="shrink-0"
				onclick={() => linkService.unlink()}
			>
				{m.link_unlink()}
			</Button>
		</div>
		<!-- Always rendered: a live region has to exist before its text changes -->
		{#if notice?.text != undefined}
			<p
				class="flex items-start gap-1 text-xs {notice?.tone === 'warning'
					? 'text-base-content'
					: 'text-base-content/60'}"
				role="status"
			>
				{#if notice?.tone === 'warning'}
					<TriangleAlert class="mt-px size-3.5 shrink-0 text-warning" aria-hidden="true" />
				{/if}
				<span>{notice.text}</span>
			</p>
		{/if}
	{:else}
		<!-- Start, or ended: the reason, and a way to link again -->
		{#if linkStore.ended}
			<p class="flex items-start gap-1 text-xs text-base-content" role="status">
				<CircleAlert class="mt-px size-3.5 shrink-0 text-base-content/60" aria-hidden="true" />
				<span>{endedText(linkStore.ended)}</span>
			</p>
		{:else}
			<p class="text-xs text-base-content/70">{m.link_start_hint()}</p>
		{/if}
		{#if linkStore.failed}
			<p class="text-xs text-base-content" role="status">{m.link_failed_start()}</p>
		{/if}
		<div class="flex items-center gap-1">
			<Button
				title={linkStore.ended ? m.link_again() : m.link_start()}
				variant="primary"
				size="sm"
				class="flex-1"
				disabled={starting}
				onclick={start}
			>
				{linkStore.ended ? m.link_again() : m.link_start()}
			</Button>
			<!-- uniPEQ is new: say what it is and why linking is worth it, before anyone links -->
			<InfoPopover label={m.info_popover_about({ topic: 'uniPEQ' })} size="sm" align="end">
				<p>{m.link_help_what()}</p>
				<p>{m.link_help_why()}</p>
				<p>{m.link_help_phone()}</p>
				<div class="flex gap-3">
					<a
						href="https://unipeq.com"
						target="_blank"
						rel="noopener noreferrer"
						class="text-accent underline underline-offset-2"
					>
						{m.link_help_get()}
					</a>
					<a
						href={docsUrl}
						target="_blank"
						rel="external noopener noreferrer"
						class="text-accent underline underline-offset-2"
					>
						{m.equalizer_autoeq_learn_more()}
					</a>
				</div>
			</InfoPopover>
		</div>
	{/if}
</div>

<style>
	/* Dark modules on a light ground in both themes: not every camera app reads an inverted code. */
	.qr-light {
		fill: var(--color-qr-light, oklch(100% 0 0));
	}
	.qr-dark {
		fill: var(--color-qr-dark, oklch(20% 0.042 265.755));
	}
</style>
