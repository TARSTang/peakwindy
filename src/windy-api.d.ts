declare module '@windy/interfaces' {
	export interface ExternalPluginConfig {
		name: `windy-plugin-${string}`;
		version: string;
		title: string;
		icon: string;
		description?: string;
		author?: string;
		desktopUI: 'rhpane' | 'embedded';
		desktopWidth?: number;
		mobileUI: 'fullscreen' | 'small' | 'embedded';
		routerPath?: string;
		private?: boolean;
		listenToSingleclick?: boolean;
		addToContextmenu?: boolean;
	}
}

declare module '@windy/fetch' {
	interface WindyHttpOptions { abortSignal?: AbortSignal; }
	export function getElevation(lat: number, lon: number, httpOptions?: WindyHttpOptions): Promise<unknown>;
	export function getMeteogramForecastData(
		model: 'ecmwf' | 'icon',
		location: { lat: number; lon: number; step?: number },
		options?: Record<string, string>,
		httpOptions?: WindyHttpOptions,
	): Promise<unknown>;
	export function getPointForecastData(
		model: 'ecmwf' | 'icon',
		options: { lat: number; lon: number; days?: number; step?: 1 | 3; source?: string },
		include?: { header?: boolean; celestial?: boolean; summary?: boolean; meteogram?: boolean; airgram?: boolean; sounding?: boolean },
		httpOptions?: WindyHttpOptions,
	): Promise<unknown>;
}

declare module '@windy/store' {
	const store: {
		get(key: 'timestamp' | 'product'): number | string | null;
		on(key: 'timestamp' | 'product', callback: (value: number | string | null) => void): number;
		off(id: number): void;
		set(key: 'timestamp', value: number): boolean | undefined;
	};
	export default store;
}

declare module '@windy/map' {
	export const map: any;
}

declare module '@windy/singleclick' {
	export const singleclick: {
		on(ident: string, callback: (event: unknown) => void): void;
		off(ident: string, callback: (event: unknown) => void): void;
	};
}

declare module '@windy/broadcast' {
	const broadcast: { emit(topic: string, ...args: unknown[]): void };
	export default broadcast;
}

declare const L: any;
