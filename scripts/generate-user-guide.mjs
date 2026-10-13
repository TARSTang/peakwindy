import { readFile, writeFile } from 'node:fs/promises';
import { guideVersion, guideSections, guideMarkdown } from '../src/lib/user-guide.js';

export async function generateUserGuide() {
  const pkg = JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  if (guideVersion !== pkg.version) throw new Error(`使用说明适配版本 ${guideVersion} 与插件 ${pkg.version} 不一致。请复核 src/lib/user-guide.js 内容并同步 guideVersion 后再发布。`);
  if (!guideSections.length || new Set(guideSections.map(section=>section.id)).size !== guideSections.length) throw new Error('使用说明章节为空或ID重复');
  await writeFile(new URL('../使用说明.md',import.meta.url),guideMarkdown(pkg.version),'utf8');
}
