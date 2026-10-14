import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {buildArchive,inlineResources,sanitizeHtml} from '../src/archive.js';
const d=new JSDOM('<!doctype html><html></html>',{url:'https://chatgpt.com/c/example'}).window.document;
const base=()=>({document:d,title:'中文 <对话>',url:'https://chatgpt.com/c/example',htmlAttrs:{class:'chatgpt-theme','data-theme':'dark'},styles:[],assets:[],templates:{},messages:[{id:'u',role:'user',html:'<div>测试</div>'},{id:'a',role:'assistant',html:'<p>原版内容</p>',component:{code:'DIL.render(__dil.jsx("text",null,"</script><script>unsafe()</script>"));',constants:{}}}],warnings:[]});
test('单HTML保留消息、原源码和隔离运行器，抵御源码结束script标签',async()=>{
  const {html,report}=await buildArchive(base(),{runtimeSource:'window.ChatGPTOffline={};',fetchAsset:async()=>{throw new Error('unexpected request');}});
  const output=new JSDOM(html).window.document;
  assert.equal(report.messages,2);assert.equal(report.interactive,1);
  assert.equal(output.querySelectorAll('.archive-message').length,2);
  assert.equal(output.querySelector('iframe').getAttribute('sandbox'),'allow-scripts');
  assert.equal(JSON.parse(output.getElementById('archive-data').textContent).components[0].record.code,base().messages[1].component.code);
  assert.ok(output.querySelector('meta[http-equiv]').content.includes("connect-src 'none'"));
  assert.ok(output.querySelector('meta[http-equiv]').content.includes("'unsafe-eval'"),'srcdoc inherits parent CSP and must allow sandbox evaluation');
});
test('静态快照清理脚本、事件和可执行URL，保留form里的正文',()=>{
  const clean=sanitizeHtml(d,'<script>secret()</script><form><p>答案</p><button onclick="bad()">提交</button></form><a href="javascript:bad()">link</a>');
  assert.ok(clean.includes('答案'));assert.ok(!clean.includes('secret'));assert.ok(!clean.includes('onclick'));assert.ok(!clean.includes('javascript:'));
});
test('样式相对资源、重复资源与失败均内联且不残留联网地址',async()=>{
  const snap=base();snap.styles=[{href:'https://chatgpt.com/cdn/style/main.css'}];snap.assets=[{url:'/cdn/font.woff2'}];
  const calls=[];const report={assets:{saved:0,failed:0},warnings:[]};
  const result=await inlineResources(snap,async url=>{calls.push(url);if(url.endsWith('main.css'))return {text:'@font-face{src:url(../font.woff2)}p{background:url("missing.png")}'};if(url.endsWith('font.woff2'))return {dataUrl:'data:font/woff2;base64,AA=='};throw new Error('404');},report);
  assert.equal(calls.filter(u=>u.endsWith('font.woff2')).length,1);assert.ok(result.css.includes('data:font/woff2'));assert.ok(!result.css.includes('missing.png'));assert.equal(report.assets.failed,1);assert.equal(report.warnings.length,1);
});
test('没有源码时明确保留静态快照',async()=>{
  const snapshot=base();delete snapshot.messages[1].component;
  const {html,report}=await buildArchive(snapshot,{runtimeSource:'',fetchAsset:async()=>{}});
  assert.equal(report.interactive,0);assert.equal(report.static,2);assert.ok(report.warnings.length);assert.ok(html.includes('原版内容'));
});
