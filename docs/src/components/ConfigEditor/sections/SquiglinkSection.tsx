import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import StringArrayEditor from '../shared/StringArrayEditor';
import styles from '../ConfigEditor.module.css';

export default function SquiglinkSection() {
  const { state, dispatch } = useConfigEditor();
  const { set } = useFieldSetter(['SQUIGLINK']);

  return (
    <AccordionSection
      id="section-squiglink"
      title="squig.link Integration"
      description="squig.link network integration. These features are only active on *.squig.link domains."
      learnMoreHref="./guide-for-admins/customize-page#squiglink"
      optional
      enabled={state.SQUIGLINK_ENABLED}
      onToggleEnabled={(v) => dispatch({ type: 'SET_FIELD', path: ['SQUIGLINK_ENABLED'], value: v })}
    >
      <div className={styles.ceToggleRow}>
        <input
          type="checkbox"
          className={styles.ceCheckbox}
          checked={state.SQUIGLINK.ENABLED}
          onChange={(e) => set('ENABLED', e.target.checked)}
          id="sq-enabled"
        />
        <label htmlFor="sq-enabled" className={styles.ceToggleLabel}>
          Enabled
        </label>
      </div>

      <div className={styles.ceFieldGroup}>
        <label className={styles.ceLabel}>Analytics Measurement IDs</label>
        <StringArrayEditor
          items={state.SQUIGLINK.ANALYTICS_MEASUREMENT_IDS}
          onChange={(items) => set('ANALYTICS_MEASUREMENT_IDS', items)}
          placeholder="G-XXXXXXXXXX"
          addLabel="+ Add ID"
        />
      </div>

      <div className={styles.ceFieldGroup}>
        <label className={styles.ceLabel}>Analytics Site</label>
        <input
          type="text"
          className={styles.ceInput}
          value={state.SQUIGLINK.ANALYTICS_SITE}
          onChange={(e) => set('ANALYTICS_SITE', e.target.value)}
          placeholder="Site name for analytics attribution"
        />
      </div>

      <div className={styles.ceToggleRow}>
        <input
          type="checkbox"
          className={styles.ceCheckbox}
          checked={state.SQUIGLINK.LOG_ANALYTICS}
          onChange={(e) => set('LOG_ANALYTICS', e.target.checked)}
          id="sq-log"
        />
        <label htmlFor="sq-log" className={styles.ceToggleLabel}>Log analytics events</label>
      </div>

      <div className={styles.ceToggleRow}>
        <input
          type="checkbox"
          className={styles.ceCheckbox}
          checked={state.SQUIGLINK.ENABLE_ANALYTICS}
          onChange={(e) => set('ENABLE_ANALYTICS', e.target.checked)}
          id="sq-analytics"
        />
        <label htmlFor="sq-analytics" className={styles.ceToggleLabel}>Enable analytics</label>
      </div>

      <div className={styles.ceToggleRow}>
        <input
          type="checkbox"
          className={styles.ceCheckbox}
          checked={state.SQUIGLINK.ENABLE_CROSS_SITE_SEARCH}
          onChange={(e) => set('ENABLE_CROSS_SITE_SEARCH', e.target.checked)}
          id="sq-search"
        />
        <label htmlFor="sq-search" className={styles.ceToggleLabel}>Enable cross-site search</label>
      </div>

      <div className={styles.ceToggleRow}>
        <input
          type="checkbox"
          className={styles.ceCheckbox}
          checked={state.SQUIGLINK.ENABLE_SPONSOR}
          onChange={(e) => set('ENABLE_SPONSOR', e.target.checked)}
          id="sq-sponsor"
        />
        <label htmlFor="sq-sponsor" className={styles.ceToggleLabel}>Enable sponsor features</label>
      </div>
    </AccordionSection>
  );
}
