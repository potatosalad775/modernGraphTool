import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import styles from '../ConfigEditor.module.css';

export default function UrlSection() {
	const { state } = useConfigEditor();
	const { set } = useFieldSetter(['URL']);

	return (
		<AccordionSection
			id="section-url"
			title="URL"
			description="Controls whether the URL auto-updates with selected devices/targets and whether it's compressed."
			learnMoreHref="./guide-for-admins/customize-page#url"
		>
			<div className={styles.ceToggleRow}>
				<input
					type="checkbox"
					className={styles.ceCheckbox}
					checked={state.URL.AUTO_UPDATE_URL}
					onChange={(e) => set('AUTO_UPDATE_URL', e.target.checked)}
					id="url-auto-update"
				/>
				<label htmlFor="url-auto-update" className={styles.ceToggleLabel}>
					Auto-update URL
					<span className={styles.ceToggleHint}>Update URL when phones/targets change</span>
				</label>
			</div>

			<div className={styles.ceToggleRow}>
				<input
					type="checkbox"
					className={styles.ceCheckbox}
					checked={state.URL.COMPRESS_URL}
					onChange={(e) => set('COMPRESS_URL', e.target.checked)}
					id="url-compress"
				/>
				<label htmlFor="url-compress" className={styles.ceToggleLabel}>
					Compress URL
					<span className={styles.ceToggleHint}>Uses Base62 encoding</span>
				</label>
			</div>
		</AccordionSection>
	);
}
