// Builds the single-file app: src/ -> index.html (what GitHub Pages serves).
//   npm run build     build once
//   npm run watch     rebuild on every change in src/
// The JSX is compiled here, once, instead of in every visitor's browser.
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const p = (...parts) => join(root, ...parts);

export async function renderPage() {
  const out = await build({
    entryPoints: [p('src/main.jsx')],
    bundle: true,
    write: false,
    format: 'iife',
    target: ['es2019'],
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    minify: true,
    legalComments: 'none',
    charset: 'utf8',
    logLevel: 'silent',
  });
  const js = out.outputFiles[0].text;
  if (/<\/script/i.test(js)) throw new Error('Compiled JS contains "</script", which would break the inline script.');
  const [css, tpl] = await Promise.all([readFile(p('src/style.css'), 'utf8'), readFile(p('src/index.html'), 'utf8')]);
  if (!tpl.includes('<!-- STYLE -->') || !tpl.includes('<!-- APP -->')) throw new Error('src/index.html lost its <!-- STYLE --> / <!-- APP --> markers.');
  return tpl
    .replace('<!-- STYLE -->', () => '<style>\n' + css + '</style>')
    .replace('<!-- APP -->', () => '<!-- Built from src/ by build.mjs. Do not edit here: edit src/ and run npm run build. -->\n  <script>\n' + js + '</script>');
}

async function writePage() {
  const html = await renderPage();
  await writeFile(p('index.html'), html);
  console.log('index.html written (' + (Buffer.byteLength(html) / 1024).toFixed(1) + ' KB)');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await writePage();
  if (process.argv.includes('--watch')) {
    let timer = null;
    watch(p('src'), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => writePage().catch((e) => console.error(e.message)), 80);
    });
    console.log('Watching src/ ...');
  }
}
