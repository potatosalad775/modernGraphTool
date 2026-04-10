import React from 'react';
import { useConfigEditor } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import I18nWrapper from '../shared/I18nWrapper';
import type { DescriptionItemForm } from '@site/src/utils/configDefaults';
import styles from '../ConfigEditor.module.css';

export default function DescriptionSection() {
  const { state } = useConfigEditor();

  const renderItems = (items: DescriptionItemForm[], onChange: (items: DescriptionItemForm[]) => void) => {
    const updateItem = (index: number, partial: Partial<DescriptionItemForm>) => {
      const copy = items.map((d) => ({ ...d }));
      copy[index] = { ...copy[index], ...partial };
      onChange(copy);
    };

    const removeItem = (index: number) => {
      onChange(items.filter((_, i) => i !== index));
    };

    const addItem = () => {
      onChange([...items, { TYPE: 'HTML', CONTENT: '' }]);
    };

    return (
      <div>
        {items.map((item, i) => (
          <div key={i} className={styles.ceCard}>
            <div className={styles.ceCardHeader}>
              <span className={styles.ceCardTitle}>Item #{i + 1}</span>
              <button
                type="button"
                className={`${styles.ceBtn} ${styles.ceBtnSmall} ${styles.ceBtnDanger}`}
                onClick={() => removeItem(i)}
              >
                Remove
              </button>
            </div>
            <div className={styles.ceCardGrid}>
              <div className={styles.ceFieldGroup}>
                <label className={styles.ceLabel}>Type</label>
                <select
                  className={styles.ceSelect}
                  value={item.TYPE}
                  onChange={(e) => updateItem(i, { TYPE: e.target.value })}
                >
                  <option value="TEXT">Text</option>
                  <option value="HTML">HTML</option>
                  <option value="IMAGE">Image</option>
                </select>
              </div>
            </div>
            <div className={styles.ceFieldGroup}>
              <label className={styles.ceLabel}>Content</label>
              {item.TYPE === 'HTML' ? (
                <textarea
                  className={styles.ceTextarea}
                  value={item.CONTENT}
                  onChange={(e) => updateItem(i, { CONTENT: e.target.value })}
                  placeholder="<p>Your description here</p>"
                />
              ) : (
                <input
                  type="text"
                  className={styles.ceInput}
                  value={item.CONTENT}
                  onChange={(e) => updateItem(i, { CONTENT: e.target.value })}
                  placeholder={item.TYPE === 'IMAGE' ? './assets/images/info.png' : 'Description text'}
                />
              )}
            </div>
          </div>
        ))}
        <button type="button" className={styles.ceArrayAddBtn} onClick={addItem}>
          + Add description item
        </button>
      </div>
    );
  };

  return (
    <AccordionSection
      id="section-description"
      title="Description"
      description="Content displayed in the Misc panel description area. Supports text, HTML, and image types with multilingual options."
      learnMoreHref="./guide-for-admins/customize-page#description"
    >
      <I18nWrapper
        basePath={['DESCRIPTION']}
        state={state.DESCRIPTION}
        renderItems={renderItems}
      />
    </AccordionSection>
  );
}
