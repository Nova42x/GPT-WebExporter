import {inlineSvgUses} from './svg-assets.js';
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jsonForHtml = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export function sanitizeHtml(document, html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('script,iframe,object,embed,base,link,meta').forEach(e => e.remove());
  template.content.querySelectorAll('form').forEach(e=>e.replaceWith(...e.childNodes));
  template.content.querySelectorAll('*').forEach(e => {
    for (const a of [...e.attributes]) {
      if (/^on/i.test(a.name) || /^(?:srcdoc|nonce|integrity)$/i.test(a.name) || /^(?:javascript|vbscript):/i.test(a.value.trim())) e.removeAttribute(a.name);
    }
    if (e.tagName === 'A') { e.setAttribute('target','_blank'); e.setAttribute('rel','noopener noreferrer'); }
  });
  return template.innerHTML;
}

// CSS URLs are acquired once per original absolute URL. Nothing is fetched by the archive.
export async function inlineResources(snapshot, fetchAsset, report, progress = () => {}) {
  const cache = new Map();
  let running=0;const queue=[];
  const limited=async task=>{if(running>=6)await new Promise(resolve=>queue.push(resolve));running++;try{return await task();}finally{running--;queue.shift()?.();}};
  const acquire = (url, base, purpose) => {
    if (!url || /^(?:data:|#)/i.test(url)) return Promise.resolve(url);
    let absolute; try { absolute = new URL(url, base).href; } catch { return Promise.resolve(''); }
    if (!/^(?:https?:|blob:)/.test(absolute)) return Promise.resolve('');
    if (!cache.has(absolute)) cache.set(absolute, (async () => {
      try {
        const result = await limited(()=>fetchAsset(absolute));
        if (!result?.dataUrl) throw new Error('资源响应为空');
        report.assets.saved++;
        return result.dataUrl;
      } catch (error) {
        report.assets.failed++;
        report.warnings.push(`${purpose}未保存：${absolute.split('?')[0]}（${error.message}）`);
        return ''; // Never leave an authenticated or expiring URL in an offline file.
      }
    })());
    return cache.get(absolute);
  };
  async function rewriteCss(text, base, depth = 0) {
    if (depth > 8) { report.warnings.push('CSS import 层级过深，已停止递归'); return ''; }
    const imports = [...text.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?([^;]*);/gi)];
    for (const match of imports) {
      let replacement = '';
      try {
        const url = new URL(match[1], base).href;
        const response = await fetchAsset(url);
        const imported = await rewriteCss(response.text ?? decodeDataText(response.dataUrl), url, depth + 1);
        replacement = match[2].trim() ? `@media ${match[2].trim()}{${imported}}` : imported;
      } catch (error) { report.warnings.push(`CSS import 未保存：${match[1]}（${error.message}）`); }
      text = text.replace(match[0], replacement);
    }
    const refs = [...text.matchAll(/url\(\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^\s)]*))\s*\)/gi)];
    const replacements = await Promise.all(refs.map(async m => [m[0], await acquire(m[1] ?? m[2] ?? m[3], base, '样式资源')]));
    const map = new Map(replacements);
    return text.replace(/url\(\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^\s)]*))\s*\)/gi, m => `url("${map.get(m) || ''}")`);
  }
  const css = [];
  for (let i=0; i<snapshot.styles.length; i++) {
    const sheet = snapshot.styles[i];
    progress(`保存样式 ${i+1}/${snapshot.styles.length}`);
    try {
      const text = sheet.text ?? (await fetchAsset(sheet.href)).text;
      if (typeof text !== 'string') throw new Error('样式表不是文本');
      css.push(await rewriteCss(text, sheet.href || snapshot.url));
    } catch(error) { report.warnings.push(`样式表未保存：${sheet.href || i}（${error.message}）`); }
  }
  // Resources in current visible DOM also cover CSS backgrounds and attachments.
  const replacements = await Promise.all(snapshot.assets.map(async item => ({...item, dataUrl: await acquire(item.url, snapshot.url, item.kind || '图片')})));
  const resourceMap = Object.fromEntries(replacements.map(item => [item.url, item.dataUrl]));
  for (const item of replacements) {
    if (item.absoluteUrl) resourceMap[item.absoluteUrl] = item.dataUrl;
  }
  return {css:css.join('\n'),resourceMap};
}

function decodeDataText(url) {
  if (!url) return '';
  const comma = url.indexOf(',');
  const bytes = Uint8Array.from(atob(url.slice(comma+1)), c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const ARCHIVE_CSS = `
html,body{margin:0;min-height:100%;height:auto;overflow-x:hidden;overflow-y:auto;background:var(--color-background-execution-output,var(--color-token-main-surface-primary,#fcfcfc));color:var(--color-text,var(--color-text-primary,#0d0d0d));font-family:var(--font-sans-default,ui-sans-serif),system-ui,sans-serif}
.archive-shell{max-width:var(--archive-width,800px);margin:0 auto;padding:24px 24px 80px}
.archive-header{padding:12px 0 24px;border-bottom:1px solid var(--color-border,#444);margin-bottom:32px}
.archive-header h1{font-size:22px;margin:0 0 8px}.archive-header p,.archive-report{font-size:13px;color:var(--color-text-secondary,#b4b4b4);line-height:1.7}
.archive-message{margin:24px 0 40px;min-width:0}.archive-role{font-size:12px;opacity:.65;margin:0 0 12px}.archive-user{padding:0;background:none;max-width:100%;margin-left:auto}
.archive-frame{display:block;border:0;width:100%;min-height:300px;color-scheme:normal;background:transparent;overflow:hidden}.archive-frame[hidden]{display:none}.archive-message img{max-width:100%;height:auto}
.archive-report{border-top:1px solid var(--color-border,#444);padding-top:16px}.archive-static-warning{font-size:12px;color:#d99b30;margin-bottom:10px}
.archive-toolbar{display:flex;gap:8px;margin-top:12px}.archive-toolbar button{background:transparent;color:inherit;border:1px solid var(--color-border,#666);border-radius:8px;padding:5px 10px;cursor:pointer}
@media(max-width:600px){.archive-shell{padding:16px 12px 48px}.archive-user{max-width:95%}}@media print{.archive-toolbar{display:none}}
`;

function frameBootstrap() {
  const root = document.getElementById('root');
  let initialized = false;
  const send = (type, extra = {}) => parent.postMessage({archive:true,type,...extra}, '*');
  const observeSize = () => send('height', {height:Math.ceil(Math.max(root.scrollHeight,root.getBoundingClientRect().height))+8});
  window.addEventListener('message', async event => {
    if(event.source===parent&&event.data?.type==='archive-measure'){observeSize();setTimeout(observeSize,100);return;}
    if(event.source===parent&&event.data?.type==='archive-theme'){document.documentElement.setAttribute('data-theme',event.data.theme);document.documentElement.classList.toggle('dark',event.data.theme==='dark');return;}
    if (event.source !== parent || event.data?.type !== 'archive-init' || initialized) return;
    initialized = true;
    const {record, runtime, css, templates, htmlAttrs, resourceMap} = event.data;
    try {
      Object.entries(htmlAttrs || {}).forEach(([k,v]) => document.documentElement.setAttribute(k,v));
      const style = document.createElement('style');
      style.textContent = css + '\nhtml,body{margin:0!important;padding:0!important;min-height:0!important;height:auto!important;background:transparent!important;overflow:hidden!important}#root{min-width:0;min-height:0!important;height:auto!important;max-height:none!important}';
      document.head.appendChild(style);
      const script = document.createElement('script'); script.textContent = runtime; document.body.appendChild(script);
      new ResizeObserver(observeSize).observe(root);
      new MutationObserver(observeSize).observe(root,{childList:true,subtree:true,characterData:true});
      let failed=false;
      await window.ChatGPTOffline.mountArchivedComponent(root, record, {...templates, resourceMap},{onAction:payload=>{if(payload.type==='open-link'){send('open-link',{url:payload.url});return true;}if(payload.type==='followup'){send('followup',{prompt:payload.prompt});return true;}return false;},onError:error=>{failed=true;send('error',{message:error.message});},onReady:details=>{
        if(details.unsupported?.length){failed=true;send('error',{message:'尚未支持的组件：'+details.unsupported.join(', ')});}
      }});
      if(!failed){send('mounted'); observeSize();}
    } catch(error) { send('error',{message:error.message}); }
  });
  send('ready');
}

function archiveBootstrap() {
  const data = JSON.parse(document.getElementById('archive-data').textContent);
  const frames = Array.from(document.querySelectorAll('.archive-frame'));
  const citationURLs=record=>{
    const urls=new Set(),queue=[record.appData,record.contentReferences];
    while(queue.length){const value=queue.pop();if(!value||typeof value!=='object')continue;for(const [key,child]of Object.entries(value)){if(['url','href','source_url','sourceUrl'].includes(key)&&typeof child==='string'&&/^https?:\/\//i.test(child))urls.add(child);else if(child&&typeof child==='object')queue.push(child);}}
    return urls;
  };
  const allowedLinks=data.components.map(item=>citationURLs(item.record));
  window.addEventListener('message', event => {
    const index = frames.findIndex(f => f.contentWindow === event.source);
    if (index < 0 || event.data?.archive !== true) return;
    const frame = frames[index], item = data.components[index];
    if (event.data.type === 'ready') {
      event.source.postMessage({type:'archive-init',record:item.record,runtime:data.runtime,css:data.css,templates:data.templates,htmlAttrs:data.htmlAttrs,resourceMap:data.resourceMap}, '*');
    } else if (event.data.type === 'height' && Number.isFinite(event.data.height)) {
      frame.style.height = Math.min(1000000,Math.max(100,event.data.height))+'px';
    } else if (event.data.type === 'mounted') {
      frame.parentElement.querySelector('.archive-fallback').hidden = true;
      frame.hidden = false;
      event.source.postMessage({type:'archive-measure'},'*');
    } else if (event.data.type === 'error') {
      const fallback = frame.parentElement.querySelector('.archive-fallback');
      fallback.hidden=false; frame.hidden=true;
      const note=document.createElement('p'); note.className='archive-static-warning'; note.textContent='交互组件启动失败，显示保存时的原版快照：'+event.data.message; fallback.prepend(note);
    } else if(event.data.type==='open-link'&&allowedLinks[index].has(event.data.url)){
      window.open(event.data.url,'_blank','noopener,noreferrer');
    } else if(event.data.type==='followup'){
      const dialog=document.createElement('dialog');dialog.style.cssText='width:min(560px,90vw);padding:20px;border-radius:12px;border:1px solid #888';
      const explanation=document.createElement('p');explanation.textContent='已保留原始提问，可复制后返回原对话继续。';
      const prompt=document.createElement('textarea');prompt.value=String(event.data.prompt||'');prompt.style.cssText='box-sizing:border-box;width:100%;min-height:180px';
      const close=document.createElement('button');close.textContent='关闭';close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());dialog.append(explanation,prompt,close);document.body.append(dialog);dialog.showModal();
    }
  });
  document.getElementById('archive-print')?.addEventListener('click',()=>window.print());
  document.addEventListener('click',event=>{
    const image=event.target.closest?.('.archive-message img');
    if(!image?.src?.startsWith('data:'))return;
    const dialog=document.createElement('dialog');dialog.style.cssText='max-width:94vw;max-height:94vh;padding:16px;border:1px solid #888;border-radius:12px';
    const full=document.createElement('img');full.src=image.src;full.alt=image.alt;full.style.cssText='display:block;max-width:88vw;max-height:82vh;object-fit:contain';
    const close=document.createElement('button');close.textContent='关闭';close.style.cssText='display:block;margin:12px auto 0';close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());dialog.append(full,close);document.body.append(dialog);dialog.showModal();
  });
  document.getElementById('archive-theme')?.addEventListener('click',()=>{
    const theme=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';
    document.documentElement.setAttribute('data-theme',theme);document.documentElement.classList.toggle('dark',theme==='dark');
    // Original CSS variables can be tied to original theme classes; mirror them in frames.
    frames.forEach(f=>f.contentWindow?.postMessage({type:'archive-theme',theme},'*'));
  });
  const bootstrap=data.frameBootstrap;
  const csp="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' data:; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'";
  const srcdoc='<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+csp+'"></head><body><div id="root"></div><script>'+bootstrap+'<\/script></body></html>';
  frames.forEach(frame=>{frame.srcdoc=srcdoc;});
}

export async function buildArchive(snapshot, {runtimeSource, fetchAsset, onProgress = () => {}}) {
  const report = {version:1,exportedAt:new Date().toISOString(),messages:snapshot.messages.length,interactive:0,static:0,assets:{saved:0,failed:0},warnings:[...(snapshot.warnings||[])]};
  const {css,resourceMap} = await inlineResources(snapshot,fetchAsset,report,onProgress);
  const components=[];
  const rewriteHtml = html => {
    const document = snapshot.document;
    if (!document) throw new Error('打包器需要 DOM document 以清理静态快照');
    const template=document.createElement('template');template.innerHTML=sanitizeHtml(document,html);
    template.content.querySelectorAll('[src],[poster],image').forEach(e=>{
      for(const name of ['src','poster','href','xlink:href']) {
        if(!e.hasAttribute(name))continue;
        const url=e.getAttribute(name); if(url?.startsWith('#')||url?.startsWith('data:'))continue;
        e.setAttribute(name,resourceMap[url]||resourceMap[new URL(url,snapshot.url).href]||'');
      }
      e.removeAttribute('srcset');e.removeAttribute('loading');
    });
    const flattened=inlineSvgUses(document,template.innerHTML,resourceMap,snapshot.url);
    report.warnings.push(...flattened.warnings);
    return flattened.html;
  };
  const messages=snapshot.messages.map(message=>{
    const fallback=rewriteHtml(message.html);
    const role=message.role==='user'?'你':'ChatGPT';
    const record=message.component;
    if(record?.code && runtimeSource){
      const index=components.length; components.push({record});report.interactive++;
      return `<section class="archive-message" data-message-id="${escapeHtml(message.id)}"><p class="archive-role">${role}</p><div class="archive-fallback">${fallback}</div><iframe hidden class="archive-frame" data-archive-index="${index}" title="${role} 的交互回答 ${index+1}" sandbox="allow-scripts" scrolling="no"></iframe></section>`;
    }
    report.static++;
    return `<section class="archive-message ${message.role==='user'?'archive-user':''}" data-message-id="${escapeHtml(message.id)}"><p class="archive-role">${role}</p>${fallback}</section>`;
  }).join('\n');
  if(!report.interactive)report.warnings.push('未发现可恢复的 DIL 源码；已保存原版静态内容。');
  const templates={...(snapshot.templates||{})};
  for(const key of ['widgetHtml','codeBlocks','math','quizTemplates']){
    if(templates[key])templates[key]=Object.fromEntries(Object.entries(templates[key]).map(([id,html])=>[id,rewriteHtml(html)]));
  }
  const data={runtime:runtimeSource,css,resourceMap,templates,htmlAttrs:snapshot.htmlAttrs||{},components,frameBootstrap:`(${frameBootstrap.toString()})();`};
  const attrs=Object.entries(snapshot.htmlAttrs||{}).filter(([key])=>['class','lang','dir','data-theme','style'].includes(key)).map(([key,value])=>`${key}="${escapeHtml(value)}"`).join(' ');
  const html=`<!doctype html><html ${attrs}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' data:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; frame-src 'self' about:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(snapshot.title)}</title><style>${css.replace(/<\/style/gi,'<\\/style')}\n${ARCHIVE_CSS}</style></head><body><main class="archive-shell" style="--archive-width:${Number(snapshot.width)||800}px"><header class="archive-header"><h1>${escapeHtml(snapshot.title)}</h1><p>离线存档 · ${report.messages} 条消息 · ${report.interactive} 个交互回答</p><p><a href="${escapeHtml(snapshot.url)}" target="_blank" rel="noopener noreferrer">打开原对话</a></p><div class="archive-toolbar"><button id="archive-print">打印</button></div></header>${messages}<details class="archive-report"><summary>导出报告${report.warnings.length?`（${report.warnings.length} 项提示）`:''}</summary><p>保存资源 ${report.assets.saved} 项，失败 ${report.assets.failed} 项。当前选中对话分支；未生成的后续回复不在存档内。</p><ul>${report.warnings.map(w=>`<li>${escapeHtml(w)}</li>`).join('')}</ul></details></main><script id="archive-report" type="application/json">${jsonForHtml(report)}</script><script id="archive-data" type="application/json">${jsonForHtml(data)}</script><script>(${archiveBootstrap.toString()})();</script></body></html>`;
  return {html,report};
}
