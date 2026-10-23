import fs from 'node:fs/promises';
import path from 'node:path';

const destination = process.argv[2] || 'release/Luma-preview.html';
const files = await fs.readdir('dist/assets');
let javascript = await fs.readFile(path.join('dist/assets', files.find(file => file.endsWith('.js'))), 'utf8');
let css = await fs.readFile(path.join('dist/assets', files.find(file => file.endsWith('.css'))), 'utf8');
const embedded = {};
for (const file of await fs.readdir('public/artwork')) {
  if (!file.endsWith('.jpg')) continue;
  embedded[`./artwork/${file}`] = `data:image/jpeg;base64,${(await fs.readFile(`public/artwork/${file}`)).toString('base64')}`;
}
const logo = `data:image/svg+xml;base64,${(await fs.readFile('public/luma.svg')).toString('base64')}`;
embedded['./luma.svg'] = logo;
embedded['./demo.mp4'] = `data:video/mp4;base64,${(await fs.readFile('public/demo.mp4')).toString('base64')}`;
const font = `data:font/woff2;base64,${(await fs.readFile('public/luma-chinese.woff2')).toString('base64')}`;
css = css.replace(/url\([^)]*luma-chinese\.woff2\)/g, `url("${font}")`);
javascript = javascript.replace(/src:"\.\/luma\.svg"/g, `src:${JSON.stringify(logo)}`);
await fs.mkdir(path.dirname(destination), { recursive: true });
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#151619"><title>Luma · 可交互界面预览</title><link rel="icon" href="${logo}"><style>${css}</style></head><body><div id="root"></div><script>window.__LUMA_ASSETS=${JSON.stringify(embedded)};</script><script type="module">${javascript.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
await fs.writeFile(destination, html);
console.log(`Exported ${destination} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB)`);
