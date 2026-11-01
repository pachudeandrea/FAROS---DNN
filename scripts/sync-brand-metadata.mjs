import { readFile, writeFile } from 'node:fs/promises';
const tokens = await readFile(new URL('../public/brand/tokens.css', import.meta.url), 'utf8');
const color = name => {
  const value = tokens.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})\\s*;`))?.[1];
  if (!value) throw new Error(`Falta el token ${name}`);
  return value;
};
const manifestPath = new URL('../public/manifest.webmanifest', import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.theme_color = color('brand-primary'); manifest.background_color = color('brand-paper');
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const htmlPath = new URL('../index.html', import.meta.url);
const html = await readFile(htmlPath, 'utf8');
await writeFile(htmlPath, html.replace(/(<meta name="theme-color" content=")[^"]+/, `$1${color('brand-primary')}`));
