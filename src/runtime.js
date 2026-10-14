import React, {useState,useContext,createContext} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {createComponents,captureStyleTemplates,copyTextLocally} from './components.js';
export {captureStyleTemplates};
const h=React.createElement;
const RuntimeContext=createContext(null);

// Evaluated only inside the sandboxed archive frame. MV3 collection never
// executes generated source. Hooks belong to genuine React function components.
export function createRuntime(record={},templates={},options={}) {
  let rendered=null;
  const states=new Map(),unsupported=new Set(),actions=[];
  const onAction=payload=>{actions.push(payload);const handled=options.onAction?.(payload)===true;if(!handled&&payload.type==='followup'){
    let panel=document.getElementById('offline-followup-prompt');
    if(!panel){panel=document.createElement('dialog');panel.id='offline-followup-prompt';document.body.append(panel);}
    panel.replaceChildren();const title=document.createElement('p');title.textContent='此操作需要生成新回复。已保留原始提问，可复制后返回原对话继续。';const text=document.createElement('textarea');text.value=payload.prompt||'';text.style.cssText='width:100%;min-height:160px';const close=document.createElement('button');close.textContent='关闭';close.onclick=()=>panel.close?.();panel.append(title,text,close);if(panel.showModal)panel.showModal();else panel.setAttribute('open','');
  }return handled;};
  const {registry,cleanHTML}=createComponents(templates,record,onAction);
  const DIL={
    render:node=>{rendered=node;},
    useConstants:()=>record.constants||{},
    useAppData:selector=>selector?selector(record.appData||{}):(record.appData||{}),
    useState:(initial,settings={})=> {
      const key=settings.key;
      const saved=record.viewState?.[key];
      const value=useState(()=>saved!==undefined?saved:typeof initial==='function'?initial():initial);
      if(key)states.set(key,{value:value[0],set:value[1]});
      return value;
    },
    useEffect:React.useEffect,useMemo:React.useMemo,useRef:React.useRef,
  };
  const __dil={Fragment:React.Fragment,jsx:(type,props,...children)=> {
    const normalized=React.Children.toArray(children);
    if(typeof type==='string') {
      if(!registry[type]){unsupported.add(type);return h('div',{'data-offline-unsupported':type},...normalized);}
      return h(registry[type],props,...normalized);
    }
    return h(type,props,...normalized);
  }};
  const Cite=props=>{
    const [open,setOpen]=useState(false);
    const state=record.appData?.opGenui?.componentResults?.[props.__resolutionId]?.state;
    const items=state?.items||[];
    if(!items.length)return h('span',{'data-offline-citation':'',title:'引用保留在原始记录中'},props.children);
    return h('span',{'data-offline-citation':'','data-d-component':'popover-trigger',className:templates.classes?.['popover-trigger']?.className||'',role:'button',tabIndex:0,'aria-expanded':open,onClick:()=>setOpen(o=>!o),onKeyDown:e=>{if(e.key==='Enter'||e.key===' '){setOpen(o=>!o);e.preventDefault();}},style:{position:'relative',display:'inline-block'}},h(registry.badge,{color:'secondary',weight:'normal',inline:true},items[0].source_label||'来源'),open&&h('span',{role:'dialog',style:{display:'block',position:'absolute',zIndex:20,top:'100%',left:0,minWidth:280,padding:12,border:'1px solid var(--color-border)',borderRadius:'var(--radius-lg)',background:'var(--color-surface)',boxShadow:'0 4px 20px #0002'}},items.map((item,i)=>h('a',{key:i,href:/^https?:\/\//i.test(item.url||'')?item.url:undefined,target:'_blank',rel:'noopener noreferrer',onClick:e=>{e.stopPropagation();e.preventDefault();if(/^https?:\/\//i.test(item.url||''))onAction({type:'open-link',url:item.url});},style:{display:'block',marginBottom:8}},item.title||item.source_label))));
  };
  const LearningQuiz=props=> {
    const ctx=useContext(RuntimeContext);
    const server=record.appData?.opGenui?.componentResults?.[props.__resolutionId]?.state;
    const questions=server?.questions||props.questions||[];
    const saved=record.viewState?.learning_quiz_server_state?.[props.__resolutionId];
    const confirmed=saved?.confirmed_answer_indices||[];
    const [index,setIndex]=useState(server?.current_index??(confirmed.length?Math.min(Math.max(...confirmed),questions.length-1):0));
    const [answers,setAnswers]=useState(()=>Object.fromEntries((server?.answers||[]).map(a=>[a.index,a.selected_values||[]]))),[reviewed,setReviewed]=useState(()=>Object.fromEntries(confirmed.map(i=>[i,true]))),[complete,setComplete]=useState(server?.phase==='results'),[hintOpen,setHintOpen]=useState(server?.hint_open||false);
    const q=questions[index];
    if(!q)return null;
    const choices=q.options||q.opts||[],selected=answers[index]||[],correct=q.correct_values||q.correctValues||(q.ans!=null?[String(q.ans)]:[]);
    const reviewedNow=reviewed[index];
    const isCorrect=selected.length===correct.length&&selected.every(x=>correct.includes(x));
    const select=value=>setAnswers(a=>({...a,[index]:(q.type||q.question_type)==='multi_select'?(selected.includes(value)?selected.filter(v=>v!==value):[...selected,value]):[value]}));
    const B=registry.box,R=registry.row,T=registry.text;
    const nativeTemplate=templates.quizTemplates?.[record.messageId];
    if(nativeTemplate) {
      // Keep the actual native widget skeleton: header navigation, rich prompt,
      // circular option markers, feedback column, rounded card and footer.
      const doc=new DOMParser().parseFromString(cleanHTML(nativeTemplate,templates.resourceMap),'text/html'),card=doc.body.firstElementChild;
      const prompt=card.querySelector('[class*="MarkdownContent"]');if(prompt){const p=prompt.querySelector('p')||prompt;p.textContent=q.question||q.prompt||q.q||q.title;}
      for(const text of card.querySelectorAll('[data-d-component="text"]'))if(/^\d+\/\d+$/.test(text.textContent.trim()))text.textContent=`${index+1}/${questions.length}`;
      const groups=[...card.querySelectorAll('[role="group"]')].filter(n=>n.querySelector('[class*="MarkdownContent"]'));
      if(groups.length){
        const prototype=groups[0].parentElement,optionsParent=prototype.parentElement;
        const wrappers=groups.map(n=>n.parentElement);const anchor=doc.createComment('offline-quiz-options');prototype.before(anchor);for(const n of wrappers)n.remove();
        choices.forEach((o,j)=>{const option=prototype.cloneNode(true),group=option.querySelector('[role="group"]'),label=group.querySelector('[class*="MarkdownContent"]'),marker=group.querySelector('[data-d-component="text"]'),value=String(o.value??j),active=selected.includes(value),answer=correct.includes(value);
          const content=label.querySelector('p')||label;content.textContent=typeof o==='object'?o.label||o.text:o;
          group.setAttribute('data-quiz-value',value);group.setAttribute('role','button');group.setAttribute('tabindex',reviewedNow?'-1':'0');group.setAttribute('aria-pressed',String(active));group.setAttribute('aria-disabled',String(!!reviewedNow));
          if(marker){marker.textContent=(q.type||q.question_type)==='true_false'?'':String.fromCharCode(65+j);const circle=marker.parentElement;if(reviewedNow&&(answer||active)){circle.style.backgroundColor=answer?'var(--green-500)':'var(--red-500)';circle.style.border='none';circle.style.width='30px';circle.style.height='30px';marker.style.color='var(--white)';}else if(active){circle.style.backgroundColor='var(--color-text-primary)';marker.style.color='var(--color-surface)';} }
          for(const text of group.querySelectorAll('[data-d-component="text"]'))if(text!==marker)text.remove();
          if(reviewedNow&&(answer||active)&&o.feedback){const feedback=doc.createElement('p');feedback.className=templates.classes?.text?.className||'';feedback.setAttribute('data-d-component','text');feedback.setAttribute('data-d-size','sm');feedback.style.color='var(--color-text-secondary)';feedback.textContent=o.feedback;label.parentElement.append(feedback);}
          if(!reviewedNow)group.style.cursor='pointer';anchor.before(option);
        });anchor.remove();
      }
      if(complete){
        const score=questions.filter((item,i)=>{const correct=item.correct_values||item.correctValues||[];const selected=answers[i]||[];return selected.length===correct.length&&selected.every(v=>correct.includes(v));}).length;
        (prompt.querySelector('p')||prompt).textContent=`练习已完成：答对 ${score} / ${questions.length} 题`;
        const currentOptions=[...card.querySelectorAll('[data-quiz-value]')];
        if(currentOptions.length){const prototype=currentOptions[0].parentElement,parent=prototype.parentElement;for(const group of currentOptions)group.parentElement.remove();questions.forEach((item,i)=>{const row=prototype.cloneNode(true),group=row.querySelector('[data-quiz-value]'),label=group.querySelector('[class*="MarkdownContent"]'),marker=group.querySelector('[data-d-component="text"]'),values=answers[i]||[],correct=item.correct_values||item.correctValues||[],ok=values.length===correct.length&&values.every(v=>correct.includes(v));group.removeAttribute('data-quiz-value');group.setAttribute('role','group');group.removeAttribute('tabindex');group.removeAttribute('aria-pressed');for(const p of group.querySelectorAll('[data-d-component="text"]'))if(p!==marker)p.remove();marker.textContent=String(i+1);marker.parentElement.style.backgroundColor=ok?'var(--green-500)':'var(--red-500)';(label.querySelector('p')||label).textContent=item.question||item.prompt;for(const option of item.options||[])if(values.includes(option.value)||correct.includes(option.value)){const feedback=doc.createElement('p');feedback.className=templates.classes?.text?.className||'';feedback.setAttribute('data-d-component','text');feedback.setAttribute('data-d-size','sm');feedback.style.color='var(--color-text-secondary)';feedback.textContent=`${correct.includes(option.value)?'正确答案':'你的回答'}：${option.label}。${option.feedback||''}`;label.parentElement.append(feedback);}parent.append(row);});}
      }
      const buttons=[...card.querySelectorAll('button')];
      const previous=buttons.find(b=>b.getAttribute('aria-label')==='上一题'),next=buttons.find(b=>b.getAttribute('aria-label')==='下一题'),hint=buttons.find(b=>b.getAttribute('aria-label')==='提示'),copy=buttons.find(b=>b.getAttribute('aria-label')==='复制测验'),share=buttons.find(b=>b.getAttribute('aria-label')==='分享'),footer=buttons.find(b=>!b.getAttribute('aria-label')&&b.textContent.trim());
      for(const [button,action]of [[previous,'previous'],[next,'next'],[hint,'hint'],[copy,'copy'],[share,'share'],[footer,'advance']])if(button)button.setAttribute('data-offline-quiz-action',action);
      if(previous)previous.disabled=complete||index===0;if(next)next.disabled=complete||index>=questions.length-1;
      if(hint){hint.setAttribute('aria-expanded',String(hintOpen));if(hintOpen){const popup=doc.createElement('span');popup.setAttribute('data-offline-quiz-hint','');popup.style.cssText='display:block;padding:12px;color:var(--color-text-secondary);background:var(--color-surface-secondary);border-radius:var(--radius-lg)';popup.textContent=q.hint||'';prompt.parentElement.append(popup);}}
      if(footer){(footer.querySelector('span')||footer).textContent=complete?'重新练习':reviewedNow?'下一步':'检查答案';footer.disabled=!complete&&!reviewedNow&&!selected.length;footer.setAttribute('data-color',reviewedNow?'secondary':'primary');footer.setAttribute('data-variant',reviewedNow?'outline':'solid');if(complete)footer.setAttribute('data-offline-quiz-action','restart');}
      card.setAttribute('aria-label',props.title||server?.title||'练习');
      const copiedText=server?.copy_quiz_text||questions.map(x=>x.question||x.prompt).join('\n\n');
      const nativeClick=e=>{const option=e.target.closest?.('[data-quiz-value]');if(option){if(!reviewedNow)select(option.getAttribute('data-quiz-value'));return;}const button=e.target.closest?.('[data-offline-quiz-action]'),action=button?.getAttribute('data-offline-quiz-action');if(action==='previous')setIndex(i=>Math.max(i-1,0));if(action==='next')setIndex(i=>Math.min(i+1,questions.length-1));if(action==='hint')setHintOpen(v=>!v);if(action==='restart'){setIndex(0);setAnswers({});setReviewed({});setHintOpen(false);setComplete(false);}if(action==='advance')reviewedNow?(index===questions.length-1?setComplete(true):setIndex(i=>i+1)):setReviewed(a=>({...a,[index]:true}));if(action==='copy'||action==='share'){void copyTextLocally(copiedText,e.currentTarget.ownerDocument).then(copied=>button.setAttribute('title',copied?'已复制测验':'复制失败，可查看导出文件中的完整题目数据'));}};
      return h('div',{'data-offline-learning-quiz':''},h('div',{onClick:nativeClick,onKeyDown:e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-quiz-value]')){nativeClick(e);e.preventDefault();}},dangerouslySetInnerHTML:{__html:card.outerHTML}}),h(R,{gap:2,justify:'end'},!complete&&h(registry.button,{variant:'outline',color:'secondary',size:'sm',onClick:()=>{setIndex(0);setAnswers({});setReviewed({});setHintOpen(false);setComplete(false);}},'重新练习'),props.nextQuizQuery&&h(registry.button,{variant:'outline',color:'secondary',size:'sm',onClick:()=>ctx?.onAction({type:'followup',prompt:props.nextQuizQuery})},'继续练习')));
    }
    return h(B,{border:true,radius:'xl',padding:3,gap:3,'data-offline-learning-quiz':''},
      h(R,{justify:'between',align:'center'},h(registry.title,{size:'md'},props.title||'练习'),h(registry.badge,{color:'secondary'},`${index+1} / ${questions.length}`)),
      complete?h(B,{background:'surface-secondary',padding:3,radius:'lg',gap:2},h(T,null,`练习已完成：答对 ${questions.filter((item,i)=>{const correct=item.correct_values||item.correctValues||[];const values=answers[i]||[];return values.length===correct.length&&values.every(v=>correct.includes(v));}).length} / ${questions.length} 题`),h(registry.button,{variant:'outline',onClick:()=>{setIndex(0);setAnswers({});setReviewed({});setComplete(false);}},'重新练习')):
      h(B,{gap:3},h(T,{weight:'medium'},q.question||q.prompt||q.q||q.title),
        h(B,{gap:1},choices.map((o,j)=>{const value=String(o.value??j),label=typeof o==='object'?o.label||o.text:o,active=selected.includes(value),answer=correct.includes(value);
          return h(registry.pressable,{key:value,direction:'row',align:'start',gap:4,padding:2,radius:'4xl',border:active,background:active?'surface-secondary':undefined,disabled:!!reviewedNow,'aria-pressed':active,'data-quiz-value':value,onClick:()=>select(value)},h(B,{align:'center',justify:'center',radius:9999,width:32,height:32,border:true,background:reviewedNow&&answer?'var(--green-500)':undefined},h(T,{size:'sm',weight:'medium',color:reviewedNow&&answer?'white':'secondary'},String.fromCharCode(65+j))),h(B,{flex:'1 1 0%',gap:1},h(T,null,label),reviewedNow&&o.feedback&&h(T,{size:'sm',color:'secondary'},o.feedback)));
        })),
        reviewedNow&&h(T,{size:'sm',color:isCorrect?'success':'secondary'},selected.length?(isCorrect?'回答正确':'请对照解析查看正确答案'): '已保留原对话的答题解析'),
        q.hint&&h('details',null,h('summary',null,'提示'),h(T,{size:'sm'},q.hint)),
        h(R,{justify:'between'},h(registry.button,{color:'secondary',variant:'outline',disabled:index===0,onClick:()=>setIndex(i=>i-1)},'上一步'),h(registry.button,{disabled:!reviewedNow&&!selected.length,onClick:()=>reviewedNow?(index===questions.length-1?setComplete(true):setIndex(i=>i+1)):setReviewed(a=>({...a,[index]:true}))},reviewedNow?'下一步':'检查答案'))),
      !complete&&h(registry.button,{variant:'outline',color:'secondary',onClick:()=>{setIndex(0);setAnswers({});setReviewed({});}},'重新练习'),
      props.nextQuizQuery&&h(registry.button,{variant:'outline',color:'secondary',onClick:()=>ctx?.onAction({type:'followup',prompt:props.nextQuizQuery})},'继续练习'));
  };
  const GenUI={issueNewTurn:prompt=>onAction({type:'followup',prompt})};
  const error=new Function('DIL','__dil','Cite','LearningQuiz','GenUI',`"use strict";\n${record.code||''}\n//# sourceURL=archived-dil.js`);
  error(DIL,__dil,Cite,LearningQuiz,GenUI);
  if(!rendered)throw new Error('组件源码没有调用 DIL.render');
  return {element:h(RuntimeContext.Provider,{value:{record,onAction}},rendered),states,unsupported,actions,onAction};
}

export function mountArchivedComponent(root,record,templates={},options={}) {
  if(templates.root){
    root.className=templates.root.className||'';for(const [name,value]of Object.entries(templates.root.attrs||{}))root.setAttribute(name,value);
    if(templates.root.container){let container=root.parentElement;if(!container?.hasAttribute('data-offline-renderer')){container=document.createElement('div');container.setAttribute('data-offline-renderer','');root.before(container);container.append(root);}container.className=templates.root.container.className||'';for(const [name,value]of Object.entries(templates.root.container.attrs||{}))container.setAttribute(name,value);}
  }
  const runtime=createRuntime(record,templates,options);
  const reactRoot=createRoot(root);
  let renderError=null;
  class Boundary extends React.Component {
    state={error:null};
    static getDerivedStateFromError(error){return {error};}
    componentDidCatch(error){renderError=error;options.onError?.(error);}
    render(){return this.state.error?h('pre',{'data-offline-runtime-error':''},`交互组件加载失败：${this.state.error.message}`):this.props.children;}
  }
  flushSync(()=>reactRoot.render(h(Boundary,null,runtime.element)));
  if(!renderError)options.onReady?.({unsupported:[...runtime.unsupported],states:[...runtime.states.keys()]});
  return {...runtime,unmount:()=>reactRoot.unmount(),getState:()=>Object.fromEntries([...runtime.states].map(([key,{value}])=>[key,value]))};
}
