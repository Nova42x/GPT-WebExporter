import {extractConversationData,mergeConversationSources} from './extractor.js';
import {captureStyleTemplates} from './components.js';
import {sanitizeHtml} from './archive.js';
import {readTransportBridge} from './transport-bridge.js';
import {displayedMessageRoots,restrictToCurrentMessages} from './capture-scope.js';
import {captureControlState} from './control-state.js';

const delay = ms => new Promise(resolve => setTimeout(resolve,ms));

function messageRoots(document) {
  return displayedMessageRoots(document);
}

function messageRole(root) {
  return root.querySelector('[data-conversation-role]')?.getAttribute('data-conversation-role') || root.getAttribute('data-message-author-role') || root.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role') || (/assistant/.test(root.getAttribute('data-turn')||root.getAttribute('data-content-search-unit-key')||'')?'assistant':'user');
}

function messageId(root) {
  return root.getAttribute('data-message-id') || root.getAttribute('data-chatgpt-search-message-ids')?.split(/\s+/)[0] || root.querySelector('[data-message-id]')?.getAttribute('data-message-id') || root.getAttribute('data-content-search-unit-key');
}

function findScrollport(root, document) {
  for(let p=root?.parentElement;p;p=p.parentElement){
    if(p.scrollHeight>p.clientHeight+100 && /auto|scroll/.test(document.defaultView.getComputedStyle(p).overflowY))return p;
  }
  return document.scrollingElement;
}

export async function collectSnapshot(document, {loadHistory=false,onProgress=()=>{},signal,job}={}) {
  const initialPath=document.location?.pathname;
  const assertActive=()=>{if(signal?.aborted)throw new Error('导出已取消');if(document.location?.pathname!==initialPath)throw new Error('导出期间切换了对话，请在目标对话重新导出。');};
  const warnings=[];
  const cached=new Map();
  const remember=()=>messageRoots(document).forEach(root=>{
    const id=messageId(root);const role=messageRole(root);
    if(id&&['user','assistant'].includes(role)){
      const copy=root.cloneNode(true);
      if(role==='user')copy.querySelectorAll('button').forEach(e=>{if(/复制消息|编辑消息|Copy message|Edit message/.test(e.getAttribute('aria-label')||''))e.remove();});
      cached.set(id,{id,role,orderKey:root.getAttribute('data-content-search-unit-key')||root.getAttribute('data-chatgpt-search-unit-key')||'',html:sanitizeHtml(document,copy.outerHTML)});
    }
  });
  remember();
  const currentId=document.location?.pathname?.match(/\/c\/([^/?]+)/)?.[1];
  const refreshSource=async()=>{
    onProgress('刷新当前对话的源码数据');
    const response=await fetch(document.location.href,{credentials:'same-origin',signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const freshDocument=new DOMParser().parseFromString(await response.text(),'text/html');
    const fresh=extractConversationData(freshDocument,{conversationId:currentId});
    if(fresh.conversationId!==currentId)throw new Error('返回的页面未包含当前对话源码');
    return fresh;
  };
  let initialSource=extractConversationData(document,currentId?{conversationId:currentId}:{});
  let refreshed=false;
  if(typeof chrome!=='undefined'&&currentId&&(initialSource.conversationId!==currentId||[...cached.values()].some(m=>m.role==='assistant'&&!initialSource.messages.some(s=>s.id===m.id)))){
    try{initialSource=await refreshSource();refreshed=true;}catch(error){warnings.push(`当前页面源码刷新失败：${error.message}。缺少源码的回答将保留静态快照。`);}
  }
  const initialIds=new Set([...cached.values()].map(m=>m.id));
  const allLoaded=initialSource.messages.length>0&&!initialSource.pageInfo?.has_previous_page&&!initialSource.pageInfo?.has_next_page&&initialSource.messages.every(m=>initialIds.has(m.id));
  const scrollport=findScrollport(messageRoots(document)[0],document);
  const originalTop=scrollport?.scrollTop;
  if(loadHistory&&scrollport&&!allLoaded){
    try {
      let stable=0;
      for(let step=0;step<100;step++){
        assertActive();onProgress(`检查历史消息，已找到 ${cached.size} 条`);
        const count=cached.size,height=scrollport.scrollHeight;
        scrollport.scrollTop=Math.max(0,scrollport.scrollTop-Math.max(400,scrollport.clientHeight*.9));
        await delay(220); remember();
        if(scrollport.scrollTop===0&&count===cached.size&&height===scrollport.scrollHeight)stable++;else stable=0;
        if(stable>=5)break;
        if(step===99)warnings.push('历史消息加载达到时间上限，请核对导出消息数。');
      }
      // Forward pass also captures virtualized turns that unmount while scrolling up.
      for(let step=0;step<150;step++){
        assertActive();remember();
        if(scrollport.scrollTop+scrollport.clientHeight>=scrollport.scrollHeight-3)break;
        scrollport.scrollTop+=Math.max(400,scrollport.clientHeight*.85);await delay(120);
        if(step===149)warnings.push('对话长度超过采集范围，请核对末尾消息。');
      }
      remember();
    } finally {scrollport.scrollTop=originalTop;}
  }
  assertActive();onProgress('提取原版交互源码和状态');
  let source=allLoaded||refreshed?initialSource:extractConversationData(document,currentId?{conversationId:currentId}:{});
  if(job&&document.defaultView){
    const observed=await readTransportBridge(document.defaultView,job);
    warnings.push(...(observed.warnings||[]));
    const pages=(observed.payloads||[]).map(payload=>{
      const match=payload.url.match(/\/message\/([^/]+)\/dil\/view_state$/);
      if(match&&payload.data&&typeof payload.data==='object'&&!Array.isArray(payload.data))return {conversationId:currentId,messages:[],components:[{messageId:match[1],viewState:payload.data.view_state??payload.data}],warnings:[]};
      return extractConversationData(document,{rootsOnly:[payload.data],conversationId:currentId});
    }).filter(page=>page.rawMessageCount||page.components?.length);
    if(pages.length)source=mergeConversationSources([source,...pages],{conversationId:currentId,renderedIds:[...cached.keys()]});
  }
  const missingIds=[...cached.values()].filter(m=>m.role==='assistant'&&!source.messages.some(s=>s.id===m.id));
  if(typeof chrome!=='undefined'&&currentId&&!refreshed&&(source.conversationId!==currentId||missingIds.length)){
    try{
      source=mergeConversationSources([source,await refreshSource()],{conversationId:currentId,renderedIds:[...cached.keys()]});
    }catch(error){warnings.push(`当前页面源码刷新失败：${error.message}。缺少源码的回答将保留静态快照。`);}
  }
  if(currentId&&source.conversationId&&source.conversationId!==currentId){
    warnings.push('页面保留了其他对话的初始化数据，已丢弃该数据，仅保存当前对话内容。');
    source={messages:[],components:[],warnings:[]};
  }
  warnings.push(...(source.warnings||[]));
  const components=source.components||[];
  const sourceMessages=source.messages||[];
  // DOM is the selected branch authority. Source records add ordering and interactions.
  const order=new Map(sourceMessages.map((m,i)=>[m.id||m.messageId,i]));
  assertActive();
  const messages=restrictToCurrentMessages([...cached.values()],source,currentId,warnings);
  if(messages.every(m=>order.has(m.id)))messages.sort((a,b)=>order.get(a.id)-order.get(b.id));
  for(const message of messages){
    if(message.role!=='assistant')continue;
    message.component=components.find(c=>c.messageId===message.id || c.messageIds?.includes(message.id) || c.sourceMessageIds?.includes(message.id));
    const root=messageRoots(document).find(root=>messageId(root)===message.id);
    if(message.component&&root)message.component=captureControlState(message.component,root);
  }
  if(!messages.length)throw new Error('没有找到当前对话消息。请打开完整的 ChatGPT 对话页面，等待回复完成后重试。');
  const streaming=document.querySelector('[data-talvt-turn-state="streaming"],[data-is-streaming="true"],button[data-testid="stop-button"]');
  if(streaming)warnings.push('当前有回复尚未生成完毕；存档只包含导出时已有的内容。');
  const styles=[];
  for(const element of document.querySelectorAll('style,link[rel="stylesheet"]')){
    if(element.tagName==='LINK'){styles.push({href:element.href});continue;}
    let text=element.textContent;
    if(!text&&element.sheet){try{text=[...element.sheet.cssRules].map(rule=>rule.cssText).join('\n');}catch{}}
    if(text)styles.push({text});
  }
  for(const sheet of document.adoptedStyleSheets||[]){try{styles.push({text:[...sheet.cssRules].map(r=>r.cssText).join('\n')});}catch{}}
  const assets=new Map();
  // Templates must have the same boundary as exported messages. Otherwise even
  // unused code/quiz templates from a hidden old chat leak into archive-data.
  const contentScope=document.createElement('div');contentScope.innerHTML=messages.map(m=>m.html).join('\n');
  const add=(url,kind)=>{
    if(!url||url.startsWith('#'))return;
    let absoluteUrl;try{absoluteUrl=new URL(url,document.baseURI).href;}catch{return;}
    assets.set(url,{url,absoluteUrl,kind});
  };
  for(const root of [contentScope]){
    root.querySelectorAll('img').forEach(e=>{add(e.getAttribute('src'),'图片');if(e.currentSrc)add(e.currentSrc,'图片');});
    root.querySelectorAll('video,audio,source').forEach(e=>add(e.src,'媒体'));
    root.querySelectorAll('image').forEach(e=>add(e.getAttribute('href')||e.getAttribute('xlink:href'),'图示'));
    root.querySelectorAll('use').forEach(e=>{const href=e.getAttribute('href')||e.getAttribute('xlink:href');if(href&&!href.startsWith('#'))add(href.split('#')[0],'SVG 图标');});
  }
  const htmlAttrs={};
  for(const key of ['class','lang','dir','data-theme','style']){const value=document.documentElement.getAttribute(key);if(value!==null)htmlAttrs[key]=value;}
  const selectedIds=new Set(messages.map(m=>m.id));
  const selectedRoots=messageRoots(document).filter(root=>selectedIds.has(messageId(root)));
  const renderer=selectedRoots.map(root=>root.querySelector('[data-d-inline-reveal]')).find(Boolean);
  const effectiveTheme=renderer?.closest('[data-theme]')?.getAttribute('data-theme');
  if(effectiveTheme)htmlAttrs['data-theme']=effectiveTheme;
  // Capture inherited variables from the actual answer surface, which may have
  // a different theme from the surrounding ChatGPT app shell.
  if(renderer&&document.defaultView){
    const computed=document.defaultView.getComputedStyle(renderer);
    const vars=Array.from(computed).filter(k=>k.startsWith('--')).map(k=>`${k}:${computed.getPropertyValue(k)};`).join('');
    htmlAttrs.style=(htmlAttrs.style||'')+';'+vars;
  }
  const width=selectedRoots.find(e=>messageRole(e)==='assistant')?.getBoundingClientRect().width;
  const snapshot={version:1,title:source.title||document.title,url:document.location?.href||document.baseURI,width:width>200&&width<1600?width:800,htmlAttrs,messages,styles,assets:[...assets.values()],templates:captureStyleTemplates(document,contentScope),warnings};
  return snapshot;
}

if(typeof chrome!=='undefined'&&chrome.runtime?.onMessage&&globalThis.__chatgptOfflineCollectorProtocol!==2){
  globalThis.__chatgptOfflineCollectorProtocol=2;
  let controller;
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id)return;
    if(message.type==='archive-cancel'){controller?.abort();respond({ok:true});return;}
    if(message.type==='archive-collect-v2'){
      controller=new AbortController();
      collectSnapshot(document,{loadHistory:false,job:message.job,signal:controller.signal,onProgress:text=>chrome.runtime.sendMessage({type:'archive-progress',job:message.job,text}).catch(()=>{})})
        .then(snapshot=>respond({ok:true,snapshot}),error=>respond({ok:false,error:error.message}));
      return true;
    }
    if(message.type==='archive-fetch-page-asset'){
      (async()=>{
        const url=new URL(message.url,document.baseURI);
        if(url.origin!==document.location.origin&&!url.href.startsWith('blob:'))throw new Error('页面资源代理只允许当前站点或 blob 资源');
        const response=await fetch(url,{credentials:'same-origin'});if(!response.ok)throw new Error(`HTTP ${response.status}`);
        const blob=await response.blob();if(blob.size>50*1024*1024)throw new Error('单项资源超过 50 MB');
        const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
        const text=/css|text|javascript|json/.test(blob.type)?await blob.text():undefined;
        return {dataUrl,text};
      })().then(result=>respond({ok:true,...result}),error=>respond({ok:false,error:error.message}));return true;
    }
  });
}
