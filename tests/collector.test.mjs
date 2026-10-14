import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {collectSnapshot} from '../src/collector.js';
import {extractConversationData} from '../src/extractor.js';
const msg=(id,role,text,extra={})=>({id,author:{role},content:{content_type:'text',parts:[text]},metadata:extra});
const turn=(id,role,text)=>`<div data-content-search-unit-key="${id}:${role}" data-message-id="${id}"><h4 data-conversation-role="${role}"></h4>${text}</div>`;
function page(body,messages=[msg('u','user','current question'),msg('a','assistant','current answer')],options={}){return new JSDOM(`<title>Current</title>${body}<script type="application/json">${JSON.stringify({conversation_id:'current',title:'Current',messages,...options}).replace(/</g,'\\u003c')}</script>`,{url:'https://chatgpt.com/c/current',virtualConsole:new VirtualConsole()});}

test('only active main messages are exported; hidden panels and sidebar templates cannot leak',async()=>{
 const dom=page(`<aside>${turn('s','user','SIDEBAR SECRET')}<pre>SIDEBAR CODE</pre></aside><main hidden>${turn('h','assistant','HIDDEN SECRET')}<pre>HIDDEN CODE</pre></main><main>${turn('u','user','current question')}${turn('a','assistant','current answer')}<div style="display:none">${turn('x','assistant','CSS HIDDEN SECRET')}<pre>CSS HIDDEN CODE</pre></div></main>`);
 const snapshot=await collectSnapshot(dom.window.document);assert.deepEqual(snapshot.messages.map(m=>m.id),['u','a']);assert.ok(!JSON.stringify(snapshot).includes('SECRET'));assert.equal(Object.keys(snapshot.templates.codeBlocks).length,0);dom.window.close();
});
test('stale visible turns from SPA navigation are rejected, without relabeling an old user ID',async()=>{
 const dom=page(`<main>${turn('old-u','user','PREVIOUS VOICE SECRET')}${turn('old-a','assistant','OLD VOICE ANSWER <pre>OLD SECRET CODE</pre>')}${turn('u','user','current question')}${turn('a','assistant','current answer')}</main>`);
 const snapshot=await collectSnapshot(dom.window.document);assert.deepEqual(snapshot.messages.map(m=>m.id),['u','a']);assert.ok(!JSON.stringify(snapshot).includes('SECRET'));assert.equal(snapshot.warnings.length,1);dom.window.close();
});
test('paginated metadata never justifies including unrelated message IDs',async()=>{
 const dom=page(`<main>${turn('old-u','user','PREVIOUS SECRET')}${turn('u','user','current question')}${turn('a','assistant','current answer')}</main>`,undefined,{page_info:{has_previous_page:true}});
 const snapshot=await collectSnapshot(dom.window.document);assert.deepEqual(snapshot.messages.map(m=>m.id),['u','a']);dom.window.close();
});
test('export does not scroll to expand historical context by default',async()=>{
 const dom=page(`<main>${turn('u','user','current question')}${turn('a','assistant','current answer')}</main>`,undefined,{page_info:{has_previous_page:true}});
 Object.defineProperty(dom.window.document.documentElement,'scrollTop',{get:()=>0,set:()=>{throw new Error('must not scroll')}});
 const snapshot=await collectSnapshot(dom.window.document);assert.equal(snapshot.messages.length,2);dom.window.close();
});
test('unmatched assistant code is never attached by array order',async()=>{
 const dom=page(`<main>${turn('a','assistant','current answer')}</main>`,[msg('different','assistant','other code',{model_dil_v2:{code:'DIL.render(__dil.jsx("text",null,"SECRET"));'}})]);
 await assert.rejects(collectSnapshot(dom.window.document),/没有找到当前对话消息/);dom.window.close();
});
test('actual visualization page exports exactly its two displayed messages with exact source IDs',{skip:!fs.existsSync(new URL('../fixtures/visualization-live.html',import.meta.url))},async()=>{
 const dom=new JSDOM(fs.readFileSync(new URL('../fixtures/visualization-live.html',import.meta.url),'utf8'),{virtualConsole:new VirtualConsole()});const source=extractConversationData(dom.window.document);dom.reconfigure({url:`https://chatgpt.com/c/${source.conversationId}`});
 const snapshot=await collectSnapshot(dom.window.document);assert.equal(snapshot.messages.length,2);assert.equal(snapshot.title,source.title);assert.deepEqual(snapshot.messages.map(m=>m.id),source.messages.map(m=>m.id));assert.equal(snapshot.messages[1].component.messageId,snapshot.messages[1].id);dom.window.close();
});
