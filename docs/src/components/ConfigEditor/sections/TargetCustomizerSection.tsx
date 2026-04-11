import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import StringArrayEditor from '../shared/StringArrayEditor';
import type { FilterForm, FilterPresetForm, InitialTargetFilterForm } from '@site/src/utils/configDefaults';
import styles from '../ConfigEditor.module.css';

const FILTER_TYPES = ['TILT', 'LSQ', 'HSQ', 'PK'];

export default function TargetCustomizerSection() {
  const { state, dispatch } = useConfigEditor();
  const { set } = useFieldSetter(['TARGET_CUSTOMIZER']);

  const filters = state.TARGET_CUSTOMIZER.FILTERS;
  const presets = state.TARGET_CUSTOMIZER.FILTER_PRESET;
  const initialFilters = state.TARGET_CUSTOMIZER.INITIAL_TARGET_FILTERS;

  // ── Filter helpers ──────────────────────────────────────────────────────

  const updateFilter = (index: number, partial: Partial<FilterForm>) => {
    const copy = filters.map((f) => ({ ...f }));
    copy[index] = { ...copy[index], ...partial };
    set('FILTERS', copy);
  };

  const removeFilter = (index: number) => {
    set('FILTERS', filters.filter((_, i) => i !== index));
  };

  const addFilter = () => {
    set('FILTERS', [...filters, { id: '', name: '', type: 'PK', freq: 0, q: 0 }]);
  };

  // ── Preset helpers ──────────────────────────────────────────────────────

  const updatePreset = (index: number, partial: Partial<FilterPresetForm>) => {
    const copy = presets.map((p) => ({ ...p, filter: { ...p.filter } }));
    copy[index] = { ...copy[index], ...partial };
    set('FILTER_PRESET', copy);
  };

  const updatePresetFilter = (presetIndex: number, filterId: string, value: string) => {
    const copy = presets.map((p) => ({ ...p, filter: { ...p.filter } }));
    if (value === '' || value === undefined) {
      delete copy[presetIndex].filter[filterId];
    } else {
      copy[presetIndex].filter[filterId] = Number(value);
    }
    set('FILTER_PRESET', copy);
  };

  const removePreset = (index: number) => {
    set('FILTER_PRESET', presets.filter((_, i) => i !== index));
  };

  const addPreset = () => {
    set('FILTER_PRESET', [...presets, { name: '', filter: {} }]);
  };

  // ── Initial filter helpers ──────────────────────────────────────────────

  const updateInitialFilter = (index: number, partial: Partial<InitialTargetFilterForm>) => {
    const copy = initialFilters.map((f) => ({ ...f, filter: { ...f.filter } }));
    copy[index] = { ...copy[index], ...partial };
    set('INITIAL_TARGET_FILTERS', copy);
  };

  const updateInitialFilterValue = (entryIndex: number, filterId: string, value: string) => {
    const copy = initialFilters.map((f) => ({ ...f, filter: { ...f.filter } }));
    if (value === '' || value === undefined) {
      delete copy[entryIndex].filter[filterId];
    } else {
      copy[entryIndex].filter[filterId] = Number(value);
    }
    set('INITIAL_TARGET_FILTERS', copy);
  };

  const removeInitialFilter = (index: number) => {
    set('INITIAL_TARGET_FILTERS', initialFilters.filter((_, i) => i !== index));
  };

  const addInitialFilter = () => {
    set('INITIAL_TARGET_FILTERS', [...initialFilters, { name: '', filter: {} }]);
  };

  // ── Filter gain editor (shared by preset and initial) ──────────────────

  const FilterGainEditor = ({
    filterObj,
    onUpdate,
  }: {
    filterObj: Record<string, number>;
    onUpdate: (filterId: string, value: string) => void;
  }) => (
    <div className={styles.ceCardGrid}>
      {filters.map((f) => (
        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span style={{ fontSize: '0.75rem', minWidth: '40px' }}>{f.name || f.id}</span>
          <input
            type="number"
            className={`${styles.ceInput} ${styles.ceInputSmall}`}
            value={filterObj[f.id] ?? ''}
            onChange={(e) => onUpdate(f.id, e.target.value)}
            placeholder="0"
            step={f.type === 'TILT' ? 0.1 : 0.5}
            style={{ width: '80px' }}
          />
        </div>
      ))}
    </div>
  );

  return (
    <AccordionSection
      id="section-target-customizer"
      title="Target Customizer"
      description="Per-target filter adjustments for specified target curves. Define available filters, presets, and initial filter values."
      learnMoreHref="./guide-for-admins/customize-page#target_customizer"
      optional
      enabled={state.TARGET_CUSTOMIZER_ENABLED}
      onToggleEnabled={(v) => dispatch({ type: 'SET_FIELD', path: ['TARGET_CUSTOMIZER_ENABLED'], value: v })}
    >
      {/* Customizable Targets */}
      <div className={styles.ceFieldGroup}>
        <label className={styles.ceLabel}>Customizable Targets</label>
        <StringArrayEditor
          items={state.TARGET_CUSTOMIZER.CUSTOMIZABLE_TARGETS}
          onChange={(items) => set('CUSTOMIZABLE_TARGETS', items)}
          placeholder="Target file name"
          addLabel="+ Add target"
        />
      </div>

      {/* Filters */}
      <div className={styles.ceSubSection}>
        <div className={styles.ceSubSectionTitle}>Filters</div>
        {filters.map((f, i) => (
          <div key={i} className={styles.ceCard}>
            <div className={styles.ceCardHeader}>
              <span className={styles.ceCardTitle}>{f.name || `Filter #${i + 1}`}</span>
              <button
                type="button"
                className={`${styles.ceBtn} ${styles.ceBtnSmall} ${styles.ceBtnDanger}`}
                onClick={() => removeFilter(i)}
              >
                Remove
              </button>
            </div>
            <div className={styles.ceCardGrid}>
              <div className={styles.ceFieldGroup}>
                <label className={styles.ceLabel}>ID</label>
                <input
                  type="text"
                  className={`${styles.ceInput} ${styles.ceInputSmall}`}
                  value={f.id}
                  onChange={(e) => updateFilter(i, { id: e.target.value })}
                  placeholder="tilt"
                />
              </div>
              <div className={styles.ceFieldGroup}>
                <label className={styles.ceLabel}>Name</label>
                <input
                  type="text"
                  className={`${styles.ceInput} ${styles.ceInputSmall}`}
                  value={f.name}
                  onChange={(e) => updateFilter(i, { name: e.target.value })}
                  placeholder="Tilt"
                />
              </div>
              <div className={styles.ceFieldGroup}>
                <label className={styles.ceLabel}>Type</label>
                <select
                  className={styles.ceSelect}
                  value={f.type}
                  onChange={(e) => updateFilter(i, { type: e.target.value })}
                >
                  {FILTER_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className={styles.ceFieldGroup}>
                <label className={styles.ceLabel}>Freq (Hz)</label>
                <input
                  type="number"
                  className={`${styles.ceInput} ${styles.ceInputSmall}`}
                  value={f.freq}
                  onChange={(e) => updateFilter(i, { freq: Number(e.target.value) })}
                  min={0}
                />
              </div>
              <div className={styles.ceFieldGroup}>
                <label className={styles.ceLabel}>Q</label>
                <input
                  type="number"
                  className={`${styles.ceInput} ${styles.ceInputSmall}`}
                  value={f.q}
                  onChange={(e) => updateFilter(i, { q: Number(e.target.value) })}
                  min={0}
                  step={0.001}
                />
              </div>
            </div>
          </div>
        ))}
        <button type="button" className={styles.ceArrayAddBtn} onClick={addFilter}>
          + Add filter
        </button>
      </div>

      {/* Filter Presets */}
      <div className={styles.ceSubSection}>
        <div className={styles.ceSubSectionTitle}>Filter Presets</div>
        {presets.map((p, i) => (
          <div key={i} className={styles.ceCard}>
            <div className={styles.ceCardHeader}>
              <span className={styles.ceCardTitle}>{p.name || `Preset #${i + 1}`}</span>
              <button
                type="button"
                className={`${styles.ceBtn} ${styles.ceBtnSmall} ${styles.ceBtnDanger}`}
                onClick={() => removePreset(i)}
              >
                Remove
              </button>
            </div>
            <div className={styles.ceFieldGroup}>
              <label className={styles.ceLabel}>Name</label>
              <input
                type="text"
                className={styles.ceInput}
                value={p.name}
                onChange={(e) => updatePreset(i, { name: e.target.value })}
                placeholder="Harman 2018"
              />
            </div>
            <div className={styles.ceFieldGroup}>
              <label className={styles.ceLabel}>Gain Values</label>
              <FilterGainEditor
                filterObj={p.filter}
                onUpdate={(id, val) => updatePresetFilter(i, id, val)}
              />
            </div>
          </div>
        ))}
        <button type="button" className={styles.ceArrayAddBtn} onClick={addPreset}>
          + Add preset
        </button>
      </div>

      {/* Initial Target Filters */}
      <div className={styles.ceSubSection}>
        <div className={styles.ceSubSectionTitle}>Initial Target Filters</div>
        {initialFilters.map((entry, i) => (
          <div key={i} className={styles.ceCard}>
            <div className={styles.ceCardHeader}>
              <span className={styles.ceCardTitle}>{entry.name || `Entry #${i + 1}`}</span>
              <button
                type="button"
                className={`${styles.ceBtn} ${styles.ceBtnSmall} ${styles.ceBtnDanger}`}
                onClick={() => removeInitialFilter(i)}
              >
                Remove
              </button>
            </div>
            <div className={styles.ceFieldGroup}>
              <label className={styles.ceLabel}>Target Name</label>
              <input
                type="text"
                className={styles.ceInput}
                value={entry.name}
                onChange={(e) => updateInitialFilter(i, { name: e.target.value })}
                placeholder="KEMAR DF (KB006x)"
              />
            </div>
            <div className={styles.ceFieldGroup}>
              <label className={styles.ceLabel}>Filter Values</label>
              <FilterGainEditor
                filterObj={entry.filter}
                onUpdate={(id, val) => updateInitialFilterValue(i, id, val)}
              />
            </div>
          </div>
        ))}
        <button type="button" className={styles.ceArrayAddBtn} onClick={addInitialFilter}>
          + Add initial filter
        </button>
      </div>
    </AccordionSection>
  );
}
