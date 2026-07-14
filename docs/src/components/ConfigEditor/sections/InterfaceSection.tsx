import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import styles from '../ConfigEditor.module.css';

export default function InterfaceSection() {
	const { state } = useConfigEditor();
	const { set } = useFieldSetter(['INTERFACE']);

	return (
		<AccordionSection
			id="section-interface"
			title="Interface"
			description="User interface behavior: theme preference, phone removal, panel switching, and target selector options."
			learnMoreHref="./guide-for-admins/customize-page#interface"
		>
			<div className={styles.ceFieldGroup}>
				<label className={styles.ceLabel}>Theme Preference</label>
				<select
					className={styles.ceSelect}
					value={state.INTERFACE.PREFERRED_DARK_MODE_THEME}
					onChange={(e) => set('PREFERRED_DARK_MODE_THEME', e.target.value)}
				>
					<option value="light">Light</option>
					<option value="dark">Dark</option>
					<option value="system">System</option>
				</select>
			</div>

			<div className={styles.ceToggleRow}>
				<input
					type="checkbox"
					className={styles.ceCheckbox}
					checked={state.INTERFACE.ALLOW_REMOVING_PHONE_FROM_SELECTOR}
					onChange={(e) => set('ALLOW_REMOVING_PHONE_FROM_SELECTOR', e.target.checked)}
					id="if-allow-remove"
				/>
				<label htmlFor="if-allow-remove" className={styles.ceToggleLabel}>
					Allow removing phone from selector
				</label>
			</div>

			<div className={styles.ceToggleRow}>
				<input
					type="checkbox"
					className={styles.ceCheckbox}
					checked={state.INTERFACE.SWITCH_PHONE_PANEL_ON_BRAND_CLICK}
					onChange={(e) => set('SWITCH_PHONE_PANEL_ON_BRAND_CLICK', e.target.checked)}
					id="if-switch-panel"
				/>
				<label htmlFor="if-switch-panel" className={styles.ceToggleLabel}>
					Switch to phone panel on brand click (mobile)
				</label>
			</div>

			<div className={styles.ceSubSection}>
				<div className={styles.ceSubSectionTitle}>Target Selector</div>

				<div className={styles.ceToggleRow}>
					<input
						type="checkbox"
						className={styles.ceCheckbox}
						checked={state.INTERFACE.TARGET.ALLOW_MULTIPLE_LINE_PER_TYPE}
						onChange={(e) => set(['TARGET', 'ALLOW_MULTIPLE_LINE_PER_TYPE'], e.target.checked)}
						id="if-target-multi"
					/>
					<label htmlFor="if-target-multi" className={styles.ceToggleLabel}>
						Multiple lines per type
					</label>
				</div>

				<div className={styles.ceToggleRow}>
					<input
						type="checkbox"
						className={styles.ceCheckbox}
						checked={state.INTERFACE.TARGET.OMIT_TARGET_SUFFIX}
						onChange={(e) => set(['TARGET', 'OMIT_TARGET_SUFFIX'], e.target.checked)}
						id="if-target-suffix"
					/>
					<label htmlFor="if-target-suffix" className={styles.ceToggleLabel}>
						Omit "Target" suffix
					</label>
				</div>

				<div className={styles.ceToggleRow}>
					<input
						type="checkbox"
						className={styles.ceCheckbox}
						checked={state.INTERFACE.TARGET.COLLAPSE_TARGET_LIST_ON_INITIAL}
						onChange={(e) => set(['TARGET', 'COLLAPSE_TARGET_LIST_ON_INITIAL'], e.target.checked)}
						id="if-target-collapse"
					/>
					<label htmlFor="if-target-collapse" className={styles.ceToggleLabel}>
						Collapse target list on initial load
					</label>
				</div>
			</div>

			<div className={styles.ceToggleRow}>
				<input
					type="checkbox"
					className={styles.ceCheckbox}
					checked={state.INTERFACE.HIDE_DEV_DONATE_BUTTON}
					onChange={(e) => set('HIDE_DEV_DONATE_BUTTON', e.target.checked)}
					id="if-hide-donate"
				/>
				<label htmlFor="if-hide-donate" className={styles.ceToggleLabel}>
					Hide donate button
				</label>
			</div>
		</AccordionSection>
	);
}
