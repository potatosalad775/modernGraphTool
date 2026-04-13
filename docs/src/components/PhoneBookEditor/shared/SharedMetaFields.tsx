import React, { type ReactNode } from 'react';
import type { PhoneState } from '@site/src/utils/phoneBookConverter';
import ceStyles from '../../ConfigEditor/ConfigEditor.module.css';
import styles from '../PhoneBookEditor.module.css';

interface SharedMetaFieldsProps {
  phone: PhoneState;
  onPatch: (patch: Partial<PhoneState>) => void;
  /** Whether to render the block. Used to hide for 'simple' phones. */
  show?: boolean;
}

/**
 * Optional metadata shared across non-simple phone types:
 * reviewScore, reviewLink, shopLink, price, description.
 */
export default function SharedMetaFields({
  phone,
  onPatch,
  show = true,
}: SharedMetaFieldsProps): ReactNode {
  if (!show) return null;

  const set = (key: keyof PhoneState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    onPatch({ [key]: value || undefined } as Partial<PhoneState>);
  };

  return (
    <div className={styles.pbMetaGrid}>
      <div className={styles.pbMetaField}>
        <label>Review Score</label>
        <input
          type="text"
          className={ceStyles.ceInput}
          value={phone.reviewScore ?? ''}
          placeholder='e.g. "A+" or "4.5"'
          onChange={set('reviewScore')}
        />
      </div>
      <div className={styles.pbMetaField}>
        <label>Price</label>
        <input
          type="text"
          className={ceStyles.ceInput}
          value={phone.price ?? ''}
          placeholder='e.g. "$299"'
          onChange={set('price')}
        />
      </div>
      <div className={styles.pbMetaField}>
        <label>Review Link</label>
        <input
          type="url"
          className={ceStyles.ceInput}
          value={phone.reviewLink ?? ''}
          placeholder="https://..."
          onChange={set('reviewLink')}
        />
      </div>
      <div className={styles.pbMetaField}>
        <label>Shop Link</label>
        <input
          type="url"
          className={ceStyles.ceInput}
          value={phone.shopLink ?? ''}
          placeholder="https://..."
          onChange={set('shopLink')}
        />
      </div>
      <div className={styles.pbMetaField} style={{ gridColumn: '1 / -1' }}>
        <label>Description</label>
        <textarea
          className={ceStyles.ceTextarea}
          value={phone.description ?? ''}
          placeholder="Optional notes shown with the phone"
          onChange={set('description')}
          style={{ minHeight: 60 }}
        />
      </div>
    </div>
  );
}
