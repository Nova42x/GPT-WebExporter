// This function is injected into MAIN only for the duration of an explicit
// export. It observes JSON bodies for THIS conversation; credentials, request
// headers, storage and unrelated requests are never read or transmitted.
export function installTransportBridge({job,conversationId}) {
  globalThis.__chatgptOfflineBridge?.stop?.();
  let stopped=false;const payloads=[],warnings=[];
  const matches=(raw,method='GET')=>{
    if(String(method).toUpperCase()!=='GET')return false;
    try{const url=new URL(raw,location.href);return url.origin===location.origin&&['/backend-api/conversation/','/backend-api/conversations/'].some(prefix=>url.pathname===prefix+conversationId||url.pathname.startsWith(prefix+conversationId+'/'));}
    catch{return false;}
  };
  const retain=(url,text)=>{
    if(stopped)return;
    if(text.length>50*1024*1024){warnings.push('一页对话数据超过 50 MB，未加入源码缓存。');return;}
    try{payloads.push({url:url.split('?')[0],data:JSON.parse(text)});}catch{warnings.push('一页对话数据不是标准 JSON，未执行其内容。');}
  };
  const nativeFetch=window.fetch;
  const wrappedFetch=function(input,options){
    const raw=typeof input==='string'?input:input?.url;
    const method=options?.method||input?.method||'GET';
    return nativeFetch.apply(this,arguments).then(response=>{
      if(matches(raw,method)&&response.ok&&/json/i.test(response.headers.get('content-type')||''))response.clone().text().then(text=>retain(new URL(raw,location.href).href,text)).catch(()=>{});
      return response;
    });
  };
  window.fetch=wrappedFetch;
  const nativeOpen=XMLHttpRequest.prototype.open,nativeSend=XMLHttpRequest.prototype.send;
  const requests=new WeakMap();
  const wrappedOpen=function(method,url){requests.set(this,{method,url});return nativeOpen.apply(this,arguments);};
  const wrappedSend=function(){
    const request=requests.get(this);
    if(request&&matches(request.url,request.method))this.addEventListener('load',()=>{
      if(stopped||this.status<200||this.status>=300)return;
      try{if(this.responseType==='json')retain(new URL(request.url,location.href).href,JSON.stringify(this.response));else if(!this.responseType||this.responseType==='text')retain(new URL(request.url,location.href).href,this.responseText);}catch{}
    },{once:true});
    return nativeSend.apply(this,arguments);
  };
  XMLHttpRequest.prototype.open=wrappedOpen;XMLHttpRequest.prototype.send=wrappedSend;
  const stop=()=>{
    stopped=true;
    if(window.fetch===wrappedFetch)window.fetch=nativeFetch;
    if(XMLHttpRequest.prototype.open===wrappedOpen)XMLHttpRequest.prototype.open=nativeOpen;
    if(XMLHttpRequest.prototype.send===wrappedSend)XMLHttpRequest.prototype.send=nativeSend;
    window.removeEventListener('message',listener);clearTimeout(timeout);
    if(globalThis.__chatgptOfflineBridge?.job===job)delete globalThis.__chatgptOfflineBridge;
  };
  const listener=event=>{
    if(event.source!==window||event.data?.job!==job)return;
    if(event.data.type==='archive-bridge-read'){
      window.postMessage({type:'archive-bridge-data',job,conversationId,payloads,warnings},location.origin);
    }else if(event.data.type==='archive-bridge-stop')stop();
  };
  const timeout=setTimeout(stop,10*60*1000);
  window.addEventListener('message',listener);
  globalThis.__chatgptOfflineBridge={job,stop};
}

export function readTransportBridge(window,job) {
  return new Promise(resolve=>{
    const finish=data=>{window.removeEventListener('message',listener);window.clearTimeout(timer);resolve(data);};
    const listener=event=>{if(event.source===window&&event.data?.type==='archive-bridge-data'&&event.data.job===job)finish(event.data);};
    window.addEventListener('message',listener);
    const timer=window.setTimeout(()=>finish({payloads:[],warnings:['源码请求观察器没有响应；已使用页面内嵌数据。']}),2500);
    window.postMessage({type:'archive-bridge-read',job},window.location.origin);
  });
}
