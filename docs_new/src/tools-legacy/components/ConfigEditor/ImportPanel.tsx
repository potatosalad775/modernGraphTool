import React, { useState, useRef, type ReactNode } from 'react';
import { useConfigEditor } from './ConfigEditorContext';
import {
	parseV2Config,
	parseV1Config,
	parseV1Extensions,
	parseCrinGraphConfig,
	convertV1ToV2,
	convertCrinGraphToV2,
	configToFormState
} from '@site/src/utils/configConverter';
import { createDefaultConfig } from '@site/src/utils/configDefaults';
import styles from './ConfigEditor.module.css';

type ImportTab = 'v2' | 'v1' | 'crin';

export default function ImportPanel(): ReactNode {
	const { dispatch } = useConfigEditor();
	const [activeTab, setActiveTab] = useState<ImportTab>('v2');
	const [input, setInput] = useState('');
	const [v1Extensions, setV1Extensions] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [warnings, setWarnings] = useState<string[]>([]);
	const [success, setSuccess] = useState<string | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);

	const clearMessages = () => {
		setError(null);
		setWarnings([]);
		setSuccess(null);
	};

	const loadDefaults = () => {
		clearMessages();
		dispatch({ type: 'RESET_DEFAULTS' });
		setInput('');
		setV1Extensions('');
		setSuccess('Loaded default configuration.');
	};

	const importV2 = () => {
		clearMessages();
		if (!input.trim()) {
			setError('Please paste your v2 config.js content.');
			return;
		}
		try {
			const raw = parseV2Config(input);
			const formState = configToFormState(raw);
			dispatch({ type: 'LOAD_CONFIG', config: formState });
			setSuccess('Config imported successfully. Edit the fields below and export when ready.');
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	const importV1 = () => {
		clearMessages();
		if (!input.trim()) {
			setError('Please paste your v1 config.js content.');
			return;
		}
		try {
			const config = parseV1Config(input);
			let extensions: any[] | null = null;
			if (v1Extensions.trim()) {
				extensions = parseV1Extensions(v1Extensions);
			}
			const result = convertV1ToV2(config, extensions);
			setWarnings(result.warnings);
			// Parse the generated v2 string back into form state
			const raw = parseV2Config(result.output);
			const formState = configToFormState(raw);
			dispatch({ type: 'LOAD_CONFIG', config: formState });
			setSuccess('v1 config converted and imported. Review the settings below.');
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	const importCrin = () => {
		clearMessages();
		if (!input.trim()) {
			setError('Please paste your CrinGraph config.js content.');
			return;
		}
		try {
			const config = parseCrinGraphConfig(input);
			const result = convertCrinGraphToV2(config);
			setWarnings(result.warnings);
			const raw = parseV2Config(result.output);
			const formState = configToFormState(raw);
			dispatch({ type: 'LOAD_CONFIG', config: formState });
			setSuccess('CrinGraph config converted and imported. Review the settings below.');
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	const handleImport = () => {
		switch (activeTab) {
			case 'v2':
				return importV2();
			case 'v1':
				return importV1();
			case 'crin':
				return importCrin();
		}
	};

	const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			setInput(reader.result as string);
		};
		reader.readAsText(file);
		// Reset file input so re-uploading the same file triggers change
		if (fileRef.current) fileRef.current.value = '';
	};

	return (
		<div className={styles.ceImportPanel}>
			<div className={styles.ceImportTabs}>
				<button
					type="button"
					className={`${styles.ceImportTab} ${activeTab === 'v2' ? styles.ceImportTabActive : ''}`}
					onClick={() => {
						setActiveTab('v2');
						clearMessages();
					}}
				>
					Import v2
				</button>
				<button
					type="button"
					className={`${styles.ceImportTab} ${activeTab === 'v1' ? styles.ceImportTabActive : ''}`}
					onClick={() => {
						setActiveTab('v1');
						clearMessages();
					}}
				>
					Convert v1
				</button>
				<button
					type="button"
					className={`${styles.ceImportTab} ${activeTab === 'crin' ? styles.ceImportTabActive : ''}`}
					onClick={() => {
						setActiveTab('crin');
						clearMessages();
					}}
				>
					Convert CrinGraph
				</button>
			</div>

			<div className={styles.ceImportContent}>
				<textarea
					className={styles.ceImportTextarea}
					placeholder={
						activeTab === 'v2'
							? 'Paste your v2 config.js content here...'
							: activeTab === 'v1'
								? 'Paste your v1 config.js content here...'
								: 'Paste your CrinGraph config.js content here...'
					}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					spellCheck={false}
				/>

				{activeTab === 'v1' && (
					<textarea
						className={styles.ceImportTextarea}
						placeholder="Paste your v1 extensions.config.js content here (optional)..."
						value={v1Extensions}
						onChange={(e) => setV1Extensions(e.target.value)}
						spellCheck={false}
						style={{ minHeight: '120px' }}
					/>
				)}

				<div className={styles.ceImportActions}>
					<button
						type="button"
						className={`${styles.ceBtn} ${styles.ceBtnPrimary}`}
						onClick={handleImport}
					>
						{activeTab === 'v2' ? 'Import' : 'Convert & Import'}
					</button>
					<label className={styles.ceImportFileLabel}>
						Upload file
						<input
							ref={fileRef}
							type="file"
							accept=".js,.txt"
							className={styles.ceImportFileInput}
							onChange={handleFileUpload}
						/>
					</label>
					<button type="button" className={styles.ceBtn} onClick={loadDefaults}>
						Start Fresh
					</button>
				</div>

				{error && <div className={styles.ceError}>{error}</div>}
				{warnings.length > 0 && (
					<div className={styles.ceWarnings}>
						<strong>Warnings:</strong>
						<ul>
							{warnings.map((w, i) => (
								<li key={i}>{w}</li>
							))}
						</ul>
					</div>
				)}
				{success && <div className={styles.ceSuccess}>{success}</div>}
			</div>
		</div>
	);
}
