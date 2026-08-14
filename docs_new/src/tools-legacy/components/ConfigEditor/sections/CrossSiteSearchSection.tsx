import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import StringArrayEditor from '../shared/StringArrayEditor';
import styles from '../ConfigEditor.module.css';

export default function CrossSiteSearchSection() {
	const { state } = useConfigEditor();
	const { set } = useFieldSetter(['CROSS_SITE_SEARCH']);

	return (
		<AccordionSection
			id="section-cross-site-search"
			title="Cross-Site Search"
			description="Let visitors search other measurement databases from your search box. Works on any host."
			learnMoreHref="./features/cross-site-search"
		>
			<div className={styles.ceToggleRow}>
				<input
					type="checkbox"
					className={styles.ceCheckbox}
					checked={state.CROSS_SITE_SEARCH.ENABLED}
					onChange={(e) => set('ENABLED', e.target.checked)}
					id="css-enabled"
				/>
				<label htmlFor="css-enabled" className={styles.ceToggleLabel}>
					Enabled
				</label>
			</div>

			<div className={styles.ceFieldGroup}>
				<label className={styles.ceLabel}>
					Index URLs
					<span className={styles.ceLabelHint}>tried in order — empty uses the official index</span>
				</label>
				<StringArrayEditor
					items={state.CROSS_SITE_SEARCH.INDEX_URLS}
					onChange={(items) => set('INDEX_URLS', items)}
					placeholder="https://example.com/aggregate-index.json"
					addLabel="+ Add URL"
				/>
			</div>
		</AccordionSection>
	);
}
