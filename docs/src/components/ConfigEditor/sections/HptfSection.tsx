import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import styles from '../ConfigEditor.module.css';

export default function HptfSection() {
  const { state } = useConfigEditor();
  const { set } = useFieldSetter(['HPTF']);

  return (
    <AccordionSection
      id="section-hptf"
      title="HpTF (Sample Deviation)"
      description="Controls the display of Headphone Transfer Function sample deviation data."
      learnMoreHref="./guide-for-admins/customize-page#hptf"
    >
      <div className={styles.ceFieldGroup}>
        <label className={styles.ceLabel}>Default Display</label>
        <select
          className={styles.ceSelect}
          value={state.HPTF.DEFAULT_DISPLAY}
          onChange={(e) => set('DEFAULT_DISPLAY', e.target.value)}
        >
          <option value="fill">Fill only</option>
          <option value="fill+curves">Fill + Curves</option>
          <option value="curves">Curves only</option>
          <option value="none">None</option>
        </select>
      </div>

      <div className={styles.ceFieldGroup}>
        <label className={styles.ceLabel}>
          Fill Opacity
          <span className={styles.ceLabelHint}>0 - 1</span>
        </label>
        <div className={styles.ceRangeRow}>
          <input
            type="range"
            className={styles.ceRange}
            min={0}
            max={1}
            step={0.05}
            value={state.HPTF.FILL_OPACITY}
            onChange={(e) => set('FILL_OPACITY', Number(e.target.value))}
          />
          <input
            type="number"
            className={styles.ceNumberInline}
            value={state.HPTF.FILL_OPACITY}
            onChange={(e) => set('FILL_OPACITY', Number(e.target.value))}
            min={0}
            max={1}
            step={0.05}
          />
        </div>
      </div>
    </AccordionSection>
  );
}
