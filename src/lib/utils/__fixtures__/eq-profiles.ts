/**
 * Constraint presets for specs, built from eqcaps profiles the way the app's own are.
 */
import type { Domain, FilterType, Profile } from '@potatosalad775/eqcaps-core';
import type { EqConstraintPreset } from '$lib/types/eq-constraint.js';
import { graphicProfile, uniformProfile } from '../eq-constraint.js';

export interface ParametricOptions {
	label?: string;
	/** 0 = unlimited. */
	maxBands?: number;
	types?: FilterType[];
	freq?: Domain;
	q?: Domain;
	gain?: Domain;
	source?: EqConstraintPreset['source'];
}

/** A preset whose every slot is the same: `maxBands` slots (unbounded at 0) of one template. */
export function parametricPreset(id: string, opts: ParametricOptions = {}): EqConstraintPreset {
	return {
		id,
		label: opts.label ?? id,
		source: opts.source ?? 'builtin',
		profile: uniformProfile({
			id: `spec-${id}`,
			model: opts.label ?? id,
			bandCount: opts.maxBands ? opts.maxBands : null,
			types: opts.types ?? ['PK', 'LSC', 'HSC'],
			freq: opts.freq ?? { min: 20, max: 20000 },
			q: opts.q ?? { min: 0.1, max: 10 },
			gain: opts.gain ?? { min: -12, max: 12 }
		})
	};
}

export function graphicPreset(
	id: string,
	bands: { freq: number; q: number }[],
	gain: Domain = { min: -10, max: 10 }
): EqConstraintPreset {
	return {
		id,
		label: id,
		source: 'builtin',
		profile: graphicProfile({ id: `spec-${id}`, model: id, bands, gain })
	};
}

/** A hardware profile: `bandCount` slots, with optional per-slot overrides. */
export function hardwareProfile(
	id: string,
	opts: {
		bandCount: number;
		band?: Profile['band'];
		bands?: Profile['bands'];
		preamp?: Profile['preamp'];
		status?: Profile['meta']['status'];
	}
): Profile {
	return {
		schemaVersion: '1.0',
		id,
		kind: 'hardware',
		device: { brand: 'Spec', model: id },
		bandCount: opts.bandCount,
		band: opts.band ?? {
			types: ['PK', 'LSC', 'HSC'],
			freq: { min: 20, max: 20000, step: 1 },
			q: { min: 0.1, max: 10, step: 0.01 },
			gain: { min: -12, max: 12, step: 0.1 }
		},
		...(opts.bands ? { bands: opts.bands } : {}),
		preamp: opts.preamp ?? { mode: 'manual', gain: { min: -12, max: 0, step: 0.5 } },
		meta: { status: opts.status ?? 'community-verified', sources: [] }
	};
}
