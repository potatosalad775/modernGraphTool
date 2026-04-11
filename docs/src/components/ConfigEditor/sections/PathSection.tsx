import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import styles from '../ConfigEditor.module.css';

export default function PathSection() {
  const { state } = useConfigEditor();
  const { set } = useFieldSetter(['PATH']);

  return (
    <AccordionSection
      id="section-path"
      title="Path"
      description="File paths for measurement data and phone book. Changing PHONE_BOOK path may break squig.link compatibility."
      learnMoreHref="./guide-for-admins/customize-page#path"
    >
      <div className={styles.ceFieldGroup}>
        <label className={styles.ceLabel}>Phone Measurement Path</label>
        <input
          type="text"
          className={styles.ceInput}
          value={state.PATH.PHONE_MEASUREMENT}
          onChange={(e) => set('PHONE_MEASUREMENT', e.target.value)}
          placeholder="./data/phones"
        />
      </div>

      <div className={styles.ceFieldGroup}>
        <label className={styles.ceLabel}>Target Measurement Path</label>
        <input
          type="text"
          className={styles.ceInput}
          value={state.PATH.TARGET_MEASUREMENT}
          onChange={(e) => set('TARGET_MEASUREMENT', e.target.value)}
          placeholder="./data/target"
        />
      </div>

      <div className={styles.ceFieldGroup}>
        <label className={styles.ceLabel}>Phone Book Path</label>
        <input
          type="text"
          className={styles.ceInput}
          value={state.PATH.PHONE_BOOK}
          onChange={(e) => set('PHONE_BOOK', e.target.value)}
          placeholder="./data/phone_book.json"
        />
      </div>
    </AccordionSection>
  );
}
