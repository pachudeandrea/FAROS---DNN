import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
const root = new URL('../', import.meta.url);
const read = (file: string) => readFile(new URL(file, root), 'utf8');
async function componentFiles(dir = new URL('src/components/', root)): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) files.push(...await componentFiles(url));
    else if (entry.name.endsWith('.tsx')) files.push(url.pathname);
  }
  return files;
}
test('los componentes usan tokens de marca y no conservan el faro, paletas o fuentes anteriores', async () => {
  for (const file of [...await componentFiles(), new URL('src/App.tsx', root).pathname]) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /LighthouseLogo|Plus Jakarta Sans|JetBrains Mono|#[\da-fA-F]{3,8}\b|rgba?\(/, path.basename(file));
    assert.doesNotMatch(source, /(?:text|bg|border|ring|from|via|to|fill|stroke|shadow)-(?:emerald|slate|rose|amber|blue|teal|purple|indigo|red)-\d/, path.basename(file));
  }
  const logo = await read('src/components/BrandLogo.tsx');
  assert.match(logo, /faros-.*symbol/); assert.doesNotMatch(logo, /<svg|currentColor.*fill=/);
  const html = await read('index.html');
  assert.match(html, /\/brand\/tokens.css/); assert.match(html, /og:image/);
  assert.doesNotMatch(html, /fonts.googleapis|fonts.gstatic/);
});
test('metadatos y aplicaciones pequeñas derivan de la paleta y del símbolo oficial', async () => {
  const css = await read('public/brand/tokens.css');
  const token = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1];
  const manifest = JSON.parse(await read('public/manifest.webmanifest'));
  assert.equal(manifest.theme_color, token('brand-primary'));
  assert.equal(manifest.background_color, token('brand-paper'));
  assert.match(await read('index.html'), new RegExp(`theme-color" content="${token('brand-primary')}"`));
  const symbol = await read('public/brand/faros-symbol-dark.svg');
  assert.doesNotMatch(symbol, /matrix\(1,0,0,-1,776\.0656,784\.1996\)/, 'El isotipo no contiene fragmentos del nombre');
  assert.match(await read('public/brand/faros-logo-dark.svg'), /matrix\(1,0,0,-1,776\.0656,784\.1996\)/, 'El logo completo conserva los trazados originales');
  assert.match(css, /Basis Grotesque Arabic Pro/); assert.match(css, /font-weight: 300/); assert.match(css, /font-weight: 400/); assert.match(css, /font-weight: 700/);
});
