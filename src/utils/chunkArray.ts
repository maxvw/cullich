export const chunkArray = <T>(array: T[], size: number): T[][] =>
	Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
		array.slice(i * size, i * size + size),
	);
