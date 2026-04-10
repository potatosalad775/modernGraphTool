import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import I18nWrapper from '../shared/I18nWrapper';
import StringArrayEditor from '../shared/StringArrayEditor';
import type { TargetManifestEntryForm } from '@site/src/utils/configDefaults';
import styles from '../ConfigEditor.module.css';

export default function TargetManifestSection() {
  const { state } = useConfigEditor();
  const { set } = useFieldSetter([]);

  const renderItems = (items: TargetManifestEntryForm[], onChange: (items: TargetManifestEntryForm[]) => void, lang: string) => {
    const isI18nLang = lang !== 'default';

    const updateEntry = (index: number, partial: Partial<TargetManifestEntryForm>) => {
      const copy = items.map((e) => ({ ...e }));
      copy[index] = { ...copy[index], ...partial };
      onChange(copy);
    };

    const removeEntry = (index: number) => {
      onChange(items.filter((_, i) => i !== index));
    };

    const addEntry = () => {
      onChange([...items, { type: '', files: [] }]);
    };

    return (
      <div>
        {items.map((entry, i) => (
          <div key={i} className={styles.ceCard}>
            <div className={styles.ceCardHeader}>
              <span className={styles.ceCardTitle}>Group #{i + 1}</span>
              <button
                type="button"
                className={`${styles.ceBtn} ${styles.ceBtnSmall} ${styles.ceBtnDanger}`}
                onClick={() => removeEntry(i)}
              >
                Remove
              </button>
            </div>
            <div className={styles.ceFieldGroup}>
              <label className={styles.ceLabel}>Type Name</label>
              <input
                type="text"
                className={styles.ceInput}
                value={entry.type}
                onChange={(e) => updateEntry(i, { type: e.target.value })}
                placeholder="e.g. Harman, Neutral, Reviewer"
              />
            </div>
            {/* i18n language tabs only show type (files come from default) */}
            {!isI18nLang && (
              <div className={styles.ceFieldGroup}>
                <label className={styles.ceLabel}>Files</label>
                <StringArrayEditor
                  items={entry.files ?? []}
                  onChange={(files) => updateEntry(i, { files })}
                  placeholder="Target file name"
                  addLabel="+ Add file"
                />
              </div>
            )}
          </div>
        ))}
        <button type="button" className={styles.ceArrayAddBtn} onClick={addEntry}>
          + Add group
        </button>
      </div>
    );
  };

  return (
    <AccordionSection
      id="section-target-manifest"
      title="Target Manifest"
      description="Groups and sorts targets in the target selector. Supports multilingual type names."
      learnMoreHref="./guide-for-admins/customize-page#target_manifest"
    >
      <I18nWrapper
        basePath={['TARGET_MANIFEST']}
        state={state.TARGET_MANIFEST}
        renderItems={renderItems}
      />
    </AccordionSection>
  );
}
