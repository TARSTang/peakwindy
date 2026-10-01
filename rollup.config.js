import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import serve from 'rollup-plugin-serve';
import rollupSvelte from 'rollup-plugin-svelte';
import rollupSwc from 'rollup-plugin-swc3';
import sveltePreprocess from 'svelte-preprocess';
import { transformCodeToESMPlugin, keyPEM, certificatePEM } from '@windycom/plugin-devtools';

const useSourceMaps = true;
const config = {
	input: 'src/plugin.svelte',
	output: [
		{ file: 'dist/plugin.js', format: 'module', sourcemap: true },
		{
			file: 'dist/plugin.min.js',
			format: 'module',
			sourcemap: true,
			plugins: [terser()],
		},
	],
	 onwarn(warning, defaultWarn) {
		defaultWarn(warning);
	},
	external: id => id.startsWith('@windy/'),
	watch: { include: ['src/**'], exclude: 'node_modules/**', clearScreen: false },
	plugins: [
		rollupSvelte({
			emitCss: false,
			preprocess: {
				script: data => sveltePreprocess({ sourceMap: useSourceMaps }).script(data),
			},
		}),
		rollupSwc({ include: ['**/*.ts', '**/*.svelte'], sourceMaps: useSourceMaps }),
		resolve({ browser: true, mainFields: ['module', 'jsnext:main', 'main'], preferBuiltins: false, dedupe: ['svelte'] }),
		commonjs(),
		transformCodeToESMPlugin(),
		process.env.SERVE === 'false' ? undefined : serve({
			contentBase: 'dist',
			host: '127.0.0.1',
			port: 9999,
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Cache-Control': 'no-store, max-age=0',
				Pragma: 'no-cache',
			},
			https: { key: keyPEM, cert: certificatePEM },
		}),
	].filter(Boolean),
};

export default config;
