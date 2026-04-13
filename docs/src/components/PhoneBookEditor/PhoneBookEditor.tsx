import React, { useEffect, useState, type ReactNode } from 'react';
import {
  PhoneBookEditorProvider,
  usePhoneBookEditor,
} from './PhoneBookEditorContext';
import ImportPanel from './ImportPanel';
import ExportBar from './ExportBar';
import BrandList from './BrandList';
import BrandEditor from './BrandEditor';
import ceStyles from '../ConfigEditor/ConfigEditor.module.css';
import styles from './PhoneBookEditor.module.css';

function PhoneBookEditorInner(): ReactNode {
  const { state } = usePhoneBookEditor();
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);

  // Keep the selected brand in sync with the underlying state: default to the
  // first brand, and recover gracefully when the selected brand is deleted or
  // the whole phone book is reloaded.
  useEffect(() => {
    if (state.length === 0) {
      if (selectedBrandId !== null) setSelectedBrandId(null);
      return;
    }
    if (!selectedBrandId || !state.some((b) => b.id === selectedBrandId)) {
      setSelectedBrandId(state[0].id);
    }
  }, [state, selectedBrandId]);

  const selectedBrand = state.find((b) => b.id === selectedBrandId) ?? null;

  const handleBrandDeleted = () => {
    // The effect above will pick the next available brand on the next render.
    setSelectedBrandId(null);
  };

  return (
    <div className={ceStyles.ceContainer}>
      <ImportPanel />
      <div className={styles.pbLayout}>
        <BrandList selectedBrandId={selectedBrandId} onSelect={setSelectedBrandId} />
        <BrandEditor brand={selectedBrand} onBrandDeleted={handleBrandDeleted} />
      </div>
      <ExportBar />
    </div>
  );
}

export default function PhoneBookEditor(): ReactNode {
  return (
    <PhoneBookEditorProvider>
      <PhoneBookEditorInner />
    </PhoneBookEditorProvider>
  );
}
