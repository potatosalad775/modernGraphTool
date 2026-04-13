import React, { useState, useMemo, type ReactNode } from 'react';
import { usePhoneBookEditor } from './PhoneBookEditorContext';
import { serializePhoneBook } from '@site/src/utils/phoneBookConverter';
import styles from '../ConfigEditor/ConfigEditor.module.css';

export default function ExportBar(): ReactNode {
  const { state } = usePhoneBookEditor();
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  const output = useMemo(() => serializePhoneBook(state), [state]);

  const handleDownload = () => {
    const blob = new Blob([output], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'phone_book.json';
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
          Download phone_book.json
        </button>
        <button type="button" className={styles.ceBtn} onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy to clipboard'}
        </button>
        <button
          type="button"
          className={styles.ceBtn}
          onClick={() => setShowPreview((p) => !p)}
        >
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
