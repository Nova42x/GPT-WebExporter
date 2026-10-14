import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {act} from 'react';
import {extractConversationData} from '../src/extractor.js';
import {captureStyleTemplates,mountArchivedComponent} from '../src/runtime.js';

const fixture=new URL('../fixtures/mysql-live.html',import.meta.url);
const available=fs.existsSync(fixture);
const doc=available?new JSDOM(fs.readFileSync(fixture,'utf8'),{virtualConsole:new VirtualConsole()}).window.document:null;
const records=doc?extractConversationData(doc).components:[];
const templates=doc?captureStyleTemplates(doc):{};
function setup(){const dom=new JSDOM('<!doctype html><div id="root"></div>');global.window=dom.window;global.document=dom.window.document;global.DOMParser=dom.window.DOMParser;global.IS_REACT_ACT_ENVIRONMENT=true;return dom.window.document.getElementById('root');}
async function mount(record,options){let app;const root=setup();await act(async()=>{app=mountArchivedComponent(root,record,templates,options);});return {root,app};}
async function click(button){assert.ok(button,'expected control');await act(async()=>{button.click();});}
function button(root,text){return [...root.querySelectorAll('button')].find(n=>n.textContent===text);}

test('all five genuine components compile, mount, and cover every generated element type',{skip:!available},async()=>{
 assert.equal(records.length,5);
 for(const record of records){const {root,app}=await mount(record);assert.equal(root.querySelector('[data-offline-runtime-error]'),null);assert.deepEqual([...app.unsupported],[]);assert.ok(root.textContent.length>1000);if(record.code.includes('__dil.jsx("svg"'))assert.ok(root.querySelector('[data-d-component="svg"]'));assert.equal(root.querySelector('[data-offline-pending]'),null);await act(async()=>app.unmount());}
});
test('SQL WHERE changes table rows through the archived original handler',{skip:!available},async()=>{
 const rec=records.find(r=>r.code.includes('querySteps'));
 const {root,app}=await mount(rec);
 const b=button(root,'WHERE');assert.ok(b);assert.equal(b.dataset.color,'secondary');await click(b);assert.equal(b.dataset.color,'primary');
 assert.equal(app.getState().logicalStep,'WHERE');
 const tables=[...root.querySelectorAll('[data-d-component="table"]')];assert.ok(tables.some(t=>t.querySelectorAll('tr').length===3&&t.textContent.includes('李四')&&t.textContent.includes('王五')));
 await act(async()=>app.unmount());
});
test('locking controls, radio groups, quiz submit/reset and FAQ preserve original state',{skip:!available},async()=>{
 const rec=records.find(r=>r.code.includes('heldLock'));
 const {root,app}=await mount(rec);
 await click(button(root,'普通 SELECT'));assert.equal(app.getState().requestedLock,'plain');assert.ok(root.textContent.includes('可以继续'));
 const radio=root.querySelector('[role="radio"][value="0"]');if(radio){await click(radio);assert.equal(radio.getAttribute('aria-checked'),'true');}
 for(const group of root.querySelectorAll('[role="radiogroup"]'))await click(group.querySelector('[role="radio"]'));
 await click(button(root,'提交答案并查看解析'));assert.equal(app.getState().lockingSubmitted,true);assert.ok(root.textContent.includes('正确答案'));
 await click(button(root,'重新练习'));assert.equal(app.getState().lockingSubmitted,false);assert.deepEqual(app.getState().lockingAnswers,{});
 const faq=[...root.querySelectorAll('[data-d-component="pressable"]')].find(n=>n.textContent.includes('2. InnoDB'));await click(faq);assert.equal(app.getState().lockFaqOpen,1);
 await act(async()=>app.unmount());
});
test('resolved SQL widgets preserve complete text, original highlighter markup, renderer and theme',{skip:!available},async()=>{
 for(const record of records){const {root,app}=await mount(record);assert.equal(root.className,templates.root.className);assert.equal(root.parentElement.getAttribute('data-theme'),'light');for(const ref of record.contentReferences.filter(r=>r.category==='code_block'))assert.ok(root.textContent.includes(ref.data.content),`missing ${ref.data.content.slice(0,40)}`);assert.ok(root.querySelector('.text-codex-syntax-keyword'));await act(async()=>app.unmount());}
});
test('native quiz preserves selected server answer and supports fresh eight-question single/multi/binary attempt',{skip:!available},async()=>{
 const rec=records[2],server=Object.values(rec.appData.opGenui.componentResults).find(c=>c.componentName==='LearningQuiz').state;
 const {root,app}=await mount(rec);
 let quiz=root.querySelector('[data-offline-learning-quiz]');
 assert.ok(quiz.textContent.includes('4/8'));assert.equal(quiz.querySelector('[data-quiz-value="C"]').getAttribute('aria-pressed'),'true');
 const original=new JSDOM(templates.quizTemplates[rec.messageId]).window.document;const shell=original.querySelector('[data-d-has-border]');const restored=quiz.querySelector('[data-d-has-border]');assert.equal(restored.className,shell.className);assert.equal(restored.getAttribute('style'),shell.getAttribute('style'));assert.equal(quiz.querySelector('[aria-label="上一题"]').className,original.querySelector('[aria-label="上一题"]').className);assert.ok(quiz.querySelector('[aria-label="提示"] svg path'));assert.ok(quiz.querySelector('[aria-label="分享"] svg path'));
 await click(button(quiz,'重新练习'));
 for(let index=0;index<8;index++){
   quiz=root.querySelector('[data-offline-learning-quiz]');assert.ok(quiz.textContent.includes(`${index+1}/8`));
   for(const value of server.questions[index].correct_values)await click(quiz.querySelector(`[data-quiz-value="${value}"]`));
   await click(button(quiz,'检查答案'));for(const value of server.questions[index].correct_values){const option=quiz.querySelector(`[data-quiz-value="${value}"]`);assert.equal(option.getAttribute('aria-disabled'),'true');assert.ok(option.querySelector('[style*="green-500"]'));assert.ok(option.textContent.includes(server.questions[index].options.find(o=>o.value===value).feedback));}await click(button(quiz,'下一步'));
 }
 assert.ok(quiz.textContent.includes('答对 8 / 8 题'));await click(button(quiz,'重新练习'));assert.ok(quiz.textContent.includes('1/8'));await act(async()=>app.unmount());
});
test('follow-up buttons expose the complete original prompt locally and citation popovers retain source URLs',{skip:!available},async()=>{
 const actions=[],{root,app}=await mount(records[4],{onAction:a=>actions.push(a)});
 await click([...root.querySelectorAll('button')].find(b=>b.textContent.includes('继续第六阶段')));assert.equal(actions.length,1);assert.ok(actions[0].prompt.includes('两阶段提交'));
 assert.equal(root.ownerDocument.querySelector('#offline-followup-prompt textarea').value,actions[0].prompt);
 const cite=root.querySelector('[data-offline-citation]');await click(cite);assert.ok(cite.querySelector('a[href^="https://dev.mysql.com/"]'));await act(async()=>app.unmount());
});
test('a handled open-link action reaches the parent callback and follow-ups remain local',{skip:!available},async()=>{
 const actions=[],{root,app}=await mount(records[4],{onAction:a=>{actions.push(a);return a.type==='open-link';}});const cite=root.querySelector('[data-offline-citation]');await click(cite);await click(cite.querySelector('a'));assert.equal(actions[0].type,'open-link');assert.ok(actions[0].url.startsWith('https://dev.mysql.com/'));assert.equal(root.ownerDocument.querySelector('#offline-followup-prompt'),null);await click([...root.querySelectorAll('button')].find(b=>b.textContent.includes('继续第六阶段')));assert.equal(root.ownerDocument.querySelector('#offline-followup-prompt textarea').value,actions[1].prompt);await act(async()=>app.unmount());
});
test('React render failure calls onError and never reports onReady',async()=>{
 const errors=[],ready=[];const root=setup(),previous=console.error;console.error=()=>{};try{await act(async()=>mountArchivedComponent(root,{code:'DIL.render(__dil.jsx(()=>{throw new Error("broken fixture")}));'}, {},{onError:e=>errors.push(e),onReady:r=>ready.push(r)}));}finally{console.error=previous;}assert.equal(errors.length,1);assert.equal(ready.length,0);assert.ok(root.querySelector('[data-offline-runtime-error]'));
});
test('original SQL toolbar toggles wrapping, scrolls, and copies exact archived SQL',{skip:!available},async()=>{
 const {root,app}=await mount(records[0]);const block=root.querySelector('[data-offline-code-block]');
 const pre=block.querySelector('pre'),wrap=block.querySelector('[aria-label="启用自动换行"]');
 assert.equal(pre.style.whiteSpace,'pre');await click(wrap);assert.equal(pre.style.whiteSpace,'pre-wrap');assert.equal(wrap.getAttribute('aria-pressed'),'true');await click(wrap);assert.equal(pre.style.whiteSpace,'pre');
 const copied=[];Object.defineProperty(root.ownerDocument.defaultView.navigator,'clipboard',{configurable:true,value:{writeText:async value=>copied.push(value)}});
 await click(block.querySelector('[aria-label="复制"]'));assert.deepEqual(copied,[records[0].contentReferences[0].data.content]);
 const scroll=block.querySelector('.chatgpt-code-scrollport');Object.defineProperty(scroll,'scrollHeight',{value:500});await click(block.querySelector('[aria-label="滚动到底部"]'));assert.equal(scroll.scrollTop,500);
 await act(async()=>app.unmount());
});
test('SQL copy falls back to selected textarea and local copy command when clipboard permission fails',{skip:!available},async()=>{
 const {root,app}=await mount(records[0]);const block=root.querySelector('[data-offline-code-block]');
 Object.defineProperty(root.ownerDocument.defaultView.navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('denied');}}});let copied;
 root.ownerDocument.execCommand=command=>{assert.equal(command,'copy');copied=root.ownerDocument.querySelector('textarea').value;return true;};
 await click(block.querySelector('[aria-label="复制"]'));assert.equal(copied,records[0].contentReferences[0].data.content);assert.equal(root.ownerDocument.querySelector('textarea'),null);await act(async()=>app.unmount());
});
test('citation popover does not emit executable or local-file URLs',async()=>{
 const {root,app}=await mount({code:'DIL.render(__dil.jsx(Cite,{__resolutionId:"cite"}));',appData:{opGenui:{componentResults:{cite:{state:{items:[{url:'javascript:alert(1)',source_label:'source',title:'bad'},{url:'file:///C:/private',title:'local'},{url:'https://example.com/source',title:'valid'}]}}}}}});
 await click(root.querySelector('[data-offline-citation]'));assert.deepEqual([...root.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')),['https://example.com/source']);await act(async()=>app.unmount());
});
test('saved keyed view state initializes actual interactive controls',async()=>{
 const {root,app}=await mount({constants:{},viewState:{demo:5},code:'DIL.render(__dil.jsx(()=>{const [v,s]=DIL.useState(1,{key:"demo"});return __dil.jsx("button",{onClick:()=>s(v+1)},v)}));'});
 assert.equal(root.textContent,'5');await click(root.querySelector('button'));assert.equal(app.getState().demo,6);await act(async()=>app.unmount());
});

test('radio orientation uses original CSS row/col tokens and vertical choices remain interactive',async()=>{
 const code='DIL.render(__dil.jsx(()=>{const [v,s]=DIL.useState("a",{key:"answer"});return __dil.jsx("box",null,__dil.jsx("radio-group",{direction:"vertical",value:v,onChange:s},__dil.jsx("radio",{value:"a"},"A"),__dil.jsx("radio",{value:"b"},"B")),__dil.jsx("radio-group",{direction:"horizontal"},__dil.jsx("radio",{value:"a"},"A")))}));';
 const {root,app}=await mount({code});const groups=root.querySelectorAll('[role="radiogroup"]');
 assert.equal(groups[0].getAttribute('data-direction'),'col');assert.equal(groups[1].getAttribute('data-direction'),'row');
 await click(groups[0].querySelector('[value="b"]'));assert.equal(app.getState().answer,'b');await act(async()=>app.unmount());
});

test('semantic surface tokens and full radius retain the visible quiz progress track',async()=>{
 const {root,app}=await mount({code:'DIL.render(__dil.jsx("box",{background:"surface-tertiary",height:"6px",radius:"full",clip:true},__dil.jsx("box",{background:"rgba(34,120,204,0.85)",height:"100%",width:"10%"})));'});
 const track=root.querySelector('[data-d-component="box"]');assert.equal(track.style.backgroundColor,'var(--color-surface-tertiary)');assert.equal(track.style.borderRadius,'9999px');assert.equal(track.style.height,'6px');assert.equal(track.style.overflow,'hidden');assert.equal(track.firstElementChild.style.width,'10%');await act(async()=>app.unmount());
});

test('default grid items keep each label and widget in one cell; explicit transparent remains supported',async()=>{
 const {root,app}=await mount({code:'DIL.render(__dil.jsx("grid",{columns:2,gap:3},__dil.jsx("grid-item",null,__dil.jsx("text",null,"Connection A"),__dil.jsx("text",null,"SQL A")),__dil.jsx("grid-item",{variant:"transparent"},__dil.jsx("text",null,"Connection B")),__dil.jsx("grid-item",null,__dil.jsx("text",null,"Single child"))));'});
 const items=root.querySelectorAll('[data-d-component="grid-item"]');assert.equal(items[0].hasAttribute('data-d-variant'),false);assert.equal(items[0].style.gap,'');assert.equal(items[0].getAttribute('data-d-direction'),'col');assert.equal(items[0].children.length,2);assert.equal(items[1].getAttribute('data-d-variant'),'transparent');assert.equal(items[2].getAttribute('data-d-variant'),'transparent');await act(async()=>app.unmount());
});

test('real MySQL radio and grid layout attributes match the original page across all five answers',{skip:!available},async()=>{
 for(const record of records){const original=doc.querySelector(`[data-dil-message-id="${record.messageId}"]`),{root,app}=await mount(record);
  const originalGroups=[...original.querySelectorAll('[data-d-component="radio-group"]')],groups=[...root.querySelectorAll('[data-d-component="radio-group"]')];assert.equal(groups.length,originalGroups.length);
  groups.forEach((g,i)=>assert.equal(g.getAttribute('data-direction'),originalGroups[i].getAttribute('data-direction')));
  const originalItems=[...original.querySelectorAll('[data-d-component="grid-item"]')],items=[...root.querySelectorAll('[data-d-component="grid-item"]')];assert.equal(items.length,originalItems.length);
  items.forEach((item,i)=>{assert.equal(item.getAttribute('data-d-variant'),originalItems[i].getAttribute('data-d-variant'),`${record.messageId} item ${i} children ${item.children.length}/${originalItems[i].children.length}: ${item.textContent.slice(0,80)}`);assert.equal(item.style.gap,originalItems[i].style.gap);});
  await act(async()=>app.unmount());
 }
});
