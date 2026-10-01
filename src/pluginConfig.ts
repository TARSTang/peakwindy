import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
	name: 'windy-plugin-high-altitude-profile',
	version: '0.2.1',
	title: '高海拔天气剖面\u200B',
	icon: '▲',
	description: '分析机位到山体的通视、视线云层与地面雾／能见度。',
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
