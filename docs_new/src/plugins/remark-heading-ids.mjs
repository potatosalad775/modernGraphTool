/**
 * Supports Docusaurus-style explicit heading ids: `## Some heading {#custom-id}`.
 *
 * These came across with the migrated content and matter because ~8 in-page
 * links target them (`](#base-path)`, `](#custom-links)`, …). Without this the
 * id would be auto-slugged from the heading text instead — which silently
 * breaks every one of those anchors on the Korean pages, where the heading
 * text is Korean but the anchor is English.
 *
 * The source keeps the braces escaped (`\{#custom-id\}`) so MDX reads them as
 * text rather than a JS expression. This plugin strips that trailing marker and
 * promotes it to the heading's `id`; Astro's own `rehypeHeadingIds` leaves an
 * already-set id alone, so the table of contents picks it up unchanged.
 */
import { visit } from 'unist-util-visit';

const TRAILING_ID = /\s*\{#([A-Za-z0-9_-]+)\}\s*$/;

export default function remarkHeadingIds() {
	return (tree) => {
		visit(tree, 'heading', (node) => {
			const last = node.children.at(-1);
			if (last?.type !== 'text') return;

			const match = last.value.match(TRAILING_ID);
			if (!match) return;

			last.value = last.value.slice(0, match.index);
			if (last.value === '') node.children.pop();

			node.data ??= {};
			node.data.hProperties = { ...node.data.hProperties, id: match[1] };
		});
	};
}
