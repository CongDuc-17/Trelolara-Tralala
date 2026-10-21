export function calculateNewPosition(
	beforePosition?: number,
	afterPosition?: number,
): number {
	if (beforePosition == null && afterPosition == null) return 1;
	if (beforePosition == null)
		return afterPosition! > 0 ? afterPosition! / 2 : afterPosition! - 1;
	if (afterPosition == null) return beforePosition + 1;
	return beforePosition + (afterPosition - beforePosition) / 2;
}

export function isPositionBetween(
	position: number,
	before?: number,
	after?: number,
): boolean {
	return (
		Number.isFinite(position) &&
		(before === undefined || position > before) &&
		(after === undefined || position < after)
	);
}
