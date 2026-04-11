import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import StringArrayEditor from '../shared/StringArrayEditor';
import styles from '../ConfigEditor.module.css';

const PANELS = ['phone', 'graph', 'equalizer', 'misc'];

export default function InitialSection() {
  const { state } = useConfigEditor();
  const { set } = useFieldSetter([]);

  return (
    <AccordionSection
      id="section-initial"
      title="Initial Settings"
      description="Phones, targets, and panel displayed on initial page load. These are overridden by URL parameters if present."
      learnMoreHref="./guide-for-admins/customize-page#initial_phones"
      defaultOpen
    >
      <div className={styles.ceFieldGroup}>
        <label className={styles.ceLabel}>Initial Phones</label>
        <StringArrayEditor
          items={state.INITIAL_PHONES}
          onChange={(items) => set('INITIAL_PHONES', items)}
          placeholder="Brand Model (Suffix)"
          addLabel="+ Add phone"
        />
      </div>

      <div className={styles.ceFieldGroup}>
        <label className={styles.ceLabel}>Initial Targets</label>
        <StringArrayEditor
          items={state.INITIAL_TARGETS}
          onChange={(items) => set('INITIAL_TARGETS', items)}
          placeholder="Target Name"
          addLabel="+ Add target"
        />
      </div>

      <div className={styles.ceFieldGroup}>
        <label className={styles.ceLabel}>Initial Panel</label>
        <select
          className={styles.ceSelect}
          value={state.INITIAL_PANEL}
          onChange={(e) => set('INITIAL_PANEL', e.target.value)}
        >
          {PANELS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>
    </AccordionSection>
  );
}
