import React, { useState, useRef, type ReactNode } from 'react';
import { usePhoneBookEditor } from './PhoneBookEditorContext';
import { parsePhoneBook } from '@site/src/utils/phoneBookConverter';
import styles from '../ConfigEditor/ConfigEditor.module.css';

export default function ImportPanel(): ReactNode {
  const { dispatch } = usePhoneBookEditor();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const clearMessages = () => {
    setError(null);
    setWarnings([]);
    setSuccess(null);
  };

  const handleImport = () => {
    clearMessages();
    if (!input.trim()) {
      setError('Please paste your phone_book.json content.');
      return;
    }
    try {
      const result = parsePhoneBook(input);
      dispatch({ type: 'LOAD', state: result.state });
      setWarnings(result.warnings);
      setSuccess(`Imported ${result.state.length} brand(s). Edit below and export when ready.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReset = () => {
    clearMessages();
    dispatch({ type: 'RESET' });
    setInput('');
    setSuccess('Started a fresh phone_book.');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setInput(reader.result as string);
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className={styles.ceImportPanel}>
      <div className={styles.ceImportContent}>
        <textarea
          className={styles.ceImportTextarea}
          placeholder="Paste your phone_book.json content here, or upload a file..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
        />

        <div className={styles.ceImportActions}>
          <button
            type="button"
            className={`${styles.ceBtn} ${styles.ceBtnPrimary}`}
            onClick={handleImport}
          >
            Import
          </button>
          <label className={styles.ceImportFileLabel}>
            Upload file
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              className={styles.ceImportFileInput}
              onChange={handleFileUpload}
            />
          </label>
          <button type="button" className={styles.ceBtn} onClick={handleReset}>
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
