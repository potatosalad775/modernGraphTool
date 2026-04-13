import React, {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import {
  createDefaultPhoneBook,
  createEmptyBrand,
  createEmptyPhone,
  extractName,
  switchPhoneKind,
  type BrandState,
  type PhoneBookState,
  type PhoneKind,
  type PhoneState,
} from '@site/src/utils/phoneBookConverter';

// ── Actions ─────────────────────────────────────────────────────────────────

export type PhoneBookAction =
  | { type: 'LOAD'; state: PhoneBookState }
  | { type: 'RESET' }
  // Brand-level
  | { type: 'ADD_BRAND'; brand?: BrandState }
  | { type: 'REMOVE_BRAND'; brandId: string }
  | { type: 'MOVE_BRAND'; brandId: string; direction: 'up' | 'down' }
  | { type: 'SET_BRAND_FIELD'; brandId: string; field: 'name' | 'suffix'; value: string }
  | { type: 'SORT_BRANDS_ALPHA' }
  // Phone-level
  | { type: 'ADD_PHONE'; brandId: string; phone?: PhoneState }
  | { type: 'REMOVE_PHONE'; brandId: string; phoneId: string }
  | { type: 'MOVE_PHONE'; brandId: string; phoneId: string; direction: 'up' | 'down' }
  | { type: 'SORT_PHONES_ALPHA'; brandId: string }
  | { type: 'SWITCH_PHONE_KIND'; brandId: string; phoneId: string; kind: PhoneKind }
  | { type: 'UPDATE_PHONE'; brandId: string; phoneId: string; patch: Partial<PhoneState> };

// ── Reducer ─────────────────────────────────────────────────────────────────

function updateBrand(
  state: PhoneBookState,
  brandId: string,
  updater: (brand: BrandState) => BrandState,
): PhoneBookState {
  return state.map((b) => (b.id === brandId ? updater(b) : b));
}

function updatePhone(
  state: PhoneBookState,
  brandId: string,
  phoneId: string,
  updater: (phone: PhoneState) => PhoneState,
): PhoneBookState {
  return updateBrand(state, brandId, (brand) => ({
    ...brand,
    phones: brand.phones.map((p) => (p.id === phoneId ? updater(p) : p)),
  }));
}

function moveInArray<T extends { id: string }>(
  arr: T[],
  id: string,
  direction: 'up' | 'down',
): T[] {
  const idx = arr.findIndex((x) => x.id === id);
  if (idx === -1) return arr;
  const swap = direction === 'up' ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= arr.length) return arr;
  const copy = [...arr];
  [copy[idx], copy[swap]] = [copy[swap], copy[idx]];
  return copy;
}

function phoneBookReducer(state: PhoneBookState, action: PhoneBookAction): PhoneBookState {
  switch (action.type) {
    case 'LOAD':
      return action.state;
    case 'RESET':
      return createDefaultPhoneBook();

    case 'ADD_BRAND':
      return [...state, action.brand ?? createEmptyBrand()];
    case 'REMOVE_BRAND':
      return state.filter((b) => b.id !== action.brandId);
    case 'MOVE_BRAND':
      return moveInArray(state, action.brandId, action.direction);
    case 'SET_BRAND_FIELD':
      return updateBrand(state, action.brandId, (b) => ({
        ...b,
        [action.field]: action.value,
      }));
    case 'SORT_BRANDS_ALPHA':
      return [...state].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }),
      );

    case 'ADD_PHONE':
      return updateBrand(state, action.brandId, (b) => ({
        ...b,
        phones: [...b.phones, action.phone ?? createEmptyPhone('detailed')],
      }));
    case 'REMOVE_PHONE':
      return updateBrand(state, action.brandId, (b) => ({
        ...b,
        phones: b.phones.filter((p) => p.id !== action.phoneId),
      }));
    case 'MOVE_PHONE':
      return updateBrand(state, action.brandId, (b) => ({
        ...b,
        phones: moveInArray(b.phones, action.phoneId, action.direction),
      }));
    case 'SORT_PHONES_ALPHA':
      return updateBrand(state, action.brandId, (b) => ({
        ...b,
        phones: [...b.phones].sort((x, y) =>
          extractName(x).localeCompare(extractName(y), undefined, { sensitivity: 'base' }),
        ),
      }));
    case 'SWITCH_PHONE_KIND':
      return updatePhone(state, action.brandId, action.phoneId, (p) =>
        switchPhoneKind(p, action.kind),
      );
    case 'UPDATE_PHONE':
      return updatePhone(state, action.brandId, action.phoneId, (p) => ({
        ...p,
        ...action.patch,
      }));

    default:
      return state;
  }
}

// ── Context ─────────────────────────────────────────────────────────────────

interface PhoneBookEditorContextValue {
  state: PhoneBookState;
  dispatch: Dispatch<PhoneBookAction>;
}

const PhoneBookEditorContext = createContext<PhoneBookEditorContextValue | null>(null);

export function PhoneBookEditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(phoneBookReducer, undefined, createDefaultPhoneBook);
  return (
    <PhoneBookEditorContext.Provider value={{ state, dispatch }}>
      {children}
    </PhoneBookEditorContext.Provider>
  );
}

export function usePhoneBookEditor(): PhoneBookEditorContextValue {
  const ctx = useContext(PhoneBookEditorContext);
  if (!ctx) throw new Error('usePhoneBookEditor must be used within PhoneBookEditorProvider');
  return ctx;
}
