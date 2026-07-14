import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import LabelConfigEditor from '../shared/LabelConfigEditor';
import styles from '../ConfigEditor.module.css';

const Y_SCALES = [30, 40, 50, 60, 80];

export default function VisualizationSection() {
	const { state } = useConfigEditor();
	const { set } = useFieldSetter(['VISUALIZATION']);

	return (
		<AccordionSection
			id="section-visualization"
			title="Visualization"
			description="Graph display settings: aspect ratio, Y-axis scale, label positioning, and measurement rig description."
			learnMoreHref="./guide-for-admins/customize-page#visualization"
		>
			<div className={styles.ceCardGrid}>
				<div className={styles.ceFieldGroup}>
					<label className={styles.ceLabel}>Aspect Ratio</label>
					<select
						className={styles.ceSelect}
						value={state.VISUALIZATION.ASPECT_RATIO}
						onChange={(e) => set('ASPECT_RATIO', e.target.value)}
					>
						<option value="16:9">16:9 (800 x 450)</option>
						<option value="CrinGraph">CrinGraph (800 x 346)</option>
					</select>
				</div>

				<div className={styles.ceFieldGroup}>
					<label className={styles.ceLabel}>Default Y Scale (dB)</label>
					<select
						className={styles.ceSelect}
						value={state.VISUALIZATION.DEFAULT_Y_SCALE}
						onChange={(e) => set('DEFAULT_Y_SCALE', Number(e.target.value))}
					>
						{Y_SCALES.map((s) => (
							<option key={s} value={s}>
								{s}
							</option>
						))}
					</select>
				</div>
			</div>

			<div className={styles.ceFieldGroup}>
				<label className={styles.ceLabel}>Rig Description</label>
				<input
					type="text"
					className={styles.ceInput}
					value={state.VISUALIZATION.RIG_DESCRIPTION}
					onChange={(e) => set('RIG_DESCRIPTION', e.target.value)}
					placeholder="Measured with IEC 60318-4 (711)"
				/>
			</div>

			<LabelConfigEditor
				label="Phone/Target Label"
				value={state.VISUALIZATION.LABEL}
				onChange={(v) => set('LABEL', v)}
			/>

			<LabelConfigEditor
				label="Baseline Label"
				value={state.VISUALIZATION.BASELINE_LABEL}
				onChange={(v) => set('BASELINE_LABEL', v)}
			/>
		</AccordionSection>
	);
}
