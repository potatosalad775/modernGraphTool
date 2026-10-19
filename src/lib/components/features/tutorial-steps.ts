import type { Component } from 'svelte';
import * as m from '#lib/paraglide/messages.js';
import type { TourId } from '#lib/stores/tutorial-store.svelte.js';
import { withIcons, type InlineIcon, type StepText } from './tutorial-text.js';
import { BookOpen, Settings2 } from '@lucide/svelte';

/**
 * A `data-tutorial-target` value. Every element carrying it is spotlit together,
 * so one step can frame neighbours (the Audio Player and History sections).
 */
export type TutorialTarget =
	| 'menu'
	| 'graph_handle'
	| 'divider'
	| 'keyboard'
	| 'eq_source'
	| 'eq_filters'
	| 'eq_autoeq'
	| 'eq_listen'
	| 'eq_hardware';

export interface TutorialStep {
	title?: StepText;
	content: StepText;
	/** Smaller lines under the content; dropped on a short screen when the step has a target. */
	tips?: StepText[];
	guideLinkLabel?: () => string;
	/**
	 * Left off the spotlight steps: the 40 px tile is height the dialog can't spare
	 * beside its target on a short screen (a DAP's), where it would cover it.
	 */
	icon?: string | Component;
	target?: TutorialTarget;
}

function welcomeSteps(isMobile: boolean): TutorialStep[] {
	const steps: TutorialStep[] = [
		{
			title: m.tutorial_modal_intro_title,
			content: m.tutorial_modal_intro_content,
			icon: '👋'
		},
		{ content: m.tutorial_modal_menu_content, target: 'menu' },
		{ content: m.tutorial_modal_graph_handle_content, target: 'graph_handle' }
	];

	if (isMobile) {
		steps.push({
			title: m.tutorial_modal_pwa_title,
			content: m.tutorial_modal_pwa_content,
			tips: [m.tutorial_modal_pwa_inst_ios, m.tutorial_modal_pwa_inst_android],
			icon: '📱'
		});
	} else {
		steps.push(
			{ content: m.tutorial_modal_divider_content, target: 'divider' },
			{ content: m.tutorial_modal_shortcuts_content, target: 'keyboard' }
		);
	}

	steps.push({
		title: m.tutorial_modal_guide_title,
		content: m.tutorial_modal_guide_content,
		guideLinkLabel: m.tutorial_modal_guide_link,
		icon: BookOpen
	});
	return steps;
}

/** `EqOptionButton`'s trigger, which shows only its icon. */
const constraintButton: InlineIcon = { icon: Settings2, label: m.eq_constraint_select_label };

/**
 * Points at the section headers, not their contents — the sections start collapsed.
 * Kept to five steps on purpose: one per section would be long enough to get skipped.
 */
function equalizerSteps(isMobile: boolean): TutorialStep[] {
	return [
		{
			title: m.tutorial_eq_intro_title,
			content: m.tutorial_eq_source_content,
			target: 'eq_source'
		},
		{
			content: m.tutorial_eq_filters_content,
			tips: [() => withIcons(m.tutorial_eq_constraint_hint, { icon: constraintButton })],
			target: 'eq_filters'
		},
		{ content: m.tutorial_eq_autoeq_content, target: 'eq_autoeq' },
		{
			content: m.tutorial_eq_listen_content,
			// The `\` hold is a keyboard shortcut; a phone has no key to hold.
			tips: isMobile ? undefined : [m.tutorial_eq_bypass_hint],
			target: 'eq_listen'
		},
		{
			content: m.tutorial_eq_hardware_content,
			tips: [m.tutorial_eq_replay_hint],
			target: 'eq_hardware'
		}
	];
}

export function tourSteps(id: TourId, isMobile: boolean): TutorialStep[] {
	return id === 'equalizer' ? equalizerSteps(isMobile) : welcomeSteps(isMobile);
}
