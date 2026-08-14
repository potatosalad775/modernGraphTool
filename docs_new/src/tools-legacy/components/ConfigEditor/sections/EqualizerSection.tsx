import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import styles from '../ConfigEditor.module.css';

/**
 * `min` only constrains the spinner arrows — a cleared or pasted field still
 * reaches `onChange`, and whatever lands in state is what gets written to
 * `config.js`. Clamp here so the generated file can't carry a zero.
 */
const clampBandCount = (raw: string) => {
	const n = Math.floor(Number(raw));
	return Number.isFinite(n) ? Math.max(1, n) : 8;
};

export default function EqualizerSection() {
	const { state, dispatch } = useConfigEditor();
	const { set } = useFieldSetter(['EQUALIZER']);

	return (
		<AccordionSection
			id="section-equalizer"
			title="Equalizer"
			description="Defaults for the Equalizer panel."
			learnMoreHref="./guide-for-admins/customize-page#equalizer"
			optional
			enabled={state.EQUALIZER_ENABLED}
			onToggleEnabled={(v) =>
				dispatch({ type: 'SET_FIELD', path: ['EQUALIZER_ENABLED'], value: v })
			}
		>
			<div className={styles.ceFieldGroup}>
				<label className={styles.ceLabel} htmlFor="eq-autoeq-band-count">
					AutoEQ Default Band Count
					<span className={styles.ceLabelHint}>when the filter list is empty</span>
				</label>
				<input
					id="eq-autoeq-band-count"
					type="number"
					className={styles.ceNumberInline}
					value={state.EQUALIZER?.AUTOEQ_DEFAULT_BAND_COUNT ?? 8}
					onChange={(e) => set('AUTOEQ_DEFAULT_BAND_COUNT', clampBandCount(e.target.value))}
					min={1}
					step={1}
				/>
			</div>
			<div className={styles.ceSectionDescription}>
				How many filter bands <strong>Run AutoEQ</strong> generates when the user has not added any.
				A non-empty filter list always wins, so users can still pick a count by adding or removing
				bands before running. The active constraint preset's band cap still applies.
			</div>
		</AccordionSection>
	);
}
