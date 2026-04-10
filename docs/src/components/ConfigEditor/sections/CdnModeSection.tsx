import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import styles from '../ConfigEditor.module.css';

export default function CdnModeSection() {
  const { state, dispatch } = useConfigEditor();
  const { set } = useFieldSetter(['CDN_MODE']);

  return (
    <AccordionSection
      id="section-cdn-mode"
      title="CDN Mode"
      description="CDN deployment settings. Only used when deploying with cdn-index.html — leave disabled for standard dist/ deployments."
      learnMoreHref="./guide-for-admins/customize-page#cdn_mode"
      optional
      enabled={state.CDN_MODE_ENABLED}
      onToggleEnabled={(v) => dispatch({ type: 'SET_FIELD', path: ['CDN_MODE_ENABLED'], value: v })}
    >
      <div className={styles.ceFieldGroup}>
        <label className={styles.ceLabel}>Major Version</label>
        <input
          type="number"
          className={`${styles.ceInput} ${styles.ceInputSmall}`}
          value={state.CDN_MODE.MAJOR_VERSION}
          onChange={(e) => set('MAJOR_VERSION', Number(e.target.value))}
          min={1}
        />
      </div>

      <div className={styles.ceFieldGroup}>
        <label className={styles.ceLabel}>
          Custom Base URL
          <span className={styles.ceLabelHint}>optional, advanced</span>
        </label>
        <input
          type="text"
          className={styles.ceInput}
          value={state.CDN_MODE.BASE}
          onChange={(e) => set('BASE', e.target.value)}
          placeholder="https://cdn.jsdelivr.net/gh/..."
        />
      </div>
    </AccordionSection>
  );
}
