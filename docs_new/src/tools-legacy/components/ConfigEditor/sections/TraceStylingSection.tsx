import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import styles from '../ConfigEditor.module.css';

export default function TraceStylingSection() {
	const { state } = useConfigEditor();
	const { set } = useFieldSetter(['TRACE_STYLING']);

	const dashes = state.TRACE_STYLING.TARGET_TRACE_DASH;

	const updateDash = (index: number, field: 'name' | 'dash', value: string) => {
		const copy = dashes.map((d) => ({ ...d }));
		copy[index][field] = value;
		set('TARGET_TRACE_DASH', copy);
	};

	const removeDash = (index: number) => {
		set(
			'TARGET_TRACE_DASH',
			dashes.filter((_, i) => i !== index)
		);
	};

	const addDash = () => {
		set('TARGET_TRACE_DASH', [...dashes, { name: '', dash: '' }]);
	};

	return (
		<AccordionSection
			id="section-trace-styling"
			title="Trace Styling"
			description="Line thickness and dash patterns for graph traces. Per-target dash values follow the SVG stroke-dasharray format."
			learnMoreHref="./guide-for-admins/customize-page#trace_styling"
		>
			<div className={styles.ceCardGrid}>
				<div className={styles.ceFieldGroup}>
					<label className={styles.ceLabel}>Phone Trace Thickness</label>
					<input
						type="number"
						className={`${styles.ceInput} ${styles.ceInputSmall}`}
						value={state.TRACE_STYLING.PHONE_TRACE_THICKNESS}
						onChange={(e) => set('PHONE_TRACE_THICKNESS', Number(e.target.value))}
						min={0.5}
						max={10}
						step={0.5}
					/>
				</div>

				<div className={styles.ceFieldGroup}>
					<label className={styles.ceLabel}>Target Trace Thickness</label>
					<input
						type="number"
						className={`${styles.ceInput} ${styles.ceInputSmall}`}
						value={state.TRACE_STYLING.TARGET_TRACE_THICKNESS}
						onChange={(e) => set('TARGET_TRACE_THICKNESS', Number(e.target.value))}
						min={0.5}
						max={10}
						step={0.5}
					/>
				</div>
			</div>

			<div className={styles.ceFieldGroup}>
				<label className={styles.ceLabel}>Target Trace Dash Patterns</label>
				<div className={styles.ceArrayList}>
					{dashes.map((d, i) => (
						<div className={styles.ceArrayItem} key={i}>
							<input
								type="text"
								className={`${styles.ceInput}`}
								value={d.name}
								onChange={(e) => updateDash(i, 'name', e.target.value)}
								placeholder="Target name"
								style={{ flex: 1 }}
							/>
							<input
								type="text"
								className={`${styles.ceInput} ${styles.ceInputSmall}`}
								value={d.dash}
								onChange={(e) => updateDash(i, 'dash', e.target.value)}
								placeholder="10 10"
								style={{ width: '100px' }}
							/>
							<button
								type="button"
								className={styles.ceArrayRemoveBtn}
								onClick={() => removeDash(i)}
								title="Remove"
							>
								&times;
							</button>
						</div>
					))}
				</div>
				<button type="button" className={styles.ceArrayAddBtn} onClick={addDash}>
					+ Add dash pattern
				</button>
			</div>
		</AccordionSection>
	);
}
