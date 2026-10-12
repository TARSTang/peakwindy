import { isValidCoordinate } from './route.js';

// Windy coordinates are already WGS-84. Never apply the Ovi GCJ-02 converter.
export function normalizeWindyFavorites(items) {
	if (!Array.isArray(items)) return [];
	return items.filter(item => item?.type !== 'route' && isValidCoordinate(item)).map(item => ({
		id: String(item.id), lat: item.lat, lon: item.lon,
		name: String(item.title ?? '').trim().slice(0, 32) || 'Windy 收藏地点',
	}));
}

export function favoriteAtMapPixel(items, pixel, project, maxPixels = 24) {
	const matches = [];
	for (const item of items) {
		const at = project(item);
		if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) continue;
		const distance = Math.hypot(at.x - pixel.x, at.y - pixel.y);
		if (distance <= maxPixels) matches.push({ item, distance });
	}
	matches.sort((a, b) => a.distance - b.distance);
	// Overlapping hearts cannot be resolved safely from the screen position.
	if (!matches.length || matches[1]?.distance - matches[0].distance < 3) return null;
	return matches[0].item;
}
