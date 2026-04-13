import React, { type ReactNode } from 'react';
import type { PhoneKind, PhoneState } from '@site/src/utils/phoneBookConverter';
import { usePhoneBookEditor } from './PhoneBookEditorContext';
import SharedMetaFields from './shared/SharedMetaFields';
import {
  DetailedPhoneFields,
  HpTFPhoneFields,
  MultiSamplePhoneFields,
  PrefixVariationsPhoneFields,
  SimplePhoneFields,
  VariationsPhoneFields,
} from './types/PhoneTypeFields';
import ceStyles from '../ConfigEditor/ConfigEditor.module.css';
import styles from './PhoneBookEditor.module.css';

interface PhoneEditorProps {
  brandId: string;
  phone: PhoneState;
  index: number;
  count: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const DOCS_BASE = './guide-for-admins/manage-data';

interface KindOption {
  value: PhoneKind;
  label: string;
  description: string;
  docAnchor: string;
}

const KIND_OPTIONS: KindOption[] = [
  {
    value: 'simple',
    label: 'Simple',
    description:
      'Just the device name — the tool auto-loads "{name} L.txt" and "{name} R.txt". Easiest option when the filename matches the display name.',
    docAnchor: '#simple-string-definition',
  },
  {
    value: 'detailed',
    label: 'Detailed',
    description:
      'Separate display name, file base name, and optional suffix. Use this when the filename differs from the display name, or when you want to add review/shop links.',
    docAnchor: '#detailed-phone-object-definition',
  },
  {
    value: 'variations',
    label: 'Variations (file / suffix arrays)',
    description:
      'Group several measurements under one model — e.g. different eartips or pad swaps. Each variant has its own file and visible suffix.',
    docAnchor: '#variations-grouping-multiple-data-files-under-one-phone-name',
  },
  {
    value: 'prefix',
    label: 'Variations (common prefix)',
    description:
      'Like Variations, but the distinguishing part of the filename is also the UI suffix. Handy when all files share a long common prefix.',
    docAnchor: '#variations-grouping-multiple-data-files-under-one-phone-name',
  },
  {
    value: 'multiSample',
    label: 'Multi-Sample',
    description:
      'Combine several numbered measurement runs (L1/R1, L2/R2, …) into one phone. The UI averages them by default and lets users toggle individual runs.',
    docAnchor: '#multi-sample-entries',
  },
  {
    value: 'hptf',
    label: 'HpTF (Variance)',
    description:
      'Render the spread between several related measurements as a shaded envelope on the graph — e.g. different fit positions, measurement rigs, or insertion depths. The entry IS the envelope — no separate measurement curve.',
    docAnchor: '#hptf-headphone-transfer-function-entries',
  },
];

function summarize(phone: PhoneState): string {
  switch (phone.kind) {
    case 'simple':       return phone.simple?.value || '(unnamed)';
    case 'detailed':     return phone.detailed?.name || '(unnamed)';
    case 'variations':   return phone.variations?.name
      ? `${phone.variations.name} — ${phone.variations.rows.length} variants`
      : '(unnamed)';
    case 'prefix':       return phone.prefix?.name
      ? `${phone.prefix.name} — ${phone.prefix.files.length} variants`
      : '(unnamed)';
    case 'multiSample':  return phone.multiSample?.name
      ? `${phone.multiSample.name} (${phone.multiSample.samples} samples)`
      : '(unnamed)';
    case 'hptf':         return phone.hptfs?.name
      ? `${phone.hptfs.name} — HpTF (${phone.hptfs.entries.length} set${phone.hptfs.entries.length === 1 ? '' : 's'})`
      : '(unnamed)';
  }
}

function renderKindFields(phone: PhoneState, onPatch: (patch: Partial<PhoneState>) => void): ReactNode {
  switch (phone.kind) {
    case 'simple':       return <SimplePhoneFields phone={phone} onPatch={onPatch} />;
    case 'detailed':     return <DetailedPhoneFields phone={phone} onPatch={onPatch} />;
    case 'variations':   return <VariationsPhoneFields phone={phone} onPatch={onPatch} />;
    case 'prefix':       return <PrefixVariationsPhoneFields phone={phone} onPatch={onPatch} />;
    case 'multiSample':  return <MultiSamplePhoneFields phone={phone} onPatch={onPatch} />;
    case 'hptf':         return <HpTFPhoneFields phone={phone} onPatch={onPatch} />;
  }
}

export default function PhoneEditor({
  brandId,
  phone,
  index,
  count,
  isExpanded,
  onToggleExpand,
}: PhoneEditorProps): ReactNode {
  const { dispatch } = usePhoneBookEditor();
  const kindOption = KIND_OPTIONS.find((o) => o.value === phone.kind)!;

  const patch = (patch: Partial<PhoneState>) =>
    dispatch({ type: 'UPDATE_PHONE', brandId, phoneId: phone.id, patch });

  const changeKind = (kind: PhoneKind) =>
    dispatch({ type: 'SWITCH_PHONE_KIND', brandId, phoneId: phone.id, kind });

  const move = (direction: 'up' | 'down') =>
    dispatch({ type: 'MOVE_PHONE', brandId, phoneId: phone.id, direction });

  const remove = () => dispatch({ type: 'REMOVE_PHONE', brandId, phoneId: phone.id });

  const passthroughKeys = phone.passthrough ? Object.keys(phone.passthrough) : [];

  return (
    <div className={styles.pbPhoneCard}>
      <div
        className={`${styles.pbPhoneHeader} ${styles.pbPhoneHeaderClickable}`}
        onClick={onToggleExpand}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpand();
          }
        }}
      >
        <span
          className={`${styles.pbBrandChevron} ${isExpanded ? styles.pbBrandChevronOpen : ''}`}
        >
          &#9654;
        </span>
        <span className={styles.pbPhoneKindBadge}>{kindOption.label}</span>
        <span className={styles.pbPhoneSummary}>{summarize(phone)}</span>
        <div className={styles.pbBrandActions} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={styles.pbIconBtn}
            onClick={() => move('up')}
            disabled={index === 0}
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            className={styles.pbIconBtn}
            onClick={() => move('down')}
            disabled={index === count - 1}
            title="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            className={`${styles.pbIconBtn} ${styles.pbIconBtnDanger}`}
            onClick={remove}
            title="Remove phone"
          >
            ×
          </button>
        </div>
      </div>

      {isExpanded && (
      <div className={styles.pbPhoneBody}>
        <div className={styles.pbKindSelectRow}>
          <div className={styles.pbKindSelectLabelRow}>
            <label htmlFor={`${phone.id}-kind`}>Type</label>
            <select
              id={`${phone.id}-kind`}
              className={ceStyles.ceSelect}
              value={phone.kind}
              onChange={(e) => changeKind(e.target.value as PhoneKind)}
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.pbKindDescription}>
            {kindOption.description}{' '}
            <a
              href={DOCS_BASE + kindOption.docAnchor}
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn more
            </a>
          </div>
        </div>

        {renderKindFields(phone, patch)}

        <SharedMetaFields phone={phone} onPatch={patch} show={phone.kind !== 'simple'} />

        {passthroughKeys.length > 0 && (
          <div className={styles.pbPassthroughWarning}>
            Preserved unknown keys from import: {passthroughKeys.join(', ')}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
