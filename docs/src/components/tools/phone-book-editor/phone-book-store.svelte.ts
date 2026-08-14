import {
	createDefaultPhoneBook,
	extractName,
	switchPhoneKind,
	type BrandState,
	type PhoneBookState,
	type PhoneKind,
	type PhoneState
} from '../../../utils/phoneBookConverter';

/**
 * Replaces the React original's `useReducer` + Context.
 *
 * The 14-case action union is gone: with deep `$state`, editing a field is
 * `phone.detailed.name = x` at the component that owns the field, so only the
 * operations that are genuinely structural — reordering, sorting, kind
 * switching — need to live here at all. Those took `brandId` / `phoneId` and
 * re-found the target on every dispatch; they now take the object.
 */
class PhoneBookStore {
	book = $state<PhoneBookState>(createDefaultPhoneBook());

	load(next: PhoneBookState) {
		this.book = next;
	}

	reset() {
		this.book = createDefaultPhoneBook();
	}

	sortBrandsAlpha() {
		this.book.sort((a, b) =>
			(a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
		);
	}

	sortPhonesAlpha(brand: BrandState) {
		brand.phones.sort((x, y) =>
			extractName(x).localeCompare(extractName(y), undefined, { sensitivity: 'base' })
		);
	}

	/**
	 * `switchPhoneKind` returns a fresh object rather than mutating, so the
	 * result has to be written back over the array slot. It preserves shared
	 * metadata and carries what it can across kinds.
	 */
	switchKind(brand: BrandState, phone: PhoneState, kind: PhoneKind) {
		const i = brand.phones.indexOf(phone);
		if (i !== -1) brand.phones[i] = switchPhoneKind(phone, kind);
	}
}

export const phoneBook = new PhoneBookStore();

/** Swaps an item with its neighbour. Returns false when already at the edge. */
export function moveBy<T>(items: T[], item: T, direction: 'up' | 'down'): boolean {
	const idx = items.indexOf(item);
	if (idx === -1) return false;
	const swap = direction === 'up' ? idx - 1 : idx + 1;
	if (swap < 0 || swap >= items.length) return false;
	[items[idx], items[swap]] = [items[swap], items[idx]];
	return true;
}
