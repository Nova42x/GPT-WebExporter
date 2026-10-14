import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { decodeRouterStream, extractConversationData, mergeConversationSources } from '../src/extractor.js';

function doc(script, url = 'https://chatgpt.com/c/selected') {
  return new JSDOM(`<script>${script}</script>`, { url }).window.document;
}
const enqueue = value => `window.__reactRouterContext.streamController.enqueue(${JSON.stringify(value)});`;

test('streamed promise records share the global reference table', () => {
  const warnings = [];
  const root = decodeRouterStream([
    '[{"_1":2},"conversation",["P",2]]\n',
    'P2:[{"_4":5,"_6":-5},"title","example","nothing"]\n',
  ], warnings)[0];
  assert.deepEqual(root, { conversation: { title: 'example', nothing: null } });
  assert.deepEqual(warnings, []);
});

test('enqueue chunk boundaries are independent of record boundaries', () => {
  const chunks = ['[{"_1":', '2},"name","value"]\n'];
  assert.deepEqual(decodeRouterStream(chunks), [{ name: 'value' }]);
});

test('embedded script is never evaluated and escaped code survives exactly', () => {
  const code = 'DIL.render("\\n \\u003c/script> 香港 \\" ");';
  const table = [{ _1: 2 }, 'messages', [3], { _4: 5, _6: 7, _8: 9, _10: 11 }, 'id', 'a', 'author', { _12: 13 }, 'content', { _14: 15 }, 'metadata', { _16: 17 }, 'role', 'assistant', 'parts', [18], 'model_dil_v2', { _19: 20, _21: 22 }, 'answer', 'code', code, 'constants', {}];
  const document = doc(enqueue(JSON.stringify(table) + '\n') + 'globalThis.__EXPORTER_EVALUATED__ = true;');
  const result = extractConversationData(document);
  assert.equal(result.components[0].code, code);
  assert.equal(result.messages[0].text, 'answer');
  assert.equal(globalThis.__EXPORTER_EVALUATED__, undefined);
});

test('transport sentinels, references and hostile object keys stay JSON-safe', () => {
  const root = decodeRouterStream(['[{"_1":2,"_3":-7},"__proto__",{"_4":5},"undefined","polluted",true]\n'])[0];
  assert.equal(Object.getPrototypeOf(root), Object.prototype);
  assert.deepEqual(Object.keys(root), ['__proto__', 'undefined']);
  assert.equal(root.__proto__.polluted, true);
  assert.equal({}.polluted, undefined);
  assert.equal(root.undefined, null);
});

test('current_node selects a branch; hidden messages and merged source records are removed', () => {
  const message = (id, role, metadata = {}) => ({ id, author: { role }, content: { parts: [id] }, metadata });
  const conversation = { conversation_id: 'selected', current_node: 'a', mapping: {
    u: { parent: null, message: message('u', 'user') },
    intermediate: { parent: 'u', message: message('intermediate', 'assistant') },
    a: { parent: 'intermediate', message: message('a', 'assistant', { is_merged_message: true, source_message_ids: ['intermediate'], model_dil_v2: { code: 'DIL.render(null)', constants: {} } }) },
    other: { parent: 'u', message: message('other', 'assistant') },
  } };
  const document = new JSDOM(`<script type="application/json">${JSON.stringify({ conversation })}</script>`, { url: 'https://chatgpt.com/c/selected' }).window.document;
  const result = extractConversationData(document);
  assert.deepEqual(result.messages.map(message => message.id), ['u', 'a']);
  assert.deepEqual(result.components.map(component => component.messageId), ['a']);
});

test('malformed or absent data yields warnings instead of running expressions', () => {
  const result = extractConversationData(doc('window.__reactRouterContext.streamController.enqueue(window.attack());'));
  assert.equal(result.components.length, 0);
  assert.ok(result.warnings.some(warning => warning.includes('not executed')));
});

test('page conversation identity wins over unrelated hydration collections; pagination is reported', () => {
  const message = (id, role) => ({ id, author: { role }, content: { parts: [id] } });
  const data = {
    sidebar: { conversation_id: 'other', messages: [message('x', 'user'), message('y', 'assistant'), message('z', 'user')] },
    current: { conversation_id: 'selected', messages: [message('u', 'user')], page_info: { has_previous_page: true } },
  };
  const document = new JSDOM(`<script type="application/json">${JSON.stringify(data)}</script>`, { url: 'https://chatgpt.com/c/selected' }).window.document;
  const result = extractConversationData(document);
  assert.deepEqual(result.messages.map(message => message.id), ['u']);
  assert.equal(result.conversationId, 'selected');
  assert.ok(result.warnings.some(warning => warning.includes('paginated')));
});

test('hidden system/tool/analysis records do not become exported conversation messages', () => {
  const message = (id, role, extras = {}) => ({ id, author: { role }, content: { parts: [id] }, ...extras });
  const data = { messages: [
    message('system', 'system'), message('tool', 'tool'),
    message('analysis', 'assistant', { channel: 'analysis' }),
    message('hidden', 'assistant', { metadata: { is_visually_hidden_from_conversation: true } }),
    message('progress', 'assistant', { channel: 'commentary' }),
    message('answer', 'assistant', { channel: 'final' }),
  ] };
  const document = new JSDOM(`<script type="application/json">${JSON.stringify(data)}</script>`).window.document;
  assert.deepEqual(extractConversationData(document).messages.map(message => message.id), ['answer']);
});

const rawMessage = (id, role, createTime = 1, metadata = {}) => ({ id, author: { role }, content: { content_type: 'text', parts: [id] }, channel: role === 'assistant' ? 'final' : null, create_time: createTime, metadata });
const plainSource = (id, messages, extras = {}) => ({ conversation_id: id, messages, ...extras });
const normalized = (id, messages, extras = {}) => ({ conversationId: id, messages, components: [], warnings: [], pageInfo: {}, rawMessageCount: messages.length, ...extras });

test('rootsOnly selects a small captured API page and ignores every hydration script', () => {
  const stale = plainSource('selected', Array.from({ length: 47 }, (_, index) => rawMessage(`stale-${index}`, 'assistant')));
  const document = new JSDOM(`<script type="application/json">${JSON.stringify(stale)}</script><script>window.__API_ATTACK__ = true; window.__reactRouterContext.streamController.enqueue(window.attack());</script>`, { url: 'https://chatgpt.com/c/selected' }).window.document;
  const incoming = plainSource('selected', [rawMessage('fresh', 'assistant', 2, { model_dil_v2: { code: 'globalThis.__API_ATTACK__ = true; DIL.render(null)', constants: { 0: '<script>attack()</script>' } } })]);
  const result = extractConversationData(document, { rootsOnly: [incoming], conversationId: 'selected' });
  assert.deepEqual(result.messages.map(message => message.id), ['fresh']);
  assert.equal(result.rawMessageCount, 1);
  assert.ok(result.components[0].code.includes('__API_ATTACK__'));
  assert.equal(result.components[0].constants[0], '<script>attack()</script>');
  assert.deepEqual(result.warnings, []);
  assert.equal(globalThis.__API_ATTACK__, undefined);
  assert.equal(document.defaultView.__API_ATTACK__, undefined);
});

test('explicit captured request ID rejects wrong conversations and supports ID-less page payloads', () => {
  const document = doc('');
  const wrong = extractConversationData(document, { rootsOnly: [plainSource('wrong', [rawMessage('other', 'user')])], conversationId: 'selected' });
  assert.deepEqual(wrong.messages, []);
  assert.equal(wrong.conversationId, 'selected');
  assert.ok(wrong.warnings.some(warning => warning.includes('different conversation ID')));
  const result = extractConversationData(document, { rootsOnly: [{ messages: [rawMessage('u', 'user')] }], conversationId: 'selected' });
  assert.equal(result.conversationId, 'selected');
  assert.deepEqual(result.messages.map(message => message.id), ['u']);
});

test('cross-page merging deduplicates overlap, preserves full component inputs and stable chronology', () => {
  const oldComponent = { messageId: 'a', code: 'DIL.render(null)', constants: { 0: 'first', 1: 'second' }, contentReferences: [{ data: { content: 'SQL 1' } }, { data: { content: 'SQL 2' } }], clientDefinedWidgets: { widget: { refIndex: 1 } }, viewState: { quiz: { answers: ['A', 'B'], pending: 1 } }, appData: { opGenui: { componentResults: { quiz: { state: { answers: ['A', 'B'] } } } } } };
  const initial = normalized('selected', [{ id: 'a', role: 'assistant', createTime: 2 }, { id: 'u', role: 'user', createTime: 1 }], { components: [oldComponent], warnings: ['initial-warning'], pageInfo: { has_previous_page: true, start_cursor: 'u' } });
  const later = normalized('selected', [{ id: 'a', role: 'assistant', createTime: 2 }, { id: 'b', role: 'assistant', createTime: 3 }, { id: 'same-time', role: 'user', createTime: 3 }], { components: [{ messageId: 'a', code: 'DIL.render(null)', constants: { 2: 'third' }, contentReferences: [], viewState: { quiz: { answers: [], pending: null } }, appData: { opGenui: { componentResults: { quiz: { state: { answers: [] } } } } } }], pageInfo: { has_previous_page: false, start_cursor: 'a' } });
  const result = mergeConversationSources([initial, later], { renderedIds: ['u', 'a', 'b', 'same-time'] });
  assert.deepEqual(result.messages.map(message => message.id), ['u', 'a', 'b', 'same-time']);
  assert.equal(result.components.length, 1);
  assert.deepEqual(result.components[0].constants, { 0: 'first', 1: 'second', 2: 'third' });
  assert.equal(result.components[0].contentReferences.length, 2);
  assert.equal(result.components[0].clientDefinedWidgets.widget.refIndex, 1);
  assert.deepEqual(result.components[0].viewState.quiz, { answers: [], pending: null });
  assert.deepEqual(result.components[0].appData.opGenui.componentResults.quiz.state.answers, []);
  assert.deepEqual(result.pageInfo, initial.pageInfo);
  assert.equal(result.sourcePageInfos.length, 2);
  assert.ok(result.warnings.includes('initial-warning'));
  assert.equal(initial.components[0].constants[2], undefined);
  assert.equal(initial.components[0].viewState.quiz.answers.length, 2);
});

test('source merging never mixes a different conversation or a different rendered branch', () => {
  const initial = normalized('selected', [{ id: 'u', role: 'user', createTime: 1 }, { id: 'branch-a', role: 'assistant', createTime: 2 }], { components: [{ messageId: 'branch-a', code: 'A', constants: {} }] });
  const otherBranch = normalized('selected', [{ id: 'u', role: 'user', createTime: 1 }, { id: 'branch-b', role: 'assistant', createTime: 2 }], { components: [{ messageId: 'branch-b', code: 'B', constants: {} }] });
  const wrongConversation = normalized('wrong', [{ id: 'branch-a', role: 'assistant', text: 'must not leak' }], { components: [{ messageId: 'branch-a', code: 'WRONG', constants: { 0: 'private' } }] });
  const result = mergeConversationSources([initial, otherBranch, wrongConversation], { renderedIds: new Set(['u', 'branch-a']) });
  assert.equal(result.conversationId, 'selected');
  assert.deepEqual(result.messages.map(message => message.id), ['u', 'branch-a']);
  assert.deepEqual(result.components.map(component => component.code), ['A']);
  assert.ok(!JSON.stringify(result).includes('must not leak'));
  assert.ok(result.warnings.some(warning => warning.includes('different or missing')));
});

test('an explicit merge conversation ID prevents stale initial SSR from choosing the source identity', () => {
  const stale = normalized('wrong', [{ id: 'old', role: 'user' }]);
  const current = normalized('selected', [{ id: 'new', role: 'user', createTime: '2026-10-14T00:00:00Z' }]);
  const result = mergeConversationSources([stale, current], { conversationId: 'selected', renderedIds: ['new'] });
  assert.equal(result.conversationId, 'selected');
  assert.deepEqual(result.messages.map(message => message.id), ['new']);
  assert.equal(result.sourceCount, 1);
});

test('a URL-attributed view_state-only capture refreshes interaction state without erasing its program', () => {
  const initial = normalized('selected', [{ id: 'a', role: 'assistant', createTime: 1 }], { components: [{ messageId: 'a', code: 'DIL.render(null)', constants: { 0: 'complete' }, contentReferences: [{ data: { content: 'SELECT 1' } }], viewState: { quiz: { confirmed_answer_indices: [0, 1] } } }] });
  const stateCapture = normalized('selected', [], { components: [{ messageId: 'a', viewState: { quiz: { confirmed_answer_indices: [], pending_restart_attempt: null } } }] });
  const result = mergeConversationSources([initial, stateCapture], { renderedIds: ['a'] });
  assert.equal(result.components[0].code, 'DIL.render(null)');
  assert.deepEqual(result.components[0].constants, { 0: 'complete' });
  assert.equal(result.components[0].contentReferences.length, 1);
  assert.deepEqual(result.components[0].viewState.quiz.confirmed_answer_indices, []);
});

test('real private MySQL capture preserves all five original interactive answers', async t => {
  let html;
  try { html = await readFile(new URL('../fixtures/mysql-live.html', import.meta.url), 'utf8'); }
  catch { t.skip('Private capture is deliberately absent from distribution.'); return; }
  const document = new JSDOM(html).window.document;
  const result = extractConversationData(document);
  assert.equal(result.rawMessageCount, 47);
  assert.equal(result.components.length, 5);
  assert.equal(result.messages.length, 10);
  assert.deepEqual(result.messages.map(message => message.role), ['user', 'assistant', 'user', 'assistant', 'user', 'assistant', 'user', 'assistant', 'user', 'assistant']);
  assert.deepEqual(result.components.map(component => Object.keys(component.constants).length), [174, 200, 450, 474, 687]);
  assert.ok(result.components.every(component => component.code.includes('DIL.render(') && component.code.includes('DIL.useConstants')));
  assert.ok(result.components[2].viewState.learning_quiz_server_state);
  assert.ok(result.components[0].clientDefinedWidgets);
  assert.equal(result.components[0].contentReferences[0].category, 'code_block');
  assert.equal(result.components[0].contentReferences[0].data.language, 'sql');
  assert.ok(result.components.every(component => component.appData.opGenui));
  assert.ok(JSON.stringify(result).length > 300000);
  assert.deepEqual(result.warnings, []);
});
