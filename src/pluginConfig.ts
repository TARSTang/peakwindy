import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
	name: 'windy-plugin-high-altitude-profile',
	version: '0.1.63',
	title: '高海拔天气剖面分析',
	icon: '▲',
	description: '查看高海拔地点与路线的天气剖面。',
	author: 'TARSang',
	desktopUI: 'rhpane',
	desktopWidth: 430,
	mobileUI: 'fullscreen',
	routerPath: '/high-altitude-profile/:lat?/:lon?',
	private: true,
	listenToSingleclick: true,
	addToContextmenu: true,
};

export default config;
