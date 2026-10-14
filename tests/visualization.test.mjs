import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {act} from 'react';
import {captureStyleTemplates,mountArchivedComponent} from '../src/runtime.js';
import {extractConversationData} from '../src/extractor.js';
import {captureControlState} from '../src/control-state.js';
function setup(){const dom=new JSDOM('<div id="root"></div>',{virtualConsole:new VirtualConsole()});global.window=dom.window;global.document=dom.window.document;global.DOMParser=dom.window.DOMParser;global.IS_REACT_ACT_ENVIRONMENT=true;return dom.window.document.getElementById('root');}
const fixture=new URL('../fixtures/visualization-live.html',import.meta.url);
test('real slider updates metrics and confusion matrix, chart switch renders live bars, and quiz works',{skip:!fs.existsSync(fixture)},async()=>{
 const original=new JSDOM(fs.readFileSync(fixture,'utf8'),{virtualConsole:new VirtualConsole()}),source=extractConversationData(original.window.document),record=source.components[0],templates=captureStyleTemplates(original.window.document);
 const root=setup();let app;await act(async()=>{app=mountArchivedComponent(root,record,templates);});assert.deepEqual([...app.unsupported],[]);assert.equal(root.querySelectorAll('.recharts-line').length,4);
 const slider=root.querySelector('input[type="range"]');await act(async()=>{slider.value='0.8';slider.dispatchEvent(new window.Event('input',{bubbles:true}));});assert.equal(app.getState().threshold,0.8);assert.ok(root.textContent.includes('92.8%'));assert.ok(root.textContent.includes('51.7%'));assert.ok(root.textContent.includes('155'));
 const mode=root.querySelector('[data-d-component="segmented-control"] [aria-label="样本分布"]');await act(async()=>mode.click());assert.equal(app.getState().chartMode,'counts');assert.equal(root.querySelectorAll('.recharts-bar').length,2);
 const bars=[...root.querySelectorAll('.recharts-bar-rectangle path')].map(n=>n.getAttribute('d'));
 await act(async()=>{slider.value='0.2';slider.dispatchEvent(new window.Event('input',{bubbles:true}));});assert.equal(app.getState().threshold,0.2);assert.notDeepEqual([...root.querySelectorAll('.recharts-bar-rectangle path')].map(n=>n.getAttribute('d')),bars);
 const answer=root.querySelector('[data-d-component="radio"] [value="B"]');assert.ok(answer);await act(async()=>answer.click());assert.equal(app.getState().answer,'B');
 await act(async()=>app.unmount());original.window.close();
});
test('unambiguous live control values initialize saved DIL state without React internals',{skip:!fs.existsSync(fixture)},()=>{
 const dom=new JSDOM(fs.readFileSync(fixture,'utf8'),{virtualConsole:new VirtualConsole()}),record=extractConversationData(dom.window.document).components[0];const node=dom.window.document.querySelector('[data-dil-message-id]'),value=Number(node.querySelector('[role="slider"]').getAttribute('aria-valuenow'));
 const captured=captureControlState(record,node);assert.equal(captured.viewState.threshold,value);assert.equal(captured.viewState.chartMode,'trend');assert.notEqual(captured.viewState,record.viewState);dom.window.close();
});
test('ambiguous multiple controls never overwrite a named state hook',()=>{
 const root=setup();root.innerHTML='<div data-d-component="slider"><span role="slider" aria-valuenow="9"></span></div>';
 const record={viewState:{x:1},code:'const [x,s]=DIL.useState(1,{key:"x"});__dil.jsx("slider",{"value":x});__dil.jsx("slider",{"value":x});'};assert.equal(captureControlState(record,root).viewState.x,1);
});
