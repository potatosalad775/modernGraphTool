import React from 'react';
import type { LabelFormState } from '@site/src/utils/configDefaults';
import styles from '../ConfigEditor.module.css';

interface LabelConfigEditorProps {
	label: string;
	value: LabelFormState;
	onChange: (value: LabelFormState) => void;
}

const LOCATIONS = ['BOTTOM_LEFT', 'BOTTOM_RIGHT', 'TOP_LEFT', 'TOP_RIGHT'];
const WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];

export default function LabelConfigEditor({ label, value, onChange }: LabelConfigEditorProps) {
	const update = (partial: Partial<LabelFormState>) => {
		onChange({ ...value, ...partial });
	};

	const updatePosition = (key: string, val: string) => {
		onChange({ ...value, POSITION: { ...value.POSITION, [key]: val } });
	};

	return (
		<div className={styles.ceSubSection}>
			<div className={styles.ceSubSectionTitle}>{label}</div>

			<div className={styles.ceCardGrid}>
				<div className={styles.ceFieldGroup}>
					<label className={styles.ceLabel}>Location</label>
					<select
						className={styles.ceSelect}
						value={value.LOCATION}
						onChange={(e) => update({ LOCATION: e.target.value })}
					>
						{LOCATIONS.map((loc) => (
							<option key={loc} value={loc}>
								{loc.replace(/_/g, ' ')}
							</option>
						))}
					</select>
				</div>

				<div className={styles.ceFieldGroup}>
					<label className={styles.ceLabel}>Text Size</label>
					<input
						type="text"
						className={`${styles.ceInput} ${styles.ceInputSmall}`}
						value={value.TEXT_SIZE}
						onChange={(e) => update({ TEXT_SIZE: e.target.value })}
						placeholder="14px"
					/>
				</div>

				<div className={styles.ceFieldGroup}>
					<label className={styles.ceLabel}>Font Weight</label>
					<select
						className={styles.ceSelect}
						value={value.TEXT_WEIGHT}
						onChange={(e) => update({ TEXT_WEIGHT: e.target.value })}
					>
						{WEIGHTS.map((w) => (
							<option key={w} value={w}>
								{w}
							</option>
						))}
					</select>
				</div>
			</div>

			<div className={styles.ceFieldGroup}>
				<label className={styles.ceLabel}>Position Offsets</label>
				<div className={styles.ceCardGrid}>
					{(['LEFT', 'RIGHT', 'UP', 'DOWN'] as const).map((dir) => (
						<div key={dir} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
							<span style={{ fontSize: '0.75rem', minWidth: '40px' }}>{dir}</span>
							<input
								type="text"
								className={`${styles.ceInput} ${styles.ceInputSmall}`}
								value={value.POSITION[dir]}
								onChange={(e) => updatePosition(dir, e.target.value)}
								placeholder="0"
							/>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
