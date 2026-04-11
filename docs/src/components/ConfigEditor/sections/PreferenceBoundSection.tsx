import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import styles from '../ConfigEditor.module.css';

export default function PreferenceBoundSection() {
  const { state, dispatch } = useConfigEditor();
  const { set } = useFieldSetter(['PREFERENCE_BOUND']);

  return (
    <AccordionSection
      id="section-preference-bound"
      title="Preference Bound"
      description="Draws a shaded upper/lower preference bound area on the graph. Requires Bounds U.txt / Bounds D.txt in the data/ folder."
      learnMoreHref="./guide-for-admins/customize-page#preference_bound"
      optional
      enabled={state.PREFERENCE_BOUND_ENABLED}
      onToggleEnabled={(v) => dispatch({ type: 'SET_FIELD', path: ['PREFERENCE_BOUND_ENABLED'], value: v })}
    >
      <div className={styles.ceToggleRow}>
        <input
          type="checkbox"
          className={styles.ceCheckbox}
          checked={state.PREFERENCE_BOUND.ENABLE_BOUND_ON_INITIAL_LOAD}
          onChange={(e) => set('ENABLE_BOUND_ON_INITIAL_LOAD', e.target.checked)}
          id="pb-initial"
        />
        <label htmlFor="pb-initial" className={styles.ceToggleLabel}>
          Show bounds on initial load
        </label>
      </div>

      <div className={styles.ceFieldGroup}>
        <label className={styles.ceLabel}>Base DF Target File</label>
        <input
          type="text"
          className={styles.ceInput}
          value={state.PREFERENCE_BOUND.BASE_DF_TARGET_FILE}
          onChange={(e) => set('BASE_DF_TARGET_FILE', e.target.value)}
          placeholder="KEMAR DF (KB006x) Target"
        />
      </div>

      <div className={styles.ceCardGrid}>
        <div className={styles.ceFieldGroup}>
          <label className={styles.ceLabel}>Fill Color</label>
          <input
            type="text"
            className={styles.ceInput}
            value={state.PREFERENCE_BOUND.COLOR_FILL}
            onChange={(e) => set('COLOR_FILL', e.target.value)}
            placeholder="rgba(180,180,180,0.2)"
          />
        </div>

        <div className={styles.ceFieldGroup}>
          <label className={styles.ceLabel}>Border Color</label>
          <input
            type="text"
            className={styles.ceInput}
            value={state.PREFERENCE_BOUND.COLOR_BORDER}
            onChange={(e) => set('COLOR_BORDER', e.target.value)}
            placeholder="rgba(120,120,120,0.5)"
          />
        </div>
      </div>
    </AccordionSection>
  );
}
