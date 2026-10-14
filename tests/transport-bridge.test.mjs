import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installTransportBridge} from '../src/transport-bridge.js';

function setup(){
  const listeners=new Set(),posts=[],calls=[];
  const location={href:'https://chatgpt.com/c/chat-1',origin:'https://chatgpt.com'};
  const nativeFetch=async(...args)=>{calls.push(args);return new Response(JSON.stringify({messages:[{id:'m',text:'source'}]}),{headers:{'content-type':'application/json'}});};
  class XHR{open(method,url){this.method=method;this.url=url;}send(){}addEventListener(type,fn){this.listener=fn;}}
  const win={fetch:nativeFetch,location,addEventListener:(t,fn)=>listeners.add(fn),removeEventListener:(t,fn)=>listeners.delete(fn),postMessage:(data,origin)=>posts.push({data,origin})};
  const context=vm.createContext({window:win,globalThis:win,location,XMLHttpRequest:XHR,URL,JSON,WeakMap,Promise,setTimeout,clearTimeout});
  vm.runInContext(`(${installTransportBridge.toString()})({job:'test-job',conversationId:'chat-1'})`,context);
  const dispatch=event=>{for(const listener of listeners)listener(event);};
  const read=()=>{dispatch({source:win,data:{type:'archive-bridge-read',job:'test-job'}});return posts.at(-1)?.data;};
  return {win,read,dispatch,posts,calls,nativeFetch,XHR};
}
const settle=()=>new Promise(r=>setTimeout(r,20));

test('only current conversation GET JSON is retained; request headers remain untouched',async()=>{
  const s=setup();const headers={Authorization:'test-only-placeholder'};
  await s.win.fetch('/backend-api/conversations/chat-1',{headers});
  await s.win.fetch('/backend-api/conversations/chat-10');
  await s.win.fetch('/backend-api/conversations/chat-1',{method:'POST'});
  await s.win.fetch('https://other.example/backend-api/conversations/chat-1');
  await settle();const data=s.read();
  assert.equal(data.payloads.length,1);assert.equal(data.payloads[0].data.messages[0].id,'m');
  assert.equal(s.calls[0][1].headers,headers);assert.equal(JSON.stringify(data).includes('Authorization'),false);
  s.win.__chatgptOfflineBridge.stop();
});
test('XHR pagination is observed and cleanup restores only the functions installed by this export',()=>{
  const s=setup();const xhr=new s.XHR();xhr.open('GET','/backend-api/conversations/chat-1?cursor=older');xhr.send();xhr.status=200;xhr.responseType='json';xhr.response={messages:[{id:'old'}]};xhr.listener();
  assert.equal(s.read().payloads[0].data.messages[0].id,'old');
  const laterPatch=()=>{};s.win.fetch=laterPatch;s.win.__chatgptOfflineBridge.stop();
  assert.equal(s.win.fetch,laterPatch);assert.equal(s.win.__chatgptOfflineBridge,undefined);
});
test('unauthorized message sources and other job IDs cannot request a cache read',()=>{
  const s=setup();
  s.dispatch({source:{},data:{type:'archive-bridge-read',job:'test-job'}});
  s.dispatch({source:s.win,data:{type:'archive-bridge-read',job:'other-job'}});
  assert.equal(s.posts.length,0);s.read();assert.equal(s.posts.length,1);
  s.win.__chatgptOfflineBridge.stop();assert.equal(s.win.fetch,s.nativeFetch);
});
