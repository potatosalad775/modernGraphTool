import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import styles from '../ConfigEditor.module.css';

type DisplayMode = 'avg' | 'curves' | 'fill';

const MODES: Array<{ value: DisplayMode; label: string; hint: string }> = [
	{ value: 'avg', label: 'Averaged curve', hint: 'One line, the mean of every run' },
	{ value: 'curves', label: 'Individual runs', hint: 'One toggleable curve per run' },
	{ value: 'fill', label: 'Deviation fill', hint: 'Shaded min/max band across runs' }
];

/**
 * `SAMPLES` replaced the old `MULTI_SAMPLE` and `HPTF` sections. `display` is a
 * set rather than an enum, so the control is checkboxes: "averaged curve plus a
 * variance band" was one of the combinations neither old section could express.
 */
export default function SamplesSection() {
	const { state } = useConfigEditor();
	const { set } = useFieldSetter(['SAMPLES']);

	const selected: DisplayMode[] = state.SAMPLES?.DEFAULT_DISPLAY ?? ['avg'];

	const toggle = (mode: DisplayMode) => {
		const next = selected.includes(mode)
			? selected.filter((m) => m !== mode)
			: MODES.map((m) => m.value).filter((m) => m === mode || selected.includes(m));
		set('DEFAULT_DISPLAY', next);
	};

	return (
		<AccordionSection
			id="section-samples"
			title="Sample Sets"
			description="Defaults for variants measured more than once — repeat runs, seating positions, one measurement per ear pad."
			learnMoreHref="./guide-for-admins/customize-page#samples"
		>
			<div className={styles.ceFieldGroup}>
				<label className={styles.ceLabel}>
					Default Run Count
					<span className={styles.ceLabelHint}>when a variant declares none</span>
				</label>
				<input
					type="number"
					className={styles.ceNumberInline}
					value={state.SAMPLES?.DEFAULT_COUNT ?? 1}
					onChange={(e) => set('DEFAULT_COUNT', Number(e.target.value))}
					min={1}
					step={1}
				/>
			</div>

			<div className={styles.ceFieldGroup}>
				<label className={styles.ceLabel}>Default Display</label>
				{MODES.map((mode) => (
					<div key={mode.value} className={styles.ceToggleRow}>
						<input
							type="checkbox"
							className={styles.ceCheckbox}
							checked={selected.includes(mode.value)}
							onChange={() => toggle(mode.value)}
							id={`samples-display-${mode.value}`}
						/>
						<label htmlFor={`samples-display-${mode.value}`} className={styles.ceToggleLabel}>
							{mode.label}
							<span className={styles.ceLabelHint}>{mode.hint}</span>
						</label>
					</div>
				))}
			</div>

			<div className={styles.ceFieldGroup}>
				<label className={styles.ceLabel}>
					Fill Opacity
					<span className={styles.ceLabelHint}>0 - 1</span>
				</label>
				<div className={styles.ceRangeRow}>
					<input
						type="range"
						className={styles.ceRange}
						min={0}
						max={1}
						step={0.05}
						value={state.SAMPLES?.FILL_OPACITY ?? 0.3}
						onChange={(e) => set('FILL_OPACITY', Number(e.target.value))}
					/>
					<input
						type="number"
						className={styles.ceNumberInline}
						value={state.SAMPLES?.FILL_OPACITY ?? 0.3}
						onChange={(e) => set('FILL_OPACITY', Number(e.target.value))}
						min={0}
						max={1}
						step={0.05}
					/>
				</div>
			</div>
		</AccordionSection>
	);
}
