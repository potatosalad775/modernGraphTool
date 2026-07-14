import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import type { BrandState } from '@site/src/utils/phoneBookConverter';
import { createEmptyPhone } from '@site/src/utils/phoneBookConverter';
import { usePhoneBookEditor } from './PhoneBookEditorContext';
import PhoneEditor from './PhoneEditor';
import ceStyles from '../ConfigEditor/ConfigEditor.module.css';
import styles from './PhoneBookEditor.module.css';

interface BrandEditorProps {
	brand: BrandState | null;
	/** Called after the selected brand is deleted so the parent can reselect. */
	onBrandDeleted: () => void;
}

/**
 * Right-column workspace for the currently selected brand. Shows brand fields
 * at the top and a list of collapsible phone accordions below.
 */
export default function BrandEditor({ brand, onBrandDeleted }: BrandEditorProps): ReactNode {
	const { dispatch } = usePhoneBookEditor();
	const [expandedPhoneIds, setExpandedPhoneIds] = useState<Set<string>>(new Set());
	const knownPhoneIds = useRef<Set<string>>(new Set());
	const prevBrandId = useRef<string | null>(null);

	// When brand changes, reset collapsed state and seed known ids.
	// When phones are added later, auto-expand the new ones.
	useEffect(() => {
		if (!brand) {
			knownPhoneIds.current = new Set();
			prevBrandId.current = null;
			setExpandedPhoneIds(new Set());
			return;
		}
		const currentIds = brand.phones.map((p) => p.id);

		if (prevBrandId.current !== brand.id) {
			prevBrandId.current = brand.id;
			knownPhoneIds.current = new Set(currentIds);
			setExpandedPhoneIds(new Set());
			return;
		}

		const added = currentIds.filter((id) => !knownPhoneIds.current.has(id));
		if (added.length > 0) {
			setExpandedPhoneIds((prev) => {
				const next = new Set(prev);
				added.forEach((id) => next.add(id));
				return next;
			});
		}
		knownPhoneIds.current = new Set(currentIds);
	}, [brand]);

	if (!brand) {
		return (
			<section className={styles.pbWorkspace}>
				<div className={styles.pbWorkspaceEmpty}>
					Select a brand from the list to edit its phones, or add a new brand.
				</div>
			</section>
		);
	}

	const togglePhone = (phoneId: string) => {
		setExpandedPhoneIds((prev) => {
			const next = new Set(prev);
			if (next.has(phoneId)) next.delete(phoneId);
			else next.add(phoneId);
			return next;
		});
	};

	const expandAll = () => setExpandedPhoneIds(new Set(brand.phones.map((p) => p.id)));
	const collapseAll = () => setExpandedPhoneIds(new Set());

	const handleAddPhone = () => {
		const phone = createEmptyPhone('detailed');
		dispatch({ type: 'ADD_PHONE', brandId: brand.id, phone });
		// The effect above also expands it, but set it here too for immediate UI response.
		setExpandedPhoneIds((prev) => new Set(prev).add(phone.id));
	};

	const handleDeleteBrand = () => {
		const label = [brand.name || '(unnamed brand)', brand.suffix].filter(Boolean).join(' ');
		if (confirm(`Remove brand "${label}" and all its phones?`)) {
			dispatch({ type: 'REMOVE_BRAND', brandId: brand.id });
			onBrandDeleted();
		}
	};

	const setField = (field: 'name' | 'suffix', value: string) =>
		dispatch({ type: 'SET_BRAND_FIELD', brandId: brand.id, field, value });

	const handleSortPhones = () => dispatch({ type: 'SORT_PHONES_ALPHA', brandId: brand.id });

	return (
		<section className={styles.pbWorkspace}>
			<div className={styles.pbWorkspaceHeader}>
				<div className={styles.pbBrandFields}>
					<div>
						<label className={ceStyles.ceLabel}>
							Brand Name
							<span className={ceStyles.ceLabelHint}>(required)</span>
						</label>
						<input
							type="text"
							className={ceStyles.ceInput}
							value={brand.name}
							placeholder="e.g. Sennheiser"
							onChange={(e) => setField('name', e.target.value)}
						/>
					</div>
					<div>
						<label className={ceStyles.ceLabel}>
							Suffix
							<span className={ceStyles.ceLabelHint}>(optional)</span>
						</label>
						<input
							type="text"
							className={ceStyles.ceInput}
							value={brand.suffix ?? ''}
							placeholder='e.g. "Audio"'
							onChange={(e) => setField('suffix', e.target.value)}
						/>
					</div>
					<div className={styles.pbBrandHeaderActions}>
						<button
							type="button"
							className={`${ceStyles.ceBtn} ${ceStyles.ceBtnDanger}`}
							onClick={handleDeleteBrand}
							title="Delete this brand"
						>
							Delete brand
						</button>
					</div>
				</div>
			</div>

			<div className={styles.pbWorkspaceToolbar}>
				<span className={styles.pbWorkspaceToolbarLabel}>
					Phones <span className={styles.pbPickerCount}>({brand.phones.length})</span>
				</span>
				<div className={styles.pbWorkspaceToolbarActions}>
					<button
						type="button"
						className={ceStyles.ceBtn}
						onClick={handleSortPhones}
						disabled={brand.phones.length < 2}
						title="Sort phones A → Z"
					>
						Sort A→Z
					</button>
					<button
						type="button"
						className={ceStyles.ceBtn}
						onClick={expandAll}
						disabled={brand.phones.length === 0}
					>
						Expand all
					</button>
					<button
						type="button"
						className={ceStyles.ceBtn}
						onClick={collapseAll}
						disabled={expandedPhoneIds.size === 0}
					>
						Collapse all
					</button>
				</div>
			</div>

			{brand.phones.length === 0 ? (
				<div className={styles.pbEmptyList}>
					No phones in this brand yet. Click "Add phone" to get started.
				</div>
			) : (
				brand.phones.map((phone, i) => (
					<PhoneEditor
						key={phone.id}
						brandId={brand.id}
						phone={phone}
						index={i}
						count={brand.phones.length}
						isExpanded={expandedPhoneIds.has(phone.id)}
						onToggleExpand={() => togglePhone(phone.id)}
					/>
				))
			)}

			<button type="button" className={ceStyles.ceArrayAddBtn} onClick={handleAddPhone}>
				+ Add phone
			</button>
		</section>
	);
}
