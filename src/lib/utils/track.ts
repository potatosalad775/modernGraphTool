/**
 * Names the reactive values an `$effect` or `$derived` depends on without otherwise using.
 * The reads that subscribe happen where the arguments are evaluated.
 */
export function track(..._dependencies: unknown[]): void {
	// Nothing to do: evaluating the arguments was the point.
}
