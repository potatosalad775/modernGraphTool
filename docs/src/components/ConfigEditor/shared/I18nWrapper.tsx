import React, { useState, type ReactNode } from 'react';
import { useConfigEditor } from '../ConfigEditorContext';
import type { I18nArrayFormState } from '@site/src/utils/configDefaults';
import styles from '../ConfigEditor.module.css';

interface I18nWrapperProps<T> {
  /** Path in state to the I18nArrayFormState field */
  basePath: string[];
  state: I18nArrayFormState<T>;
  /** Render the item editor for a given language's items */
  renderItems: (items: T[], onChange: (items: T[]) => void, lang: string) => ReactNode;
}

export default function I18nWrapper<T>({
  basePath,
  state,
  renderItems,
}: I18nWrapperProps<T>) {
  const { dispatch, state: configState } = useConfigEditor();
  const [activeLang, setActiveLang] = useState<string | null>(null);

  const languageList = configState.LANGUAGE.LANGUAGE_LIST;

  const setUseI18n = (enabled: boolean) => {
    dispatch({ type: 'SET_FIELD', path: [...basePath, 'useI18n'], value: enabled });
  };

  const setItems = (items: T[]) => {
    dispatch({ type: 'SET_FIELD', path: [...basePath, 'items'], value: items });
  };

  const setLangItems = (lang: string, items: T[]) => {
    dispatch({
      type: 'SET_FIELD',
      path: [...basePath, 'i18n', lang],
      value: items,
    });
  };

  if (!state.useI18n) {
    return (
      <div>
        <div className={styles.ceI18nToggle}>
          <input
            type="checkbox"
            className={styles.ceCheckbox}
            checked={false}
            onChange={() => setUseI18n(true)}
            id={`i18n-toggle-${basePath.join('-')}`}
          />
          <label htmlFor={`i18n-toggle-${basePath.join('-')}`} className={styles.ceToggleLabel}>
            Enable multilingual support
          </label>
        </div>
        {renderItems(state.items, setItems, 'default')}
      </div>
    );
  }

  // i18n mode: show tabs for default + each language
  const langs = languageList.map(([code]) => code).filter((c) => c !== 'en');
  const currentLang = activeLang ?? 'default';

  return (
    <div>
      <div className={styles.ceI18nToggle}>
        <input
          type="checkbox"
          className={styles.ceCheckbox}
          checked={true}
          onChange={() => setUseI18n(false)}
          id={`i18n-toggle-${basePath.join('-')}`}
        />
        <label htmlFor={`i18n-toggle-${basePath.join('-')}`} className={styles.ceToggleLabel}>
          Enable multilingual support
        </label>
      </div>
      <div className={styles.ceI18nTabs}>
        <button
          type="button"
          className={`${styles.ceI18nTab} ${currentLang === 'default' ? styles.ceI18nTabActive : ''}`}
          onClick={() => setActiveLang(null)}
        >
          Default (EN)
        </button>
        {langs.map((code) => {
          const label = languageList.find(([c]) => c === code)?.[1] ?? code;
          return (
            <button
              key={code}
              type="button"
              className={`${styles.ceI18nTab} ${currentLang === code ? styles.ceI18nTabActive : ''}`}
              onClick={() => setActiveLang(code)}
            >
              {label}
            </button>
          );
        })}
      </div>
      {currentLang === 'default'
        ? renderItems(state.items, setItems, 'default')
        : renderItems(
            state.i18n[currentLang] ?? [],
            (items) => setLangItems(currentLang, items),
            currentLang,
          )}
    </div>
  );
}
