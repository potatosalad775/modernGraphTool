import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import styles from '../ConfigEditor.module.css';

export default function NormalizationSection() {
	const { state } = useConfigEditor();
	const { set } = useFieldSetter(['NORMALIZATION']);

	return (
		<AccordionSection
			id="section-normalization"
			title="Normalization"
			description="Default graph normalization method. Hz normalizes to a specific frequency; Avg uses the 300-3000 Hz midrange average."
			learnMoreHref="./guide-for-admins/customize-page#normalization"
		>
			<div className={styles.ceFieldGroup}>
				<label className={styles.ceLabel}>Type</label>
				<div className={styles.ceRadioGroup}>
					<label className={styles.ceRadioLabel}>
						<input
							type="radio"
							className={styles.ceRadio}
							checked={state.NORMALIZATION.TYPE === 'Hz'}
							onChange={() => set('TYPE', 'Hz')}
						/>
						Hz (specific frequency)
					</label>
					<label className={styles.ceRadioLabel}>
						<input
							type="radio"
							className={styles.ceRadio}
							checked={state.NORMALIZATION.TYPE === 'Avg'}
							onChange={() => set('TYPE', 'Avg')}
						/>
						Avg (300-3000 Hz)
					</label>
				</div>
			</div>

			{state.NORMALIZATION.TYPE === 'Hz' && (
				<div className={styles.ceFieldGroup}>
					<label className={styles.ceLabel}>
						Frequency (Hz)
						<span className={styles.ceLabelHint}>20 - 20000</span>
					</label>
					<input
						type="number"
						className={`${styles.ceInput} ${styles.ceInputSmall}`}
						value={state.NORMALIZATION.HZ_VALUE}
						onChange={(e) => set('HZ_VALUE', Number(e.target.value))}
						min={20}
						max={20000}
					/>
				</div>
			)}
		</AccordionSection>
	);
}
