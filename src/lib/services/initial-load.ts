import { graphStore } from '$lib/stores/graph-store.svelte.js';
import { menuStore, MENU_PANELS, type MenuPanel } from '$lib/stores/menu-store.svelte.js';
import { getConfigValue } from '$lib/utils/config.js';
import MetadataParser from '$lib/utils/metadata-parser.js';
import { urlProvider } from '$lib/utils/url-provider.js';
import { analyticsService } from './analytics-service.svelte.js';
import { dataProvider } from './data-provider.svelte.js';

/**
 * The boot sequence that puts the first curves into `frStore`: config defaults,
 * the phone book, then the `?share=` devices or `INITIAL_PHONES` / `INITIAL_TARGETS`.
 *
 * `hooks.client.ts` starts it before any component code has been evaluated, so
 * the phone book and FR files download while the app is still loading and
 * mounting. Waiting for `AppShell.onMount` put roughly 300 ms between the app
 * code arriving and the phone book request on a throttled connection. Nothing
 * here needs a mounted component — `GraphContainer` draws whatever `frStore`
 * already holds when it initializes.
 */

let early: Promise<void> | null = null;

/** Start the load ahead of mounting. Idempotent until claimed. */
export function startInitialLoad(): void {
	early ??= run();
}

/**
 * Take over the run `startInitialLoad` began, or start one when nothing did —
 * the boot tests mount `AppShell` without the client hook. Claiming clears it,
 * so each mount gets its own run rather than a previous boot's settled promise.
 */
export function claimInitialLoad(): Promise<void> {
	const pending = early ?? run();
	early = null;
	return pending;
}

async function run(): Promise<void> {
	// Before the first addFRData, which reports `phone_added`.
	analyticsService.init();
	// Synchronous — reads ?share= and ?state=.
	urlProvider.init();
	applyConfigDefaults();

	await MetadataParser.init();
	await loadInitialData();
}

/** Apply config defaults to stores before data loads */
function applyConfigDefaults(): void {
	// INITIAL_PANEL: config uses "phone" but menuStore uses "device"
	const cfgPanel = getConfigValue('INITIAL_PANEL') as string | undefined;
	if (cfgPanel) {
		const mapped = cfgPanel === 'phone' ? 'device' : cfgPanel;
		if ((MENU_PANELS as readonly string[]).includes(mapped)) {
			menuStore.currentPanel = mapped as MenuPanel;
		}
	}

	// Normalization defaults
	const normType = getConfigValue('NORMALIZATION.TYPE') as 'Hz' | 'Avg' | undefined;
	if (normType === 'Hz' || normType === 'Avg') graphStore.normType = normType;
	const normHz = getConfigValue('NORMALIZATION.HZ_VALUE') as number | undefined;
	if (normHz != null) graphStore.normHzValue = normHz;

	// Default Y scale
	const yScale = getConfigValue('VISUALIZATION.DEFAULT_Y_SCALE') as number | undefined;
	if (yScale != null) graphStore.yScale = yScale;
}

/** Load initial phones/targets from URL params or config defaults */
async function loadInitialData(): Promise<void> {
	const urlPhones = urlProvider.phoneDataFromURL;

	if (urlPhones.length > 0) {
		// URL share param takes priority — load phones/targets from URL
		await Promise.all(
			urlPhones.map(async (name) => {
				const identifier = name.trim();
				try {
					const matchPhone = MetadataParser.searchFRInfoWithFullName(identifier);
					await dataProvider.addFRData('phone', matchPhone.identifier, {
						dispSuffix: matchPhone.dispSuffix
					});
				} catch {
					// Not a phone — try as target
					try {
						const matchTarget = MetadataParser.searchTargetInfoWithFullName(identifier);
						await dataProvider.addFRData('target', matchTarget.identifier);
					} catch {
						// Not found — skip silently
					}
				}
			})
		);
		// Apply URL state (yScale, baseline, yOffsets, EQ) after data is loaded
		urlProvider.applyStateFromURL();
	} else {
		// Fall back to config defaults
		const initialPhones = (getConfigValue('INITIAL_PHONES') || []) as string[];
		const initialTargets = (getConfigValue('INITIAL_TARGETS') || []) as string[];

		await Promise.all([
			...initialPhones.map(async (phone) => {
				try {
					const match = MetadataParser.searchFRInfoWithFullName(phone);
					await dataProvider.addFRData('phone', match.identifier, {
						dispSuffix: match.dispSuffix
					});
				} catch {
					// Phone not found in metadata — skip silently
				}
			}),
			...initialTargets.map(async (target) => {
				try {
					const targetName = target.includes(' Target') ? target : target + ' Target';
					const match = MetadataParser.searchTargetInfoWithFullName(targetName);
					await dataProvider.addFRData('target', match.identifier);
				} catch {
					// Target not found — skip silently
				}
			})
		]);
	}
}
