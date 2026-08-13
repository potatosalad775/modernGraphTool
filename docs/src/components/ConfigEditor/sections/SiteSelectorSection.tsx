import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import StringArrayEditor from '../shared/StringArrayEditor';
import styles from '../ConfigEditor.module.css';

export default function SiteSelectorSection() {
	const { state } = useConfigEditor();
	const { set } = useFieldSetter(['SITE_SELECTOR']);

	return (
		<AccordionSection
			id="section-site-selector"
			title="Site Selector"
			description="Top-bar dropdown for switching between measurement databases across sites."
			learnMoreHref="./features/site-selector"
		>
			<div className={styles.ceFieldGroup}>
				<label className={styles.ceLabel}>
					Visibility
					<span className={styles.ceLabelHint}>
						auto shows it only when this site is listed in the index
					</span>
				</label>
				<select
					className={styles.ceSelect}
					value={String(state.SITE_SELECTOR.ENABLED)}
					onChange={(e) =>
						set('ENABLED', e.target.value === 'auto' ? 'auto' : e.target.value === 'true')
					}
				>
					<option value="auto">Auto</option>
					<option value="true">Always show</option>
					<option value="false">Never show</option>
				</select>
			</div>

			<div className={styles.ceFieldGroup}>
				<label className={styles.ceLabel}>
					Index URLs
					<span className={styles.ceLabelHint}>tried in order — empty uses the official index</span>
				</label>
				<StringArrayEditor
					items={state.SITE_SELECTOR.INDEX_URLS}
					onChange={(items) => set('INDEX_URLS', items)}
					placeholder="https://example.com/db-site-index.json"
					addLabel="+ Add URL"
				/>
			</div>
		</AccordionSection>
	);
}
