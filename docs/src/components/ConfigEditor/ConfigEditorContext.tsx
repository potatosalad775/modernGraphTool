import React, { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import { createDefaultConfig, type ConfigFormState } from '@site/src/utils/configDefaults';

// ── Actions ─────────────────────────────────────────────────────────────────

export type ConfigAction =
	| { type: 'SET_FIELD'; path: string[]; value: unknown }
	| { type: 'LOAD_CONFIG'; config: ConfigFormState }
	| { type: 'RESET_DEFAULTS' }
	| { type: 'ADD_ARRAY_ITEM'; path: string[]; item: unknown }
	| { type: 'REMOVE_ARRAY_ITEM'; path: string[]; index: number }
	| { type: 'MOVE_ARRAY_ITEM'; path: string[]; fromIndex: number; toIndex: number };

// ── Immutable path helpers ──────────────────────────────────────────────────

function getNestedValue(obj: any, path: string[]): any {
	return path.reduce((cur, key) => (cur != null ? cur[key] : undefined), obj);
}

function setNestedValue(obj: any, path: string[], value: unknown): any {
	if (path.length === 0) return value;
	const [head, ...rest] = path;
	const current = obj ?? (typeof head === 'string' && /^\d+$/.test(head) ? [] : {});
	if (Array.isArray(current)) {
		const idx = Number(head);
		const copy = [...current];
		copy[idx] = setNestedValue(copy[idx], rest, value);
		return copy;
	}
	return { ...current, [head]: setNestedValue(current[head], rest, value) };
}

// ── Reducer ─────────────────────────────────────────────────────────────────

function configReducer(state: ConfigFormState, action: ConfigAction): ConfigFormState {
	switch (action.type) {
		case 'SET_FIELD':
			return setNestedValue(state, action.path, action.value) as ConfigFormState;

		case 'LOAD_CONFIG':
			return action.config;

		case 'RESET_DEFAULTS':
			return createDefaultConfig();

		case 'ADD_ARRAY_ITEM': {
			const arr = getNestedValue(state, action.path);
			if (!Array.isArray(arr)) return state;
			return setNestedValue(state, action.path, [...arr, action.item]) as ConfigFormState;
		}

		case 'REMOVE_ARRAY_ITEM': {
			const arr = getNestedValue(state, action.path);
			if (!Array.isArray(arr)) return state;
			return setNestedValue(
				state,
				action.path,
				arr.filter((_, i) => i !== action.index)
			) as ConfigFormState;
		}

		case 'MOVE_ARRAY_ITEM': {
			const arr = getNestedValue(state, action.path);
			if (!Array.isArray(arr)) return state;
			const { fromIndex, toIndex } = action;
			if (fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length)
				return state;
			const copy = [...arr];
			const [item] = copy.splice(fromIndex, 1);
			copy.splice(toIndex, 0, item);
			return setNestedValue(state, action.path, copy) as ConfigFormState;
		}

		default:
			return state;
	}
}

// ── Context ─────────────────────────────────────────────────────────────────

interface ConfigEditorContextValue {
	state: ConfigFormState;
	dispatch: Dispatch<ConfigAction>;
}

const ConfigEditorContext = createContext<ConfigEditorContextValue | null>(null);

export function ConfigEditorProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(configReducer, undefined, createDefaultConfig);

	return (
		<ConfigEditorContext.Provider value={{ state, dispatch }}>
			{children}
		</ConfigEditorContext.Provider>
	);
}

export function useConfigEditor(): ConfigEditorContextValue {
	const ctx = useContext(ConfigEditorContext);
	if (!ctx) throw new Error('useConfigEditor must be used within ConfigEditorProvider');
	return ctx;
}

// ── Convenience helpers for sections ────────────────────────────────────────

/** Create a scoped setter for a given path prefix */
export function useFieldSetter(basePath: string[]) {
	const { dispatch } = useConfigEditor();
	return {
		set(subPath: string | string[], value: unknown) {
			const path = Array.isArray(subPath) ? [...basePath, ...subPath] : [...basePath, subPath];
			dispatch({ type: 'SET_FIELD', path, value });
		},
		addItem(subPath: string | string[], item: unknown) {
			const path = Array.isArray(subPath) ? [...basePath, ...subPath] : [...basePath, subPath];
			dispatch({ type: 'ADD_ARRAY_ITEM', path, item });
		},
		removeItem(subPath: string | string[], index: number) {
			const path = Array.isArray(subPath) ? [...basePath, ...subPath] : [...basePath, subPath];
			dispatch({ type: 'REMOVE_ARRAY_ITEM', path, index });
		},
		moveItem(subPath: string | string[], fromIndex: number, toIndex: number) {
			const path = Array.isArray(subPath) ? [...basePath, ...subPath] : [...basePath, subPath];
			dispatch({ type: 'MOVE_ARRAY_ITEM', path, fromIndex, toIndex });
		}
	};
}
