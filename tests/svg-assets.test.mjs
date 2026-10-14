import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { inlineSvgUses } from '../src/svg-assets.js';

const document = new JSDOM('', { url: 'https://chatgpt.com/c/example' }).window.document;
const dataUrl = xml => 'data:image/svg+xml;base64,' + Buffer.from(xml).toString('base64');
const sprite = '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="code-light-20" viewBox="0 0 20 20"><path d="M1 2L3 4" fill-rule="evenodd"/></symbol></svg>';
const resourceMap = { 'https://chatgpt.com/cdn/assets/icons.svg': dataUrl(sprite) };

test('external use becomes inline paths and preserves inherited fill and viewBox', () => {
  const result = inlineSvgUses(document, '<svg viewBox="0 0 20 20" width="20"><use href="/cdn/assets/icons.svg#code-light-20" fill="currentColor" class="icon"/></svg>', resourceMap);
  const fragment = document.createElement('template'); fragment.innerHTML = result.html;
  assert.equal(result.inlined, 1); assert.equal(result.missing, 0);
  assert.equal(fragment.content.querySelector('use'), null);
  assert.equal(fragment.content.querySelector('path').getAttribute('d'), 'M1 2L3 4');
  assert.equal(fragment.content.querySelector('[data-offline-svg-symbol]').getAttribute('fill'), 'currentColor');
  assert.equal(fragment.content.querySelector('svg').getAttribute('viewBox'), '0 0 20 20');
  assert.deepEqual(result.warnings, []);
});

test('xlink href, relative keys and percent-encoded UTF8 data URLs are supported', () => {
  const map = { '/icons.svg': 'data:image/svg+xml,' + encodeURIComponent(sprite.replace('M1 2L3 4', 'M2 3L4 5')) };
  const result = inlineSvgUses(document, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="/icons.svg#code-light-20"/></svg>', map);
  assert.equal(result.inlined, 1); assert.ok(result.html.includes('M2 3L4 5'));
  assert.ok(result.html.includes('viewBox="0 0 20 20"'));
  assert.ok(!result.html.includes('xlink:href="/'));
});

test('original local uses are kept; missing remote uses are removed and reported', () => {
  const result = inlineSvgUses(document, '<svg><defs><symbol id="local"><path/></symbol></defs><use href="#local"/><use href="https://missing.example/sprite.svg#lost"/></svg>', {});
  assert.ok(result.html.includes('href="#local"'));
  assert.ok(!result.html.includes('missing.example'));
  assert.equal(result.missing, 1); assert.equal(result.warnings.length, 1);
});

test('nested sprite references are flattened and cyclic references cannot survive', () => {
  const xml = '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="a"><use href="#b"/></symbol><symbol id="b"><path d="M0 0L1 1"/></symbol><symbol id="cycle"><use href="#cycle"/></symbol></svg>';
  const result = inlineSvgUses(document, '<svg><use href="/sprite.svg#a"/><use href="/sprite.svg#cycle"/></svg>', { '/sprite.svg': dataUrl(xml) });
  assert.ok(result.html.includes('M0 0L1 1'));
  assert.ok(!result.html.includes('<use'));
  assert.equal(result.missing, 1);
  assert.ok(result.warnings.some(warning => warning.includes('cyclic')));
});

test('sprite scripts and event handlers are not imported; gradient IDs stay local', () => {
  const xml = '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="shade"><stop offset="0" stop-color="red"/></linearGradient></defs><symbol id="a"><script>globalThis.SVG_ATTACK=true</script><path onclick="attack()" d="M1 1" fill="url(#shade)"/></symbol></svg>';
  const result = inlineSvgUses(document, '<svg><use href="/sprite.svg#a"/><use href="/sprite.svg#a"/></svg>', { '/sprite.svg': dataUrl(xml) });
  assert.ok(!result.html.includes('<script')); assert.ok(!result.html.includes('onclick'));
  assert.ok(result.html.includes('url(#offline-svg-1-shade)'));
  assert.ok(result.html.includes('url(#offline-svg-2-shade)'));
  assert.equal(globalThis.SVG_ATTACK, undefined);
});

test('different symbol viewport and use dimensions retain their own SVG viewport', () => {
  const result = inlineSvgUses(document, '<svg viewBox="0 0 40 40"><use href="/cdn/assets/icons.svg#code-light-20" x="3" y="4" width="10" height="12"/></svg>', resourceMap);
  const fragment = document.createElement('template'); fragment.innerHTML = result.html;
  const inner = fragment.content.querySelector('svg svg');
  assert.equal(inner.getAttribute('viewBox'), '0 0 20 20');
  assert.equal(inner.getAttribute('width'), '10'); assert.equal(inner.getAttribute('height'), '12');
  assert.ok(result.html.includes('translate(3 4)'));
});

test('quoted local paint URLs are retained and imported styles cannot fetch resources', () => {
  const xml = '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="shade"/></defs><symbol id="a"><style>@import "https://remote.test/style.css";.icon{fill:url(&quot;#shade&quot;);background:url(https://remote.test/image.png)}</style><path d="M1 1" fill="url(&quot;#shade&quot;)"/></symbol></svg>';
  const result = inlineSvgUses(document, '<svg><use href="/sprite.svg#a"/></svg>', { '/sprite.svg': dataUrl(xml) });
  const fragment = document.createElement('template'); fragment.innerHTML = result.html;
  assert.equal(fragment.content.querySelector('path').getAttribute('fill'), 'url(#offline-svg-1-shade)');
  assert.ok(!fragment.content.querySelector('style').textContent.includes('remote.test'));
  assert.ok(fragment.content.querySelector('style').textContent.includes('url(#offline-svg-1-shade)'));
});

test('real MySQL capture contains external icons that are all eliminated', async t => {
  let html;
  try { html = await readFile(new URL('../fixtures/mysql-live.html', import.meta.url), 'utf8'); }
  catch { t.skip('Private capture deliberately absent from distribution.'); return; }
  const sourceDocument = new JSDOM(html).window.document;
  const external = [...sourceDocument.querySelectorAll('use')].filter(element => !element.getAttribute('href')?.startsWith('#'));
  assert.ok(external.length > 100);
  // Missing sprites must never remain an offline network dependency.
  const result = inlineSvgUses(document, html, {}, 'https://chatgpt.com/');
  const fragment = document.createElement('template'); fragment.innerHTML = result.html;
  assert.equal([...fragment.content.querySelectorAll('use')].filter(element => !element.getAttribute('href')?.startsWith('#')).length, 0);
  assert.equal(result.missing, external.length);
});
