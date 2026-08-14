import React, { type ReactNode } from 'react';
import ceStyles from '../../ConfigEditor/ConfigEditor.module.css';
import styles from '../PhoneBookEditor.module.css';

export interface RowsEditorColumn {
	key: string;
	label: string;
	placeholder?: string;
}

interface RowsEditorProps<Row extends Record<string, string>> {
	rows: Row[];
	columns: RowsEditorColumn[];
	onChange: (rows: Row[]) => void;
	createEmpty: () => Row;
	minRows?: number;
	addLabel?: string;
}

export default function RowsEditor<Row extends Record<string, string>>({
	rows,
	columns,
	onChange,
	createEmpty,
	minRows = 1,
	addLabel = '+ Add row'
}: RowsEditorProps<Row>): ReactNode {
	const twoCol = columns.length === 2;
	const rowClass = `${styles.pbRow} ${twoCol ? styles.pbRowTwoCol : styles.pbRowOneCol}`;

	const update = (index: number, key: string, value: string) => {
		const copy = [...rows];
		copy[index] = { ...copy[index], [key]: value };
		onChange(copy);
	};

	const remove = (index: number) => {
		if (rows.length <= minRows) return;
		onChange(rows.filter((_, i) => i !== index));
	};

	const add = () => onChange([...rows, createEmpty()]);

	return (
		<div>
			<div className={styles.pbRowsTable}>
				<div
					className={`${styles.pbRowsHeader} ${twoCol ? styles.pbRowTwoCol : styles.pbRowOneCol}`}
				>
					{columns.map((c) => (
						<span key={c.key}>{c.label}</span>
					))}
					<span />
				</div>
				{rows.map((row, i) => (
					<div className={rowClass} key={i}>
						{columns.map((c) => (
							<input
								key={c.key}
								type="text"
								className={ceStyles.ceInput}
								value={row[c.key] ?? ''}
								placeholder={c.placeholder}
								onChange={(e) => update(i, c.key, e.target.value)}
							/>
						))}
						<button
							type="button"
							className={ceStyles.ceArrayRemoveBtn}
							onClick={() => remove(i)}
							title="Remove row"
							disabled={rows.length <= minRows}
						>
							&times;
						</button>
					</div>
				))}
			</div>
			<button type="button" className={ceStyles.ceArrayAddBtn} onClick={add}>
				{addLabel}
			</button>
		</div>
	);
}
