import {buildArchive} from './archive.js';
import {installTransportBridge} from './transport-bridge.js';
const status=document.getElementById('status');
const tabId=Number(new URL(location.href).searchParams.get('tab'));
const job=crypto.randomUUID();
let blobUrl,filename,cancelled=false;
const check=()=>{if(cancelled)throw new Error('导出已取消');};
const progress=text=>{check();status.textContent=text;};
chrome.runtime.onMessage.addListener(message=>{if(message.type==='archive-progress'&&message.job===job)status.textContent=message.text;});
document.getElementById('cancel').addEventListener('click',()=>{cancelled=true;chrome.tabs.sendMessage(tabId,{type:'archive-cancel'}).catch(()=>{});status.textContent='已取消';});
const download=()=>chrome.downloads.download({url:blobUrl,filename,saveAs:false});
document.getElementById('download').addEventListener('click',download);
window.addEventListener('pagehide',()=>{if(blobUrl)URL.revokeObjectURL(blobUrl);});

async function fetchAsset(url){
  check();
  if(url.startsWith('data:'))return {dataUrl:url};
  const page=await chrome.tabs.get(tabId);
  if(url.startsWith('blob:')||new URL(url).origin===new URL(page.url).origin){
    const response=await chrome.tabs.sendMessage(tabId,{type:'archive-fetch-page-asset',url});
    if(!response.ok)throw new Error(response.error);return response;
  }
  const response=await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const blob=await response.blob();if(blob.size>50*1024*1024)throw new Error('单项资源超过 50 MB');
  const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
  return {dataUrl,text:/css|text|javascript|json/.test(blob.type)?await blob.text():undefined};
}

try{
  if(!Number.isInteger(tabId))throw new Error('缺少对话标签页');
  const sourceTab=await chrome.tabs.get(tabId);
  const conversationId=new URL(sourceTab.url).pathname.match(/\/c\/([^/?]+)/)?.[1];
  if(conversationId)await chrome.scripting.executeScript({target:{tabId},world:'MAIN',func:installTransportBridge,args:[{job,conversationId}]});
  await chrome.scripting.executeScript({target:{tabId},files:['collector.js']});
  const response=await chrome.tabs.sendMessage(tabId,{type:'archive-collect-v2',job});
  if(!response?.ok)throw new Error(response?.error||'页面没有响应');
  check();
  const runtimeSource=await (await fetch(chrome.runtime.getURL('runtime.js'))).text();
  const snapshot={...response.snapshot,document};
  const {html,report}=await buildArchive(snapshot,{runtimeSource,fetchAsset,onProgress:progress});
  check();blobUrl=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
  filename=(snapshot.title||'ChatGPT对话').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,110)+'.html';
  const downloadId=await download();
  await chrome.runtime.sendMessage({type:'archive-finished',job,sourceTabId:tabId,report,filename,downloadId}).catch(()=>{});
  document.getElementById('title').textContent='离线 HTML 已生成';
  status.textContent='下载已开始，可在浏览器下载列表中打开。';
  document.getElementById('summary').textContent=`${report.messages} 条消息 · ${report.interactive} 个交互回答 · ${(new Blob([html]).size/1024/1024).toFixed(1)} MB`;
  document.getElementById('report').textContent=JSON.stringify(report,null,2);
  document.getElementById('result').hidden=false;
}catch(error){
  await chrome.runtime.sendMessage({type:'archive-job-error',job,sourceTabId:tabId,error:error.message,cancelled}).catch(()=>{});
  document.getElementById('title').textContent=cancelled?'导出已取消':'导出未完成';
  const element=document.getElementById('error');element.hidden=false;element.textContent=error.message;
  status.textContent='';
}finally{
  await chrome.scripting.executeScript({target:{tabId},world:'MAIN',func:job=>{if(globalThis.__chatgptOfflineBridge?.job===job)globalThis.__chatgptOfflineBridge.stop();},args:[job]}).catch(()=>{});
  document.getElementById('progress').hidden=true;document.getElementById('cancel').hidden=true;
}
