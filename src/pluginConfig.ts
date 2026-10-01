import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
	name: 'windy-plugin-high-altitude-profile',
	version: '0.2.2',
	title: '高海拔天气剖面\u200B',
	icon: '▲',
	description: '查看单点与路线的高空天气剖面。',
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
