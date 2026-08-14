import { createDefaultConfig, type ConfigFormState } from '../../../utils/configDefaults';

/**
 * Replaces the React original's `useReducer` + Context.
 *
 * `$state` is deeply reactive, so sections read and write `config.SECTION.FIELD`
 * directly and every dependent view updates. That removes the whole indirection
 * the React version needed to stay immutable — the action union, the reducer,
 * the `getNestedValue` / `setNestedValue` path walkers, and the stringly-typed
 * `path: string[]` those took. Field access is now type-checked by the compiler
 * rather than by hand at runtime.
 *
 * A module-level singleton rather than context: there is exactly one editor on
 * the page, and `ExportBar` and the sections all need the same instance.
 */
class ConfigEditorStore {
	config = $state<ConfigFormState>(createDefaultConfig());

	/** Replace the whole config — used by the three import paths. */
	load(next: ConfigFormState) {
		this.config = next;
	}

	reset() {
		this.config = createDefaultConfig();
	}
}

export const configEditor = new ConfigEditorStore();

/**
 * Array editors need add / remove / move. `$state` arrays are proxies that
 * support the normal mutating methods, so these are one-liners kept here only
 * to avoid repeating the splice bounds check in every section.
 */
export function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
	if (fromIndex < 0 || fromIndex >= items.length) return;
	if (toIndex < 0 || toIndex >= items.length) return;
	const [item] = items.splice(fromIndex, 1);
	items.splice(toIndex, 0, item);
}
