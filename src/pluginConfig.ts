import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
	name: 'windy-plugin-high-altitude-profile',
	version: '0.2.11',
	title: '高海拔天气剖面\u200B',
	icon: '▲',
	description: '可选 Windy 或 Open-Meteo ECMWF／ICON 的路线高空天气与视线云层分析。',
	author: 'TARSTang',
	desktopUI: 'rhpane',
	desktopWidth: 430,
	mobileUI: 'fullscreen',
	routerPath: '/high-altitude-profile/:lat?/:lon?',
	private: true,
	listenToSingleclick: true,
	addToContextmenu: true,
};

export default config;
