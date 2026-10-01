import { resolveOviCoordinate } from './coordinates.js';

const definitions = [
	{ id: 'gongga', name: '贡嘎山', coordinate: 'g101.88167968,29.59240010', elevationM: 7508.9 },
	{ id: 'lenggacuo', name: '冷嘎措', coordinate: 'g101.68467084,29.64828980' },
	{ id: 'zimeiyakou', name: '子梅垭口', coordinate: 'g101.72073798,29.52057234' },
	{ id: 'niubeishan', name: '牛背山', coordinate: 'g102.37562224,29.77272923' },
	{ id: 'kawagarbo', name: '卡瓦格博', coordinate: 'g98.68545494,28.43416406', elevationM: 6740 },
	{ id: 'namcha-barwa', name: '南迦巴瓦', coordinate: 'g95.05705403,29.62632720', elevationM: 7782 },
	{ id: 'feilaisi', name: '飞来寺', coordinate: 'g98.87652839,28.43766459' },
	{ id: 'suosong', name: '索松村', coordinate: 'g94.89210300,29.57338200' },
];

export const BUILT_IN_PLACES = Object.freeze(definitions.map(place => {
	const resolved = resolveOviCoordinate(place.coordinate);
	if (!resolved.ok) throw new Error(`Invalid built-in place coordinate for ${place.id}: ${resolved.error}`);
	return Object.freeze({
		...place,
		lat: resolved.lat,
		lon: resolved.lon,
		coordinateSystem: resolved.coordinateSystem,
		coordinateSource: resolved.source,
	});
}));
