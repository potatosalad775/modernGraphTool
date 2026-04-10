import React from 'react';
import { useConfigEditor, useFieldSetter } from '../ConfigEditorContext';
import AccordionSection from '../shared/AccordionSection';
import StringArrayEditor from '../shared/StringArrayEditor';
import type { WatermarkFormState } from '@site/src/utils/configDefaults';
import styles from '../ConfigEditor.module.css';

const LOCATIONS = ['BOTTOM_LEFT', 'BOTTOM_RIGHT', 'TOP_LEFT', 'TOP_RIGHT'];

function WatermarkItemEditor({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: WatermarkFormState;
  index: number;
  onChange: (item: WatermarkFormState) => void;
  onRemove: () => void;
}) {
  const update = (partial: Partial<WatermarkFormState>) => {
    onChange({ ...item, ...partial });
  };

  const updatePosition = (key: string, val: string) => {
    onChange({
      ...item,
      POSITION: { ...(item.POSITION ?? { UP: '0', DOWN: '0', LEFT: '0', RIGHT: '0' }), [key]: val },
    });
  };

  return (
    <div className={styles.ceCard}>
      <div className={styles.ceCardHeader}>
        <span className={styles.ceCardTitle}>
          Watermark #{index + 1} ({item.TYPE})
        </span>
        <button type="button" className={`${styles.ceBtn} ${styles.ceBtnSmall} ${styles.ceBtnDanger}`} onClick={onRemove}>
          Remove
        </button>
      </div>

      <div className={styles.ceCardGrid}>
        <div className={styles.ceFieldGroup}>
          <label className={styles.ceLabel}>Type</label>
          <select
            className={styles.ceSelect}
            value={item.TYPE}
            onChange={(e) => update({ TYPE: e.target.value })}
          >
            <option value="TEXT">Text</option>
            <option value="IMAGE">Image</option>
          </select>
        </div>

        <div className={styles.ceFieldGroup}>
          <label className={styles.ceLabel}>Location</label>
          <select
            className={styles.ceSelect}
            value={item.LOCATION}
            onChange={(e) => update({ LOCATION: e.target.value })}
          >
            {LOCATIONS.map((loc) => (
              <option key={loc} value={loc}>{loc.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        <div className={styles.ceFieldGroup}>
          <label className={styles.ceLabel}>Size</label>
          <input
            type="text"
            className={`${styles.ceInput} ${styles.ceInputSmall}`}
            value={item.SIZE}
            onChange={(e) => update({ SIZE: e.target.value })}
            placeholder="14px"
          />
        </div>

        {item.OPACITY !== undefined && (
          <div className={styles.ceFieldGroup}>
            <label className={styles.ceLabel}>Opacity</label>
            <input
              type="text"
              className={`${styles.ceInput} ${styles.ceInputSmall}`}
              value={item.OPACITY ?? ''}
              onChange={(e) => update({ OPACITY: e.target.value })}
              placeholder="0.4"
            />
          </div>
        )}
      </div>

      {item.TYPE === 'TEXT' ? (
        <>
          <div className={styles.ceFieldGroup}>
            <label className={styles.ceLabel}>Content</label>
            <input
              type="text"
              className={styles.ceInput}
              value={typeof item.CONTENT === 'string' ? item.CONTENT : ''}
              onChange={(e) => update({ CONTENT: e.target.value })}
              placeholder="Watermark text"
            />
          </div>
          <div className={styles.ceCardGrid}>
            <div className={styles.ceFieldGroup}>
              <label className={styles.ceLabel}>Font Family</label>
              <input
                type="text"
                className={`${styles.ceInput} ${styles.ceInputSmall}`}
                value={item.FONT_FAMILY ?? ''}
                onChange={(e) => update({ FONT_FAMILY: e.target.value })}
                placeholder="sans-serif"
              />
            </div>
            <div className={styles.ceFieldGroup}>
              <label className={styles.ceLabel}>Font Weight</label>
              <input
                type="text"
                className={`${styles.ceInput} ${styles.ceInputSmall}`}
                value={item.FONT_WEIGHT ?? ''}
                onChange={(e) => update({ FONT_WEIGHT: e.target.value })}
                placeholder="600"
              />
            </div>
            <div className={styles.ceFieldGroup}>
              <label className={styles.ceLabel}>Color</label>
              <input
                type="text"
                className={`${styles.ceInput} ${styles.ceInputSmall}`}
                value={item.COLOR ?? ''}
                onChange={(e) => update({ COLOR: e.target.value })}
                placeholder="#000000"
              />
            </div>
            <div className={styles.ceFieldGroup}>
              <label className={styles.ceLabel}>Opacity</label>
              <input
                type="text"
                className={`${styles.ceInput} ${styles.ceInputSmall}`}
                value={item.OPACITY ?? ''}
                onChange={(e) => update({ OPACITY: e.target.value })}
                placeholder="0.4"
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className={styles.ceFieldGroup}>
            <label className={styles.ceLabel}>Image Paths</label>
            <StringArrayEditor
              items={Array.isArray(item.CONTENT) ? item.CONTENT : item.CONTENT ? [item.CONTENT] : []}
              onChange={(items) => update({ CONTENT: items })}
              placeholder="./assets/images/icon.png"
              addLabel="+ Add image"
            />
          </div>
          <div className={styles.ceFieldGroup}>
            <label className={styles.ceLabel}>Position Offsets</label>
            <div className={styles.ceCardGrid}>
              {(['UP', 'DOWN', 'LEFT', 'RIGHT'] as const).map((dir) => (
                <div key={dir} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <span style={{ fontSize: '0.75rem', minWidth: '40px' }}>{dir}</span>
                  <input
                    type="text"
                    className={`${styles.ceInput} ${styles.ceInputSmall}`}
                    value={item.POSITION?.[dir] ?? '0'}
                    onChange={(e) => updatePosition(dir, e.target.value)}
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function WatermarkSection() {
  const { state } = useConfigEditor();
  const { set } = useFieldSetter([]);

  const watermarks = state.WATERMARK;

  const updateItem = (index: number, item: WatermarkFormState) => {
    const copy = [...watermarks];
    copy[index] = item;
    set('WATERMARK', copy);
  };

  const removeItem = (index: number) => {
    set('WATERMARK', watermarks.filter((_, i) => i !== index));
  };

  const addItem = () => {
    set('WATERMARK', [
      ...watermarks,
      { TYPE: 'TEXT', CONTENT: '', LOCATION: 'BOTTOM_RIGHT', SIZE: '14px', FONT_FAMILY: 'sans-serif', FONT_WEIGHT: '600' } as WatermarkFormState,
    ]);
  };

  return (
    <AccordionSection
      id="section-watermark"
      title="Watermark"
      description="Graph watermarks (text or images). Multiple watermarks can be displayed simultaneously."
      learnMoreHref="./guide-for-admins/customize-page#watermark"
    >
      {watermarks.map((item, i) => (
        <WatermarkItemEditor
          key={i}
          item={item}
          index={i}
          onChange={(updated) => updateItem(i, updated)}
          onRemove={() => removeItem(i)}
        />
      ))}
      <button type="button" className={styles.ceArrayAddBtn} onClick={addItem}>
        + Add watermark
      </button>
    </AccordionSection>
  );
}
