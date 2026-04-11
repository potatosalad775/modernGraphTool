import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import I18nWrapper from '../shared/I18nWrapper';
import type { TopbarLinkForm } from '@site/src/utils/configDefaults';
import styles from '../ConfigEditor.module.css';

export default function TopbarSection() {
  const { state } = useConfigEditor();
  const { set } = useFieldSetter(['TOPBAR']);

  const renderLinkItems = (items: TopbarLinkForm[], onChange: (items: TopbarLinkForm[]) => void) => {
    const updateLink = (index: number, field: 'TITLE' | 'URL', value: string) => {
      const copy = items.map((l) => ({ ...l }));
      copy[index][field] = value;
      onChange(copy);
    };

    const removeLink = (index: number) => {
      onChange(items.filter((_, i) => i !== index));
    };

    const addLink = () => {
      onChange([...items, { TITLE: '', URL: '' }]);
    };

    return (
      <div>
        <div className={styles.ceArrayList}>
          {items.map((link, i) => (
            <div className={styles.ceArrayItem} key={i}>
              <input
                type="text"
                className={styles.ceInput}
                value={link.TITLE}
                onChange={(e) => updateLink(i, 'TITLE', e.target.value)}
                placeholder="Link title"
                style={{ flex: 1 }}
              />
              <input
                type="text"
                className={styles.ceInput}
                value={link.URL}
                onChange={(e) => updateLink(i, 'URL', e.target.value)}
                placeholder="https://..."
                style={{ flex: 2 }}
              />
              <button
                type="button"
                className={styles.ceArrayRemoveBtn}
                onClick={() => removeLink(i)}
                title="Remove"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
        <button type="button" className={styles.ceArrayAddBtn} onClick={addLink}>
          + Add link
        </button>
      </div>
    );
  };

  return (
    <AccordionSection
      id="section-topbar"
      title="Topbar"
      description="Header title and navigation links. Links support multilingual configuration."
      learnMoreHref="./guide-for-admins/customize-page#topbar"
    >
      <div className={styles.ceSubSection}>
        <div className={styles.ceSubSectionTitle}>Title</div>
        <div className={styles.ceCardGrid}>
          <div className={styles.ceFieldGroup}>
            <label className={styles.ceLabel}>Type</label>
            <select
              className={styles.ceSelect}
              value={state.TOPBAR.TITLE.TYPE}
              onChange={(e) => set(['TITLE', 'TYPE'], e.target.value)}
            >
              <option value="TEXT">Text</option>
              <option value="IMAGE">Image</option>
              <option value="HTML">HTML</option>
            </select>
          </div>
        </div>
        <div className={styles.ceFieldGroup}>
          <label className={styles.ceLabel}>Content</label>
          {state.TOPBAR.TITLE.TYPE === 'HTML' ? (
            <textarea
              className={styles.ceTextarea}
              value={state.TOPBAR.TITLE.CONTENT}
              onChange={(e) => set(['TITLE', 'CONTENT'], e.target.value)}
              placeholder="<h2>Site Title</h2>"
            />
          ) : (
            <input
              type="text"
              className={styles.ceInput}
              value={state.TOPBAR.TITLE.CONTENT}
              onChange={(e) => set(['TITLE', 'CONTENT'], e.target.value)}
              placeholder={state.TOPBAR.TITLE.TYPE === 'IMAGE' ? './assets/images/logo.png' : 'Site Title'}
            />
          )}
        </div>
      </div>

      <div className={styles.ceFieldGroup}>
        <label className={styles.ceLabel}>Link List</label>
        <I18nWrapper
          basePath={['TOPBAR', 'LINK_LIST']}
          state={state.TOPBAR.LINK_LIST}
          renderItems={renderLinkItems}
        />
      </div>
    </AccordionSection>
  );
}
