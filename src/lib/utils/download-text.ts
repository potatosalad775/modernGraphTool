/** Triggers a browser download of `blob` as a file named `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

/** Triggers a browser download of `text` as a file named `filename`. */
export function downloadText(text: string, filename: string): void {
	downloadBlob(new Blob([text], { type: 'text/plain' }), filename);
}
