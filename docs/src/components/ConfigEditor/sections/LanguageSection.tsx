import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import styles from '../ConfigEditor.module.css';

export default function LanguageSection() {
  const { state } = useConfigEditor();
  const { set } = useFieldSetter(['LANGUAGE']);

  const langList = state.LANGUAGE.LANGUAGE_LIST;

  const updateLang = (index: number, field: 0 | 1, value: string) => {
    const copy = langList.map((pair) => [...pair] as [string, string]);
    copy[index][field] = value;
    set('LANGUAGE_LIST', copy);
  };

  const removeLang = (index: number) => {
    set('LANGUAGE_LIST', langList.filter((_, i) => i !== index));
  };

  const addLang = () => {
    set('LANGUAGE_LIST', [...langList, ['', '']]);
  };

  return (
    <AccordionSection
      id="section-language"
      title="Language"
      description="Available languages, i18n toggle, and system language detection. Languages added here become available for i18n sections (Target Manifest, Topbar Links, Description)."
      learnMoreHref="./guide-for-admins/customize-page#language"
    >
      <div className={styles.ceFieldGroup}>
        <label className={styles.ceLabel}>Language List</label>
        <div className={styles.ceArrayList}>
          {langList.map(([code, name], i) => (
            <div className={styles.ceArrayItem} key={i}>
              <input
                type="text"
                className={`${styles.ceInput} ${styles.ceInputSmall}`}
                value={code}
                onChange={(e) => updateLang(i, 0, e.target.value)}
                placeholder="Code (e.g. en)"
                style={{ width: '80px' }}
              />
              <input
                type="text"
                className={`${styles.ceInput} ${styles.ceArrayInput}`}
                value={name}
                onChange={(e) => updateLang(i, 1, e.target.value)}
                placeholder="Name (e.g. English)"
              />
              <button
                type="button"
                className={styles.ceArrayRemoveBtn}
                onClick={() => removeLang(i)}
                title="Remove"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
        <button type="button" className={styles.ceArrayAddBtn} onClick={addLang}>
          + Add language
        </button>
      </div>

      <div className={styles.ceToggleRow}>
        <input
          type="checkbox"
          className={styles.ceCheckbox}
          checked={state.LANGUAGE.ENABLE_I18N}
          onChange={(e) => set('ENABLE_I18N', e.target.checked)}
          id="lang-i18n"
        />
        <label htmlFor="lang-i18n" className={styles.ceToggleLabel}>
          Enable internationalization
          <span className={styles.ceToggleHint}>Adds language selector to Misc Panel</span>
        </label>
      </div>

      <div className={styles.ceToggleRow}>
        <input
          type="checkbox"
          className={styles.ceCheckbox}
          checked={state.LANGUAGE.ENABLE_SYSTEM_LANG_DETECTION}
          onChange={(e) => set('ENABLE_SYSTEM_LANG_DETECTION', e.target.checked)}
          id="lang-detect"
        />
        <label htmlFor="lang-detect" className={styles.ceToggleLabel}>
          Enable system language detection
        </label>
      </div>
    </AccordionSection>
  );
}
