import React, { type ReactNode } from 'react';
import type { PhoneState } from '@site/src/utils/phoneBookConverter';
import RowsEditor from '../shared/RowsEditor';
import ceStyles from '../../ConfigEditor/ConfigEditor.module.css';

/**
 * Six phone-type-specific field editors.
 *
 * Each receives the current phone and a patch callback.
 * They only render their own kind-specific fields — shared metadata
 * (reviewLink, price, etc.) is rendered once by PhoneEditor.
 */

interface FieldsProps {
  phone: PhoneState;
  onPatch: (patch: Partial<PhoneState>) => void;
}

// ── Simple ──────────────────────────────────────────────────────────────────

export function SimplePhoneFields({ phone, onPatch }: FieldsProps): ReactNode {
  const value = phone.simple?.value ?? '';
  return (
    <div className={ceStyles.ceFieldGroup}>
      <label className={ceStyles.ceLabel}>
        Device Name
        <span className={ceStyles.ceLabelHint}>
          (the tool will load <code>{value || 'Name'} L.txt</code> and <code>{value || 'Name'} R.txt</code>)
        </span>
      </label>
      <input
        type="text"
        className={ceStyles.ceInput}
        value={value}
        onChange={(e) => onPatch({ simple: { value: e.target.value } })}
        placeholder="e.g. ModelX"
      />
    </div>
  );
}

// ── Detailed ────────────────────────────────────────────────────────────────

export function DetailedPhoneFields({ phone, onPatch }: FieldsProps): ReactNode {
  const d = phone.detailed ?? { name: '', file: '' };
  const patch = (next: Partial<typeof d>) => onPatch({ detailed: { ...d, ...next } });
  return (
    <>
      <div className={ceStyles.ceFieldGroup}>
        <label className={ceStyles.ceLabel}>Display Name</label>
        <input
          type="text"
          className={ceStyles.ceInput}
          value={d.name}
          placeholder="e.g. Model D1"
          onChange={(e) => patch({ name: e.target.value })}
        />
      </div>
      <div className={ceStyles.ceFieldGroup}>
        <label className={ceStyles.ceLabel}>
          File Base Name
          <span className={ceStyles.ceLabelHint}>(without L/R and .txt)</span>
        </label>
        <input
          type="text"
          className={ceStyles.ceInput}
          value={d.file}
          placeholder="e.g. ModelD1_Data"
          onChange={(e) => patch({ file: e.target.value })}
        />
      </div>
      <div className={ceStyles.ceFieldGroup}>
        <label className={ceStyles.ceLabel}>
          Suffix
          <span className={ceStyles.ceLabelHint}>(optional, appended to name)</span>
        </label>
        <input
          type="text"
          className={ceStyles.ceInput}
          value={d.suffix ?? ''}
          placeholder='e.g. "Rev.2" or "(Foam Tip)"'
          onChange={(e) => patch({ suffix: e.target.value || undefined })}
        />
      </div>
    </>
  );
}

// ── Variations (parallel file/suffix arrays) ───────────────────────────────

export function VariationsPhoneFields({ phone, onPatch }: FieldsProps): ReactNode {
  const v = phone.variations ?? { name: '', rows: [] };
  return (
    <>
      <div className={ceStyles.ceFieldGroup}>
        <label className={ceStyles.ceLabel}>Base Display Name</label>
        <input
          type="text"
          className={ceStyles.ceInput}
          value={v.name}
          placeholder="e.g. Model V1"
          onChange={(e) => onPatch({ variations: { ...v, name: e.target.value } })}
        />
      </div>
      <div className={ceStyles.ceFieldGroup}>
        <label className={ceStyles.ceLabel}>
          Variants
          <span className={ceStyles.ceLabelHint}>
            (each row becomes one entry in the selection list)
          </span>
        </label>
        <RowsEditor
          rows={v.rows}
          columns={[
            { key: 'file', label: 'File base name', placeholder: 'e.g. ModelV1_Foam' },
            { key: 'suffix', label: 'Suffix (shown in UI)', placeholder: '(Foam Tip)' },
          ]}
          onChange={(rows) => onPatch({ variations: { ...v, rows } })}
          createEmpty={() => ({ file: '', suffix: '' })}
          minRows={1}
          addLabel="+ Add variant"
        />
      </div>
    </>
  );
}

// ── Prefix variations (shared file prefix + distinct parts) ────────────────

export function PrefixVariationsPhoneFields({ phone, onPatch }: FieldsProps): ReactNode {
  const pr = phone.prefix ?? { name: '', prefix: '', files: [] };
  const update = (next: Partial<typeof pr>) => onPatch({ prefix: { ...pr, ...next } });
  return (
    <>
      <div className={ceStyles.ceFieldGroup}>
        <label className={ceStyles.ceLabel}>Base Display Name</label>
        <input
          type="text"
          className={ceStyles.ceInput}
          value={pr.name}
          placeholder="e.g. Model P1"
          onChange={(e) => update({ name: e.target.value })}
        />
      </div>
      <div className={ceStyles.ceFieldGroup}>
        <label className={ceStyles.ceLabel}>
          Common File Prefix
          <span className={ceStyles.ceLabelHint}>
            (the parser looks for <code>prefix + file[i] L.txt</code>)
          </span>
        </label>
        <input
          type="text"
          className={ceStyles.ceInput}
          value={pr.prefix}
          placeholder="e.g. BrandP ModelP1"
          onChange={(e) => update({ prefix: e.target.value })}
        />
      </div>
      <div className={ceStyles.ceFieldGroup}>
        <label className={ceStyles.ceLabel}>
          Distinguishing Parts
          <span className={ceStyles.ceLabelHint}>
            (used both as UI suffix and to build the filename)
          </span>
        </label>
        <RowsEditor
          rows={pr.files.map((f) => ({ file: f }))}
          columns={[{ key: 'file', label: 'Part (e.g. "(Foam Tip)")', placeholder: '(Foam Tip)' }]}
          onChange={(rows) => update({ files: rows.map((r) => r.file) })}
          createEmpty={() => ({ file: '' })}
          minRows={1}
          addLabel="+ Add part"
        />
      </div>
    </>
  );
}

// ── Multi-sample ───────────────────────────────────────────────────────────

export function MultiSamplePhoneFields({ phone, onPatch }: FieldsProps): ReactNode {
  const ms = phone.multiSample ?? { name: '', file: '', samples: 3 };
  const update = (next: Partial<typeof ms>) => onPatch({ multiSample: { ...ms, ...next } });
  return (
    <>
      <div className={ceStyles.ceFieldGroup}>
        <label className={ceStyles.ceLabel}>Display Name</label>
        <input
          type="text"
          className={ceStyles.ceInput}
          value={ms.name}
          placeholder="e.g. Multi Sample"
          onChange={(e) => update({ name: e.target.value })}
        />
      </div>
      <div className={ceStyles.ceFieldGroup}>
        <label className={ceStyles.ceLabel}>File Base Name</label>
        <input
          type="text"
          className={ceStyles.ceInput}
          value={ms.file}
          placeholder="e.g. Multi Sample"
          onChange={(e) => update({ file: e.target.value })}
        />
      </div>
      <div className={ceStyles.ceFieldGroup}>
        <label className={ceStyles.ceLabel}>
          Number of Samples
          <span className={ceStyles.ceLabelHint}>
            (loads <code>{ms.file || 'File'} L1.txt … L{ms.samples}.txt</code>)
          </span>
        </label>
        <input
          type="number"
          min={2}
          max={20}
          className={`${ceStyles.ceInput} ${ceStyles.ceInputSmall}`}
          value={ms.samples}
          onChange={(e) => update({ samples: Math.max(2, Number(e.target.value) || 2) })}
        />
      </div>
      <div className={ceStyles.ceFieldGroup}>
        <label className={ceStyles.ceLabel}>
          Suffix
          <span className={ceStyles.ceLabelHint}>(optional)</span>
        </label>
        <input
          type="text"
          className={ceStyles.ceInput}
          value={ms.suffix ?? ''}
          placeholder=""
          onChange={(e) => update({ suffix: e.target.value || undefined })}
        />
      </div>
    </>
  );
}

// ── HpTF ───────────────────────────────────────────────────────────────────

export function HpTFPhoneFields({ phone, onPatch }: FieldsProps): ReactNode {
  const h = phone.hptf ?? { name: '', rows: [], fillOnly: true };
  const update = (next: Partial<typeof h>) => onPatch({ hptf: { ...h, ...next } });
  return (
    <>
      <div className={ceStyles.ceFieldGroup}>
        <label className={ceStyles.ceLabel}>Display Name</label>
        <input
          type="text"
          className={ceStyles.ceInput}
          value={h.name}
          placeholder="e.g. HpTF Fill Only"
          onChange={(e) => update({ name: e.target.value })}
        />
      </div>
      <div className={ceStyles.ceFieldGroup}>
        <label className={ceStyles.ceLabel}>
          Variance Samples
          <span className={ceStyles.ceLabelHint}>
            (at least two related measurements — the shaded envelope spans their range)
          </span>
        </label>
        <RowsEditor
          rows={h.rows}
          columns={[
            { key: 'file', label: 'File base name', placeholder: 'HpTF Demo Center' },
            { key: 'label', label: 'UI label', placeholder: 'Center' },
          ]}
          onChange={(rows) => update({ rows })}
          createEmpty={() => ({ file: '', label: '' })}
          minRows={2}
          addLabel="+ Add sample"
        />
      </div>
      <div className={ceStyles.ceFieldGroup}>
        <label className={ceStyles.ceLabel}>
          Description
          <span className={ceStyles.ceLabelHint}>(shown beside the fill envelope)</span>
        </label>
        <input
          type="text"
          className={ceStyles.ceInput}
          value={h.description ?? ''}
          placeholder="(Variance)"
          onChange={(e) => update({ description: e.target.value || undefined })}
        />
      </div>
      <div className={ceStyles.ceToggleRow}>
        <input
          type="checkbox"
          className={ceStyles.ceCheckbox}
          id={`${phone.id}-fillOnly`}
          checked={h.fillOnly}
          onChange={(e) => update({ fillOnly: e.target.checked })}
        />
        <label className={ceStyles.ceToggleLabel} htmlFor={`${phone.id}-fillOnly`}>
          Fill only
          <span className={ceStyles.ceToggleHint}>
            (uncheck to let users toggle individual sample curves)
          </span>
        </label>
      </div>
    </>
  );
}
