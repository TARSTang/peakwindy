import { get, writable } from 'svelte/store';

export const favoriteStorageKey = 'windy-high-altitude-profile:favorites:v1';
export const favoritePlaces = writable([]);

function localStorageOrNull() {
	try {
		return typeof window === 'undefined' ? null : window.localStorage;
	} catch {
		return null;
	}
}

function validCoordinate(point) {
	return (
		Number.isFinite(point?.lat) &&
		Number.isFinite(point?.lon) &&
		point.lat >= -90 &&
		point.lat <= 90 &&
		point.lon >= -180 &&
		point.lon <= 180
	);
}

function cleanPlace(value) {
	if (!value || typeof value !== 'object' || !validCoordinate(value)) return null;
	const name = typeof value.name === 'string' ? value.name.trim().slice(0, 32) : '';
	if (!name || typeof value.id !== 'string' || !value.id) return null;
	return {
		id: value.id,
		name,
		lat: value.lat,
		lon: value.lon,
		elevationM: Number.isFinite(value.elevationM) ? value.elevationM : null,
	};
}

export function loadFavoritePlaces() {
	const storage = localStorageOrNull();
	if (!storage) return { ok: false, places: [] };
	try {
		const raw = storage.getItem(favoriteStorageKey);
		const parsed = raw ? JSON.parse(raw) : [];
		const places = Array.isArray(parsed)
			? parsed.map(cleanPlace).filter(Boolean).slice(0, 500)
			: [];
		favoritePlaces.set(places);
		return { ok: true, places };
	} catch {
		return { ok: false, places: [] };
	}
}

function persist(places) {
	const storage = localStorageOrNull();
	if (!storage) return { ok: false };
	try {
		storage.setItem(favoriteStorageKey, JSON.stringify(places));
		favoritePlaces.set(places);
		return { ok: true };
	} catch {
		return { ok: false };
	}
}

function coordinateKey(point) {
	return `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
}

export function saveFavoritePlace(candidate) {
	if (!validCoordinate(candidate)) return { ok: false, reason: '地点坐标无效' };
	const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 32) : '';
	if (!name) return { ok: false, reason: '请先填写地点名称' };
	const places = get(favoritePlaces);
	const key = coordinateKey(candidate);
	const existing = places.find((place) => coordinateKey(place) === key);
	if (!existing && places.length >= 500) {
		return { ok: false, reason: '最多保存 500 个地点，请先删除一些' };
	}
	const place = {
		id: existing?.id ?? `place-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
		name,
		lat: candidate.lat,
		lon: candidate.lon,
		elevationM: Number.isFinite(candidate.elevationM)
			? candidate.elevationM
			: (existing?.elevationM ?? null),
	};
	const next = existing
		? places.map((item) => (item.id === existing.id ? place : item))
		: [place, ...places];
	const result = persist(next);
	return result.ok ? { ...result, place, updated: Boolean(existing) } : result;
}

export function renameFavoritePlace(id, name) {
	const normalized = typeof name === 'string' ? name.trim().slice(0, 32) : '';
	if (!normalized) return { ok: false, reason: '地点名称不能为空' };
	const places = get(favoritePlaces);
	const next = places.map((place) => (place.id === id ? { ...place, name: normalized } : place));
	const result = persist(next);
	return result.ok ? { ...result, name: normalized } : result;
}

export function removeFavoritePlace(id) {
	const places = get(favoritePlaces);
	const result = persist(places.filter((place) => place.id !== id));
	return result;
}
