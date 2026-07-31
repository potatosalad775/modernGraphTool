import React, { type ReactNode } from 'react';
import type {
	PhoneState,
	SampleDisplayMode,
	VariantEntry
} from '@site/src/utils/phoneBookConverter';
import { emptyVariant } from '@site/src/utils/phoneBookConverter';
import RowsEditor from '../shared/RowsEditor';
import ceStyles from '../../ConfigEditor/ConfigEditor.module.css';
import pbStyles from '../PhoneBookEditor.module.css';

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
					(the tool will load <code>{value || 'Name'} L.txt</code> and{' '}
					<code>{value || 'Name'} R.txt</code>)
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
						{ key: 'suffix', label: 'Suffix (shown in UI)', placeholder: '(Foam Tip)' }
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

// ── Sample sets ────────────────────────────────────────────────────────────
//
// One editor for what used to be two phone types. A variant is a plain L/R pair
// until it declares runs, and how it is drawn (`display`) is independent of how
// its files are named (`count` vs. explicit rows).

const DISPLAY_MODES: Array<{ value: SampleDisplayMode; label: string; hint: string }> = [
	{ value: 'avg', label: 'Averaged curve', hint: 'the mean of every run' },
	{ value: 'curves', label: 'Individual runs', hint: 'one toggleable curve per run' },
	{ value: 'fill', label: 'Deviation fill', hint: 'shaded min/max band' }
];

export function SampleSetPhoneFields({ phone, onPatch }: FieldsProps): ReactNode {
	const set = phone.sampleSet ?? { name: '', variants: [emptyVariant()] };
	const updateWrapper = (next: Partial<typeof set>) => onPatch({ sampleSet: { ...set, ...next } });
	const updateVariant = (index: number, next: Partial<VariantEntry>) => {
		const copy = [...set.variants];
		copy[index] = { ...copy[index], ...next };
		updateWrapper({ variants: copy });
	};
	const removeVariant = (index: number) => {
		if (set.variants.length <= 1) return;
		updateWrapper({ variants: set.variants.filter((_, i) => i !== index) });
	};
	const addVariant = () => updateWrapper({ variants: [...set.variants, emptyVariant()] });

	return (
		<>
			<div className={ceStyles.ceFieldGroup}>
				<label className={ceStyles.ceLabel}>Display Name</label>
				<input
					type="text"
					className={ceStyles.ceInput}
					value={set.name}
					placeholder="e.g. HD 600"
					onChange={(e) => updateWrapper({ name: e.target.value })}
				/>
			</div>

			{set.variants.map((variant, index) => {
				const named = variant.rows.length > 0;
				const title =
					set.variants.length > 1
						? `Variant ${index + 1}${variant.suffix ? ` — ${variant.suffix}` : ''}`
						: 'Variant';
				const toggleMode = (mode: SampleDisplayMode) => {
					const next = variant.display.includes(mode)
						? variant.display.filter((m) => m !== mode)
						: DISPLAY_MODES.map((m) => m.value).filter(
								(m) => m === mode || variant.display.includes(m)
							);
					updateVariant(index, { display: next });
				};

				return (
					<div key={index} className={pbStyles.pbVariantEntry}>
						<div className={pbStyles.pbVariantEntryHeader}>
							<span className={pbStyles.pbVariantEntryTitle}>{title}</span>
							<button
								type="button"
								className={ceStyles.ceArrayRemoveBtn}
								onClick={() => removeVariant(index)}
								title="Remove variant"
								disabled={set.variants.length <= 1}
							>
								&times;
							</button>
						</div>

						<div className={ceStyles.ceFieldGroup}>
							<label className={ceStyles.ceLabel}>
								Variant Suffix
								<span className={ceStyles.ceLabelHint}>
									(optional — shown in the device variant selector, e.g. "Leather Pad")
								</span>
							</label>
							<input
								type="text"
								className={ceStyles.ceInput}
								value={variant.suffix ?? ''}
								placeholder="e.g. Leather Pad"
								onChange={(e) => updateVariant(index, { suffix: e.target.value })}
							/>
						</div>

						<div className={ceStyles.ceToggleRow}>
							<input
								type="checkbox"
								className={ceStyles.ceCheckbox}
								id={`${phone.id}-${index}-named`}
								checked={named}
								onChange={(e) =>
									updateVariant(
										index,
										e.target.checked
											? {
													rows: [
														{ file: '', label: '' },
														{ file: '', label: '' }
													],
													count: 0
												}
											: { rows: [], count: Math.max(variant.count, 2) }
									)
								}
							/>
							<label className={ceStyles.ceToggleLabel} htmlFor={`${phone.id}-${index}-named`}>
								Name each run's file
								<span className={ceStyles.ceToggleHint}>
									(uncheck for the numbered <code>L1/L2/L3</code> layout)
								</span>
							</label>
						</div>

						{named ? (
							<div className={ceStyles.ceFieldGroup}>
								<label className={ceStyles.ceLabel}>
									Runs
									<span className={ceStyles.ceLabelHint}>
										(each loads <code>{'{name}'} L.txt</code> / <code>{'{name}'} R.txt</code>)
									</span>
								</label>
								<RowsEditor
									rows={variant.rows}
									columns={[
										{ key: 'file', label: 'File base name', placeholder: 'HpTF Demo Center' },
										{ key: 'label', label: 'UI label', placeholder: 'Center' }
									]}
									onChange={(rows) => updateVariant(index, { rows })}
									createEmpty={() => ({ file: '', label: '' })}
									minRows={2}
									addLabel="+ Add run"
								/>
							</div>
						) : (
							<>
								<div className={ceStyles.ceFieldGroup}>
									<label className={ceStyles.ceLabel}>File Base Name</label>
									<input
										type="text"
										className={ceStyles.ceInput}
										value={variant.file}
										placeholder="e.g. HD600 Stock"
										onChange={(e) => updateVariant(index, { file: e.target.value })}
									/>
								</div>
								<div className={ceStyles.ceFieldGroup}>
									<label className={ceStyles.ceLabel}>
										Number of Runs
										<span className={ceStyles.ceLabelHint}>
											{variant.count > 0 ? (
												<>
													(loads{' '}
													<code>
														{variant.file || 'File'} L1.txt … L{variant.count}.txt
													</code>
													)
												</>
											) : (
												<>
													(0 — a plain <code>{variant.file || 'File'} L.txt</code> /{' '}
													<code>R.txt</code> pair)
												</>
											)}
										</span>
									</label>
									<input
										type="number"
										min={0}
										max={20}
										className={`${ceStyles.ceInput} ${ceStyles.ceInputSmall}`}
										value={variant.count}
										onChange={(e) =>
											updateVariant(index, { count: Math.max(0, Number(e.target.value) || 0) })
										}
									/>
								</div>
							</>
						)}

						{(named || variant.count > 0) && (
							<>
								<div className={ceStyles.ceFieldGroup}>
									<label className={ceStyles.ceLabel}>
										Display
										<span className={ceStyles.ceLabelHint}>
											(seeds the toggles; users can still change them)
										</span>
									</label>
									{DISPLAY_MODES.map((mode) => (
										<div key={mode.value} className={ceStyles.ceToggleRow}>
											<input
												type="checkbox"
												className={ceStyles.ceCheckbox}
												id={`${phone.id}-${index}-${mode.value}`}
												checked={variant.display.includes(mode.value)}
												onChange={() => toggleMode(mode.value)}
											/>
											<label
												className={ceStyles.ceToggleLabel}
												htmlFor={`${phone.id}-${index}-${mode.value}`}
											>
												{mode.label}
												<span className={ceStyles.ceToggleHint}>({mode.hint})</span>
											</label>
										</div>
									))}
								</div>

								<div className={ceStyles.ceFieldGroup}>
									<label className={ceStyles.ceLabel}>
										Description
										<span className={ceStyles.ceLabelHint}>(shown beside the device name)</span>
									</label>
									<input
										type="text"
										className={ceStyles.ceInput}
										value={variant.description ?? ''}
										placeholder="(Positional Variance)"
										onChange={(e) =>
											updateVariant(index, { description: e.target.value || undefined })
										}
									/>
								</div>
							</>
						)}
					</div>
				);
			})}

			<button type="button" className={ceStyles.ceArrayAddBtn} onClick={addVariant}>
				+ Add variant
			</button>
		</>
	);
}
