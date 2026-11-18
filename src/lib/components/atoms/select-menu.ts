export interface SelectMenuItem {
	value: string;
	label: string;
	/** Muted text after the label, in the row and in the trigger. */
	detail?: string;
	/** Drawn nested under the row above it. */
	indent?: boolean;
	/** What the trigger shows when this item is picked, if not `label` / `detail`. */
	trigger?: { label: string; detail?: string };
	/** Accessible name, when the visible label leans on the rows around it. */
	ariaLabel?: string;
}
export interface SelectMenuGroup {
	id: string;
	heading: string;
	items: SelectMenuItem[];
}
