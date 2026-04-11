import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import styles from '../ConfigEditor.module.css';

export default function MultiSampleSection() {
  const { state } = useConfigEditor();
  const { set } = useFieldSetter(['MULTI_SAMPLE']);

  return (
    <AccordionSection
      id="section-multi-sample"
      title="Multi-Sample"
      description="Controls how multi-sample measurements are displayed when a phone has multiple measurement samples."
      learnMoreHref="./guide-for-admins/customize-page#multi_sample"
    >
      <div className={styles.ceFieldGroup}>
        <label className={styles.ceLabel}>Default Display</label>
        <select
          className={styles.ceSelect}
          value={state.MULTI_SAMPLE.DEFAULT_DISPLAY}
          onChange={(e) => set('DEFAULT_DISPLAY', e.target.value)}
        >
          <option value="average">Average</option>
          <option value="all">All samples</option>
        </select>
      </div>
    </AccordionSection>
  );
}
