export interface RankingUrlContext {
	type: string;
	brand: string;
	model: string;
}

export function buildRankingUrl(
	template: string | null | undefined,
	ctx: RankingUrlContext
): string | null {
	if (!template) return null;
	if (!/\{[a-zA-Z]+\}/.test(template)) return template;
	const brand = String(ctx.brand ?? '');
	const model = String(ctx.model ?? '');
	const slug = (brand + '-' + model).toLowerCase().replace(/\s+/g, '-');
	const fullName = brand + ' ' + model;
	const values: Record<string, string> = {
		type: ctx.type ?? '',
		brand: encodeURIComponent(brand),
		model: encodeURIComponent(model),
		slug: encodeURIComponent(slug).replace(/%2D/gi, '-'),
		fullName: encodeURIComponent(fullName)
	};
	return template.replace(/\{([a-zA-Z]+)\}/g, (_, k) => (values[k] != null ? values[k] : ''));
}
