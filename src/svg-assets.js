const SVG = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';
const hrefOf = element => element.getAttribute('href') || element.getAttributeNS(XLINK, 'href') || element.getAttribute('xlink:href') || '';
const cssUrls = /url\(\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^\s)]*))\s*\)/gi;
const hasExternalCssUrl = value => [...value.matchAll(cssUrls)].some(match => !/^(?:#|data:)/i.test(match[1] ?? match[2] ?? match[3]));

function dataText(url) {
  const comma = url.indexOf(',');
  if (comma < 0 || !/^data:(?:image\/svg\+xml|text\/xml|application\/xml)(?:;[^,]*)?,/i.test(url)) throw new Error('SVG sprite resource is not an SVG data URL');
  if (/;base64$/i.test(url.slice(0, comma))) {
    const raw = atob(url.slice(comma + 1));
    return new TextDecoder().decode(Uint8Array.from(raw, character => character.charCodeAt(0)));
  }
  return decodeURIComponent(url.slice(comma + 1));
}

function copyAttributes(from, to, skipped = []) {
  for (const attribute of from.attributes || []) {
    if (skipped.includes(attribute.name) || /^on/i.test(attribute.name) || /^(?:javascript|vbscript):/i.test(attribute.value.trim())) continue;
    if (attribute.namespaceURI) to.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
    else to.setAttribute(attribute.name, attribute.value);
  }
}

/** Flatten external SVG sprite uses into inert inline SVG content.
 * The resource map accepts original, absolute, and fragment-free URL keys.
 * HTML and XML are parsed in detached trees; no captured scripts execute.
 * Missing symbols become empty g elements and are reported, never remote uses.
 */
export function inlineSvgUses(document, html, resourceMap = {}, baseUrl = document.baseURI) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const warnings = [], spriteCache = new Map();
  let inlined = 0, missing = 0, sequence = 0;
  const Parser = document.defaultView?.DOMParser || globalThis.DOMParser;
  function resourceFor(href, absolute) {
    const noHash = value => value.slice(0, value.indexOf('#') < 0 ? value.length : value.indexOf('#'));
    for (const key of [absolute, noHash(absolute), href, noHash(href)]) {
      const entry = resourceMap instanceof Map ? resourceMap.get(key) : resourceMap[key];
      const value = typeof entry === 'string' ? entry : entry?.dataUrl;
      if (value) return noHash(value);
    }
    return href.startsWith('data:') ? noHash(href) : null;
  }
  function spriteFor(href, base) {
    const absolute = new URL(href, base).href;
    const hashAt = absolute.lastIndexOf('#');
    if (hashAt < 0 || hashAt === absolute.length - 1) throw new Error('SVG use has no symbol fragment');
    const symbolId = decodeURIComponent(absolute.slice(hashAt + 1));
    const sourceUrl = absolute.slice(0, hashAt);
    let sprite = spriteCache.get(sourceUrl);
    if (!sprite) {
      const dataUrl = resourceFor(href, absolute);
      if (!dataUrl) throw new Error('SVG sprite was not saved');
      sprite = new Parser().parseFromString(dataText(dataUrl), 'image/svg+xml');
      if (sprite.querySelector('parsererror') || sprite.documentElement.localName !== 'svg') throw new Error('SVG sprite XML could not be parsed');
      spriteCache.set(sourceUrl, sprite);
    }
    const symbol = sprite.getElementById(symbolId) || [...sprite.querySelectorAll('[id]')].find(element => element.id === symbolId);
    if (!symbol) throw new Error(`SVG symbol ${symbolId} is missing`);
    return { sprite, symbol, sourceUrl, symbolId };
  }
  function failed(use, href, error) {
    const group = document.createElementNS(SVG, 'g');
    copyAttributes(use, group, ['href', 'xlink:href', 'x', 'y', 'width', 'height']);
    group.setAttribute('data-offline-svg-missing', '');
    use.replaceWith(group); missing++;
    warnings.push(`SVG icon was not saved: ${href} (${error.message})`);
  }
  function expand(use, base, ancestors = new Set(), localSprite = null) {
    const href = hrefOf(use);
    if (!href || href.startsWith('#') && !localSprite) return;
    try {
      const targetHref = href.startsWith('#') ? localSprite.sourceUrl + href : href;
      const { sprite, symbol, sourceUrl, symbolId } = spriteFor(targetHref, base);
      const identity = `${sourceUrl}#${symbolId}`;
      if (ancestors.has(identity) || ancestors.size > 30) throw new Error('SVG sprite contains a cyclic use reference');
      const nextAncestors = new Set(ancestors); nextAncestors.add(identity);
      const group = document.createElementNS(SVG, 'g');
      copyAttributes(use, group, ['href', 'xlink:href', 'x', 'y', 'width', 'height']);
      const x = use.getAttribute('x'), y = use.getAttribute('y');
      if (x || y) group.setAttribute('transform', `${group.getAttribute('transform') || ''} translate(${x || 0} ${y || 0})`.trim());
      group.setAttribute('data-offline-svg-symbol', symbolId);
      const symbolGroup = document.createElementNS(SVG, 'g');
      copyAttributes(symbol, symbolGroup, ['id', 'viewBox', 'width', 'height', 'x', 'y', 'xmlns', 'preserveAspectRatio']);
      const viewBox = symbol.getAttribute('viewBox') || sprite.documentElement.getAttribute('viewBox');
      const parentSvg = use.closest('svg');
      if (viewBox && parentSvg && !parentSvg.hasAttribute('viewBox')) parentSvg.setAttribute('viewBox', viewBox);
      // A symbol establishes its own viewport. Preserve that behavior if use
      // dimensions or a different parent viewBox would otherwise change scale.
      const ownViewport = viewBox && (use.hasAttribute('width') || use.hasAttribute('height') || parentSvg?.getAttribute('viewBox') !== viewBox);
      let content = symbolGroup;
      if (ownViewport) {
        content = document.createElementNS(SVG, 'svg');
        content.setAttribute('viewBox', viewBox);
        content.setAttribute('width', use.getAttribute('width') || '100%');
        content.setAttribute('height', use.getAttribute('height') || '100%');
        content.setAttribute('preserveAspectRatio', symbol.getAttribute('preserveAspectRatio') || 'xMidYMid meet');
        content.append(symbolGroup);
      }
      // Sprite-level defs may contain gradients/clip paths referenced by paths.
      // Copy them as inert data and give each expansion unique local IDs.
      for (const defs of sprite.documentElement.children) if (defs.localName === 'defs') symbolGroup.append(document.importNode(defs, true));
      for (const child of symbol.childNodes) symbolGroup.append(document.importNode(child, true));
      group.append(content);
      for (const element of group.querySelectorAll('script,foreignObject,iframe,object,embed')) element.remove();
      for (const element of [group, ...group.querySelectorAll('*')]) {
        for (const attribute of [...element.attributes]) {
          if (/^on/i.test(attribute.name) || /^(?:javascript|vbscript):/i.test(attribute.value.trim())) element.removeAttributeNode(attribute);
          // Do not import hidden network dependencies from sprite images/styles.
          else if (element.localName !== 'use' && /^(?:href|xlink:href)$/.test(attribute.name) && !/^(?:#|data:)/.test(attribute.value)) element.removeAttributeNode(attribute);
          else if (hasExternalCssUrl(attribute.value)) element.removeAttributeNode(attribute);
        }
      }
      use.replaceWith(group); inlined++;
      for (const nested of [...group.querySelectorAll('use')]) expand(nested, sourceUrl, nextAncestors, { sourceUrl });
      const prefix = `offline-svg-${++sequence}-`;
      const ids = new Map();
      for (const element of group.querySelectorAll('[id]')) { const id = element.id; ids.set(id, prefix + id); element.id = prefix + id; }
      const rewriteLocalCss = value => value.replace(/url\(\s*(["']?)#([^)'"\s]+)\1\s*\)/g, (match, quote, id) => ids.has(id) ? `url(#${ids.get(id)})` : match);
      for (const element of [group, ...group.querySelectorAll('*')]) for (const attribute of [...element.attributes]) {
        let value = attribute.value;
        if (/^(?:href|xlink:href)$/.test(attribute.name) && value.startsWith('#') && ids.has(value.slice(1))) value = '#' + ids.get(value.slice(1));
        value = rewriteLocalCss(value);
        if (value !== attribute.value) element.setAttributeNS(attribute.namespaceURI, attribute.name, value);
      }
      for (const style of group.querySelectorAll('style')) {
        const css = style.textContent.replace(/@import\b[^;]*;/gi, '').replace(cssUrls, (match, double, single, plain) => /^(?:#|data:)/i.test(double ?? single ?? plain) ? match : 'url("")');
        style.textContent = rewriteLocalCss(css);
      }
    } catch (error) { failed(use, href, error); }
  }
  for (const use of [...template.content.querySelectorAll('use')]) {
    if (use.parentNode) expand(use, baseUrl);
  }
  return { html: template.innerHTML, warnings: [...new Set(warnings)], inlined, missing };
}
