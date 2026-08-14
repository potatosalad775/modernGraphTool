import React, { useState, useMemo, type ReactNode } from 'react';
import { useConfigEditor } from './ConfigEditorContext';
import { formStateToConfigString } from '@site/src/utils/configConverter';
import styles from './ConfigEditor.module.css';

export default function ExportBar(): ReactNode {
	const { state } = useConfigEditor();
	const [showPreview, setShowPreview] = useState(false);
	const [copied, setCopied] = useState(false);

	const output = useMemo(() => formStateToConfigString(state), [state]);

	const handleDownload = () => {
		const blob = new Blob([output], { type: 'application/javascript' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'config.js';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(output);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Fallback
			const textarea = document.createElement('textarea');
			textarea.value = output;
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand('copy');
			document.body.removeChild(textarea);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	return (
		<div>
			<div className={styles.ceExportBar}>
				<button
					type="button"
					className={`${styles.ceBtn} ${styles.ceBtnPrimary}`}
					onClick={handleDownload}
				>
					Download config.js
				</button>
				<button type="button" className={styles.ceBtn} onClick={handleCopy}>
					{copied ? 'Copied!' : 'Copy to clipboard'}
				</button>
				<button type="button" className={styles.ceBtn} onClick={() => setShowPreview((p) => !p)}>
					{showPreview ? 'Hide preview' : 'Preview output'}
				</button>
			</div>

			{showPreview && (
				<div className={styles.ceExportPreview}>
					<textarea
						className={styles.ceExportTextarea}
						value={output}
						readOnly
						spellCheck={false}
					/>
				</div>
			)}
		</div>
	);
}
