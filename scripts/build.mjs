import { mkdir, copyFile } from 'node:fs/promises';
import { rollup } from 'rollup';

process.env.SERVE = 'false';
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
const config = (await import('../rollup.config.js')).default;
const { watch, ...buildConfig } = config;
const bundle = await rollup(buildConfig);
try {
	for (const output of buildConfig.output) await bundle.write(output);
} finally {
	await bundle.close();
}
await copyFile(new URL('../package.json', import.meta.url), new URL('../dist/package.json', import.meta.url));
console.log('Built Windy plugin into dist/.');
