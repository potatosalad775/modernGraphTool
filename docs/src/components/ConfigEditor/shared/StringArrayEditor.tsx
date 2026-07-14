import React from 'react';
import styles from '../ConfigEditor.module.css';

interface StringArrayEditorProps {
	items: string[];
	onChange: (items: string[]) => void;
	placeholder?: string;
	addLabel?: string;
}

export default function StringArrayEditor({
	items,
	onChange,
	placeholder = 'Enter value...',
	addLabel = '+ Add item'
}: StringArrayEditorProps) {
	const updateItem = (index: number, value: string) => {
		const copy = [...items];
		copy[index] = value;
		onChange(copy);
	};

	const removeItem = (index: number) => {
		onChange(items.filter((_, i) => i !== index));
	};

	const addItem = () => {
		onChange([...items, '']);
	};

	return (
		<div>
			<div className={styles.ceArrayList}>
				{items.map((item, i) => (
					<div className={styles.ceArrayItem} key={i}>
						<input
							type="text"
							className={`${styles.ceInput} ${styles.ceArrayInput}`}
							value={item}
							onChange={(e) => updateItem(i, e.target.value)}
							placeholder={placeholder}
						/>
						<button
							type="button"
							className={styles.ceArrayRemoveBtn}
							onClick={() => removeItem(i)}
							title="Remove"
						>
							&times;
						</button>
					</div>
				))}
			</div>
			<button type="button" className={styles.ceArrayAddBtn} onClick={addItem}>
				{addLabel}
			</button>
		</div>
	);
}
