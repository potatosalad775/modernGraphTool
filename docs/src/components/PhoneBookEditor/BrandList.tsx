import React, { type ReactNode } from 'react';
import { usePhoneBookEditor } from './PhoneBookEditorContext';
import { createEmptyBrand } from '@site/src/utils/phoneBookConverter';
import styles from './PhoneBookEditor.module.css';

interface BrandListProps {
  selectedBrandId: string | null;
  onSelect: (brandId: string) => void;
}

/**
 * Left-column brand picker. One-at-a-time selection; only the selected
 * brand's workspace is rendered on the right, which scales to 100+ brands.
 */
export default function BrandList({ selectedBrandId, onSelect }: BrandListProps): ReactNode {
  const { state, dispatch } = usePhoneBookEditor();

  const handleAdd = () => {
    const brand = createEmptyBrand();
    dispatch({ type: 'ADD_BRAND', brand });
    onSelect(brand.id);
  };

  const handleSort = () => dispatch({ type: 'SORT_BRANDS_ALPHA' });

  return (
    <aside className={styles.pbPicker}>
      <div className={styles.pbPickerHeader}>
        <span className={styles.pbPickerTitle}>
          Brands <span className={styles.pbPickerCount}>({state.length})</span>
        </span>
        <button
          type="button"
          className={styles.pbIconBtn}
          onClick={handleSort}
          title="Sort brands A → Z"
          disabled={state.length < 2}
        >
          A↓
        </button>
      </div>

      {state.length === 0 ? (
        <div className={styles.pbEmptyPicker}>
          No brands yet.
        </div>
      ) : (
        <ul className={styles.pbPickerList}>
          {state.map((brand, i) => {
            const isSelected = brand.id === selectedBrandId;
            const label = [brand.name || '(unnamed)', brand.suffix].filter(Boolean).join(' ');
            return (
              <li key={brand.id}>
                <button
                  type="button"
                  className={`${styles.pbBrandButton} ${isSelected ? styles.pbBrandButtonSelected : ''}`}
                  onClick={() => onSelect(brand.id)}
                >
                  <span className={styles.pbBrandButtonLabel}>{label}</span>
                  <span className={styles.pbBrandButtonCount}>{brand.phones.length}</span>
                  <span
                    className={styles.pbBrandButtonActions}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className={styles.pbIconBtnMini}
                      onClick={() =>
                        dispatch({ type: 'MOVE_BRAND', brandId: brand.id, direction: 'up' })
                      }
                      disabled={i === 0}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={styles.pbIconBtnMini}
                      onClick={() =>
                        dispatch({ type: 'MOVE_BRAND', brandId: brand.id, direction: 'down' })
                      }
                      disabled={i === state.length - 1}
                      title="Move down"
                    >
                      ↓
                    </button>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button type="button" className={styles.pbBrandAddBtn} onClick={handleAdd}>
        + Add brand
      </button>
    </aside>
  );
}
