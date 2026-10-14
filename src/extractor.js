/* Read-only extraction of ChatGPT's React Router hydration transport.
 * The captured page uses turbo-stream v2: enqueue records append to ONE value
 * table; P<id>: resolves a promise to the first appended value. Object keys
 * (_123) AND values are table references. No page JavaScript is executed.
 */

function put(object, key, value) {
  Object.defineProperty(object, String(key), { value, enumerable: true, writable: true, configurable: true });
}

// A deliberately small JavaScript string-literal reader, not an evaluator.
// JSON.parse handles the normal double-quoted React Router literals; this also
// accepts single quotes and JS-only escapes used by equivalent bundlers.
function readString(source, start) {
  const quote = source[start];
  if (quote !== '"' && quote !== "'") return null;
  let value = '';
  for (let i = start + 1; i < source.length; i++) {
    const char = source[i];
    if (char === quote) return { value, end: i + 1 };
    if (char !== '\\') { value += char; continue; }
    const escape = source[++i];
    if (escape === undefined) return null;
    const simple = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };
    if (Object.hasOwn(simple, escape)) { value += simple[escape]; continue; }
    if (escape === '\n') continue;
    if (escape === '\r') { if (source[i + 1] === '\n') i++; continue; }
    if (escape === 'x' || escape === 'u') {
      let digits;
      if (escape === 'u' && source[i + 1] === '{') {
        const close = source.indexOf('}', i + 2);
        if (close < 0) return null;
        digits = source.slice(i + 2, close); i = close;
      } else {
        const size = escape === 'x' ? 2 : 4;
        digits = source.slice(i + 1, i + 1 + size); i += size;
        if (digits.length !== size) return null;
      }
      if (!/^[\da-f]+$/i.test(digits) || parseInt(digits, 16) > 0x10ffff) return null;
      value += String.fromCodePoint(parseInt(digits, 16)); continue;
    }
    value += escape;
  }
  return null;
}

function streamChunks(script, warnings) {
  const chunks = [];
  const pattern = /\bstreamController\s*\.\s*enqueue\s*\(\s*/g;
  for (const match of script.matchAll(pattern)) {
    const literal = readString(script, match.index + match[0].length);
    if (!literal || !/^\s*\)/.test(script.slice(literal.end))) {
      warnings.push('A hydration enqueue argument was not a literal string; it was not executed.');
      continue;
    }
    chunks.push(literal.value);
  }
  return chunks;
}

/** Decode the flattened v2 transport. Exposed for deterministic format tests.
 * Tagged values are converted to plain JSON data; unsupported tags preserve
 * their type/data and emit warnings instead of executing plugin constructors.
 */
export function decodeRouterStream(chunks, warnings = []) {
  const values = [], roots = [], promises = new Map(), cache = new Map();
  const combined = chunks.join('');
  const lines = combined.split('\n').filter(line => line.trim());
  // Captures normally end each chunk with \n. Also accept complete independent
  // records without a newline; never assume every enqueue is a full record.
  const records = lines.length === 1 && chunks.length > 1 && chunks.every(chunk => {
    try { JSON.parse(chunk.replace(/^[PE]\d+:/, '')); return true; } catch { return false; }
  }) ? chunks : lines;
  for (const line of records) {
    const promise = line.match(/^([PE])(\d+):/);
    try {
      const parsed = JSON.parse(promise ? line.slice(promise[0].length) : line);
      let root;
      if (Array.isArray(parsed)) {
        root = values.length;
        for (const value of parsed) values.push(value);
      } else if (Number.isInteger(parsed)) root = parsed;
      else throw new Error('expected a reference table or reference');
      if (promise) promises.set(Number(promise[2]), { root, rejected: promise[1] === 'E' });
      else roots.push(root);
    } catch (error) {
      warnings.push(`Could not parse a hydration record: ${error.message}`);
    }
  }
  function hydrate(index) {
    if (!Number.isInteger(index)) return null;
    if (index < 0) {
      // v2 constants: HOLE=-1 NAN=-2 -Infinity=-3 -0=-4 NULL=-5
      // +Infinity=-6 UNDEFINED=-7. JSON-safe normalization is intentional.
      return index === -4 ? 0 : null;
    }
    if (cache.has(index)) return cache.get(index);
    if (index >= values.length) { warnings.push(`Unresolved hydration reference ${index}.`); return null; }
    const value = values[index];
    if (value === null || typeof value !== 'object') {
      cache.set(index, value); return value;
    }
    if (Array.isArray(value)) {
      if (typeof value[0] === 'string') {
        const [type, data, extra] = value;
        if (type === 'P') {
          const resolved = promises.get(data);
          if (!resolved) { warnings.push(`Hydration promise ${data} has not resolved.`); cache.set(index, null); return null; }
          if (resolved.rejected) { warnings.push(`Hydration promise ${data} was rejected.`); cache.set(index, null); return null; }
          // A placeholder avoids recursion on a malformed promise cycle.
          cache.set(index, null);
          const result = hydrate(resolved.root); cache.set(index, result); return result;
        }
        if (type === 'Z') return hydrate(data);
        if (['D', 'U', 'B', 'Y'].includes(type)) { cache.set(index, String(data)); return String(data); }
        if (type === 'E' || type === 'R') {
          const result = type === 'E' ? { type: 'Error', message: data, name: extra || 'Error' } : { type: 'RegExp', source: data, flags: extra || '' };
          cache.set(index, result); return result;
        }
        if (type === 'N') {
          const result = {}; cache.set(index, result);
          for (const [key, ref] of Object.entries(data || {})) put(result, hydrate(Number(key.slice(1))), hydrate(ref));
          return result;
        }
        if (type === 'S' || type === 'M') {
          const result = []; cache.set(index, result);
          for (let i = 1; i < value.length; i += type === 'M' ? 2 : 1) result.push(type === 'M' ? [hydrate(value[i]), hydrate(value[i + 1])] : hydrate(value[i]));
          return result;
        }
        // React Router's SingleFetchClassInstance wraps a single plain value.
        if (type === 'SingleFetchClassInstance') return hydrate(data);
        if (type === 'SingleFetchFallback') return null;
        const result = { transportType: type, data: [] }; cache.set(index, result);
        warnings.push(`Unsupported hydration type ${type} was preserved as data.`);
        result.data = value.slice(1).map(hydrate); return result;
      }
      const result = []; cache.set(index, result);
      for (const ref of value) result.push(hydrate(ref));
      return result;
    }
    const result = {}; cache.set(index, result);
    for (const [key, ref] of Object.entries(value)) {
      if (!/^_\d+$/.test(key)) { warnings.push('Hydration object used an unsupported key encoding.'); continue; }
      put(result, hydrate(Number(key.slice(1))), hydrate(ref));
    }
    return result;
  }
  return roots.map(hydrate);
}

function visit(root, callback) {
  const seen = new WeakSet(), queue = [root];
  while (queue.length) {
    const value = queue.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value); callback(value);
    for (const child of Object.values(value)) if (child && typeof child === 'object') queue.push(child);
  }
}

function jsonData(value, ancestors = new WeakSet()) {
  if (value == null || typeof value === 'number' && !Number.isFinite(value)) return null;
  if (typeof value !== 'object') return typeof value === 'bigint' ? String(value) : value;
  if (ancestors.has(value)) return null;
  ancestors.add(value);
  const result = Array.isArray(value) ? value.map(item => jsonData(item, ancestors)) : {};
  if (!Array.isArray(value)) for (const [key, child] of Object.entries(value)) put(result, key, jsonData(child, ancestors));
  ancestors.delete(value); return result;
}

function mappingMessages(conversation, warnings) {
  const mapping = conversation.mapping;
  let node = mapping[conversation.current_node];
  if (!node) { warnings.push('The current branch node was missing from the conversation mapping.'); return []; }
  const branch = [], seen = new Set();
  while (node && !seen.has(node)) {
    seen.add(node); if (node.message) branch.push(node.message);
    if (!node.parent) break;
    const parent = mapping[node.parent];
    if (!parent) { warnings.push('The conversation branch has an unloaded ancestor.'); break; }
    node = parent;
  }
  return branch.reverse();
}

function contentText(message) {
  const content = message.content || {};
  if (typeof content === 'string') return content;
  if (typeof content.text === 'string') return content.text;
  if (typeof content.content === 'string') return content.content;
  return (content.parts || []).map(part => typeof part === 'string' ? part : part?.text || '').filter(Boolean).join('\n');
}

/** @returns {{components: object[], messages: object[], warnings: string[]}}
 * messages contains the visible user/assistant messages of the selected branch.
 * rawMessageCount counts transport messages, including internal/tool messages.
 * components retain the ORIGINAL compiled code and complete component inputs.
 */
export function extractConversationData(document, options = {}) {
  const warnings = [], chunks = [], roots = [];
  const rootsOnly = Object.hasOwn(options, 'rootsOnly');
  if (rootsOnly) {
    if (Array.isArray(options.rootsOnly)) roots.push(...options.rootsOnly);
    else warnings.push('rootsOnly must be an array of captured plain JSON roots.');
  } else {
    for (const script of document.querySelectorAll('script')) {
      const text = script.textContent || '';
      chunks.push(...streamChunks(text, warnings));
      if (script.type === 'application/json' || script.id === '__NEXT_DATA__') {
        try { roots.push(JSON.parse(text)); } catch { /* unrelated/non-JSON script */ }
      }
    }
    if (chunks.length) roots.push(...decodeRouterStream(chunks, warnings));
  }
  const candidates = [];
  for (const root of roots) visit(root, value => {
    if (Array.isArray(value.messages) && (!value.messages.length || value.messages.some(message => (message?.author || message?.role) && message?.content))) candidates.push(value);
    else if (value.mapping && value.current_node && typeof value.mapping === 'object') candidates.push(value);
  });
  const pageId = options.conversationId || document.location?.pathname?.match(/\/(?:c|share)\/([^/?]+)/)?.[1];
  const idOf = value => value.conversation_id || value.conversationId || value.id || null;
  const accepted = options.conversationId ? candidates.filter(value => !idOf(value) && rootsOnly || idOf(value) === options.conversationId) : candidates;
  if (options.conversationId && candidates.some(value => idOf(value) && idOf(value) !== options.conversationId)) warnings.push('Captured conversation data with a different conversation ID was ignored.');
  accepted.sort((a, b) => {
    const matching = value => pageId && idOf(value) === pageId ? 1 : 0;
    return matching(b) - matching(a) || (b.messages?.length || Object.keys(b.mapping || {}).length) - (a.messages?.length || Object.keys(a.mapping || {}).length);
  });
  const conversation = accepted[0];
  if (!conversation) return { components: [], messages: [], warnings: [...new Set([...warnings, 'No conversation hydration data was found; rendered DOM remains available.'])], rawMessageCount: 0, conversationId: options.conversationId || null, pageInfo: {} };
  const rawMessages = conversation.mapping ? mappingMessages(conversation, warnings) : conversation.messages;
  if (conversation.page_info?.has_previous_page || conversation.page_info?.has_next_page) warnings.push('Conversation hydration is paginated; additional messages must be loaded before export.');
  const mergedSources = new Set(rawMessages.filter(message => message.metadata?.is_merged_message).flatMap(message => message.metadata.source_message_ids || []));
  // The transport includes brief progress/commentary DIL even when the main UI
  // displays only the completed final answer. Keep commentary if it is actually
  // rendered, or if that user turn has not yet produced a final response.
  const renderedIds = new Set();
  for (const element of document.querySelectorAll('[data-dil-message-id], [data-message-id], [data-chatgpt-selection-message-id], [data-chatgpt-search-message-ids]')) {
    for (const attribute of ['data-dil-message-id', 'data-message-id', 'data-chatgpt-selection-message-id', 'data-chatgpt-search-message-ids']) {
      for (const id of (element.getAttribute(attribute) || '').split(/\s+/).filter(Boolean)) renderedIds.add(id);
    }
  }
  const completedCommentary = new Set();
  let turnCommentary = [];
  for (const message of rawMessages) {
    if (message.author?.role === 'user') turnCommentary = [];
    else if (message.channel === 'commentary') turnCommentary.push(message.id);
    else if (message.author?.role === 'assistant' && message.channel === 'final') {
      for (const id of turnCommentary) if (!renderedIds.has(id)) completedCommentary.add(id);
    }
  }
  const components = [], messages = [], seen = new Set();
  for (const message of rawMessages) {
    const role = message.author?.role || message.role;
    const metadata = message.metadata || {};
    const type = message.content?.content_type;
    if (!['user', 'assistant'].includes(role) || metadata.is_visually_hidden_from_conversation || mergedSources.has(message.id) || completedCommentary.has(message.id)) continue;
    if (['thoughts', 'reasoning_recap', 'reasoning'].includes(type) || message.channel === 'analysis' || message.recipient && message.recipient !== 'all') continue;
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    const dil = metadata.model_dil_v2;
    const normalized = {
      id: message.id, role, channel: message.channel ?? null,
      text: contentText(message), content: jsonData(message.content),
      createTime: message.create_time ?? null,
      sourceMessageIds: jsonData(metadata.source_message_ids || []),
      hasInteractiveComponent: !!dil?.code,
    };
    messages.push(normalized);
    if (typeof dil?.code === 'string') components.push({
      messageId: message.id, role, channel: message.channel ?? null,
      code: dil.code, constants: jsonData(dil.constants || {}),
      viewState: jsonData(metadata.view_state || {}), appData: jsonData(dil.appData || {}),
      clientDefinedWidgets: jsonData(dil.clientDefinedWidgets || {}),
      contentReferences: jsonData(metadata.content_references || []),
      codeBlocks: jsonData(metadata.code_blocks || {}),
      requiredComponents: jsonData(dil.requiredComponents || []),
      fallbackMarkdown: dil.fallbackMarkdown || normalized.text,
      fallbackMarkdownVersion: dil.fallbackMarkdownVersion ?? null,
      sourceMessageIds: normalized.sourceMessageIds,
      genuiComponents: jsonData(metadata.genui_components || []),
    });
  }
  return {
    components, messages, warnings: [...new Set(warnings)],
    title: conversation.title || document.title || 'ChatGPT conversation',
    conversationId: idOf(conversation) || pageId || null,
    currentNode: conversation.current_node || null,
    rawMessageCount: rawMessages.length,
    pageInfo: jsonData(conversation.page_info || {}),
  };
}

// The same message appears in overlapping pages and repeated captures. Arrays
// such as contentReferences and genuiComponents have INDEX semantics (widgets
// hold refIndex), so never union/reorder them. Prefer the more complete array;
// for equal-size records use the latest capture. Object inputs merge by key.
function mergeCapturedData(previous, incoming) {
  if (incoming == null || incoming === '') return jsonData(previous);
  if (previous == null) return jsonData(incoming);
  if (Array.isArray(previous) && Array.isArray(incoming)) return jsonData(incoming.length >= previous.length ? incoming : previous);
  if (typeof previous === 'object' && typeof incoming === 'object' && !Array.isArray(previous) && !Array.isArray(incoming)) {
    const result = jsonData(previous);
    for (const [key, value] of Object.entries(incoming)) put(result, key, Object.hasOwn(result, key) ? mergeCapturedData(result[key], value) : jsonData(value));
    return result;
  }
  return jsonData(incoming);
}

function sortTimestamp(message) {
  const value = message.createTime;
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return Infinity;
}

function mergeCurrentState(previous, incoming) {
  if (incoming && previous && typeof incoming === 'object' && typeof previous === 'object' && !Array.isArray(incoming) && !Array.isArray(previous)) {
    const result = jsonData(previous);
    for (const [key, value] of Object.entries(incoming)) put(result, key, mergeCurrentState(result[key], value));
    return result;
  }
  return jsonData(incoming);
}

/** Merge normalized extraction results from the SAME conversation only.
 * sources are ordered oldest capture to newest; renderedIds is the accumulated
 * DOM-selected branch authority, not just the currently mounted virtual window.
 * The first matching source's warnings/pageInfo remain intact. Page histories
 * are retained separately so a partial page cannot conceal completeness flags.
 */
export function mergeConversationSources(sources, options = {}) {
  const input = (sources || []).filter(source => source && typeof source === 'object');
  const conversationId = options.conversationId || input.find(source => source.conversationId)?.conversationId || null;
  const accepted = input.filter(source => source.conversationId === conversationId && conversationId !== null);
  const initial = accepted[0] || {};
  const warnings = accepted.flatMap(source => source.warnings || []);
  if (input.length !== accepted.length) warnings.push('Conversation sources with a different or missing conversation ID were ignored.');
  const renderedIds = options.renderedIds == null ? null : new Set(options.renderedIds);
  const allowed = id => !!id && (!renderedIds || renderedIds.has(id));
  const messagesById = new Map(), componentsById = new Map(), insertionOrder = new Map();
  for (const source of accepted) {
    for (const message of source.messages || []) {
      const id = message.id || message.messageId;
      if (!allowed(id)) continue;
      if (!insertionOrder.has(id)) insertionOrder.set(id, insertionOrder.size);
      const merged = mergeCapturedData(messagesById.get(id), message);
      merged.id = id; messagesById.set(id, merged);
    }
    for (const component of source.components || []) {
      const id = component.messageId || component.id;
      if (!allowed(id)) continue;
      const previous = componentsById.get(id);
      let merged;
      if (previous?.code && component.code && previous.code !== component.code) {
        // A changed program can reuse constant indices for different values.
        // Keep its inputs as a unit, rather than quietly creating a hybrid.
        if (Object.keys(component.constants || {}).length) merged = jsonData(component);
        else { merged = jsonData(previous); warnings.push(`A newer incomplete program for message ${id} did not replace its complete captured component.`); }
      } else {
        merged = mergeCapturedData(previous, component);
        for (const key of ['viewState', 'appData']) if (Object.hasOwn(component, key)) merged[key] = mergeCurrentState(previous?.[key], component[key]);
      }
      merged.messageId = id; componentsById.set(id, merged);
    }
  }
  const messages = [...messagesById.values()].sort((a, b) => sortTimestamp(a) - sortTimestamp(b) || insertionOrder.get(a.id) - insertionOrder.get(b.id));
  const order = new Map(messages.map((message, index) => [message.id, index]));
  const components = [...componentsById.values()].sort((a, b) => (order.get(a.messageId) ?? Infinity) - (order.get(b.messageId) ?? Infinity));
  for (const message of messages) if (componentsById.get(message.id)?.code) message.hasInteractiveComponent = true;
  return {
    ...jsonData(initial), conversationId, messages, components,
    warnings: [...new Set(warnings)],
    pageInfo: jsonData(initial.pageInfo || {}),
    sourcePageInfos: accepted.map(source => jsonData(source.pageInfo || {})),
    sourceRawMessageCounts: accepted.map(source => source.rawMessageCount ?? source.messages?.length ?? 0),
    rawMessageCount: Math.max(messages.length, ...accepted.map(source => source.rawMessageCount || 0)),
    sourceCount: accepted.length,
  };
}
