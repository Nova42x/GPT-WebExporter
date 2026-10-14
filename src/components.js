import React, { createContext, useContext, useId } from 'react';
import {makeChartComponent} from './chart-components.js';

const h = React.createElement;
const TextContext = createContext(false);
const SvgContext = createContext(false);
const ListContext = createContext({marker:'bullet'});
const RadioContext = createContext({});
export async function copyTextLocally(text,doc=document) {
  try{await doc.defaultView.navigator.clipboard.writeText(text);return true;}catch{}
  const field=doc.createElement('textarea');field.value=text;field.style.cssText='position:fixed;opacity:0;left:0;top:0';doc.body.append(field);field.select();let copied=false;try{copied=!!doc.execCommand?.('copy');}catch{}field.remove();return copied;
}

// Class names and structural parts come from the page being archived. No copied
// application bootstrap or initialization script is executed by this collector.
export function captureStyleTemplates(document,scope=document) {
  const classes = {}, parts = {}, math = {}, icons = {}, widgetHtml = {}, codeBlocks = {}, quizTemplates = {};
  const originalRoot=scope.querySelector('[data-dil-message-id]');
  const root=originalRoot?{className:originalRoot.className,attrs:Object.fromEntries([...originalRoot.attributes].filter(a=>['dir','data-d-direction','data-d-inline-reveal'].includes(a.name)).map(a=>[a.name,a.value]))}:null;
  if(root){const container=originalRoot.closest('[data-theme]');root.theme=container?.getAttribute('data-theme')||document.documentElement.getAttribute('data-theme')||'light';root.container={className:container?.className||'',attrs:{'data-theme':root.theme,style:container?.getAttribute('style')||''}};root.htmlAttrs={'data-theme':root.theme};}
  for (const node of scope.querySelectorAll('[data-d-component]')) {
    const type = node.getAttribute('data-d-component');
    if (!classes[type]) classes[type] = {tag:node.localName,className:node.getAttribute('class') || ''};
    if (type === 'math') {
      const value = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
      if(value) math[value] = node.innerHTML;
    }
  }
  const selectors = {
    buttonInner:'[data-d-component="button"] > span',
    table:'[data-d-component="table"] > table',
    radioLabel:'[data-d-component="radio"] label',
    radioWrapper:'[data-d-component="radio"] label > div',
    radioItem:'[data-d-component="radio"] [role="radio"]',
    radioIndicator:'[data-d-component="radio"] [role="radio"] > span',
    listMarker:'[data-d-component="list-item"] > span',
    listContent:'[data-d-component="list-item"] > div',
    listLabel:'[data-d-component="list-item"] [data-d-list-item-content]',
    sliderContainer:'[data-d-component="slider"] > div',sliderRoot:'[data-d-component="slider"] [data-slider-style]',sliderTrack:'[data-d-component="slider"] [data-slider-style] > span',sliderRange:'[data-d-component="slider"] [data-slider-style] > span > span',sliderThumb:'[data-d-component="slider"] [role="slider"]',sliderMarks:'[data-d-component="slider"] [data-mark] > span',sliderMark:'[data-d-component="slider"] [data-mark]',sliderMarksContainer:'[data-d-component="slider"] .MarksContainer-Zb701Z',
    segmentRoot:'[data-d-component="segmented-control"] [role="radiogroup"]',segmentThumb:'[data-d-component="segmented-control"] [role="radiogroup"] > div',segmentOption:'[data-d-component="segmented-control"] [role="radio"]',
    chartLegend:'.recharts-legend-wrapper > div',chartLegendItem:'.recharts-legend-wrapper > div > div',chartLegendMarker:'.recharts-legend-wrapper > div > div > div',chartLegendLabel:'.recharts-legend-wrapper > div > div > span',
  };
  for(const [name,selector] of Object.entries(selectors)) parts[name] = scope.querySelector(selector)?.className || '';
  const iconSignatures={'arrow-down':'M12.707 18.707','arrow-right':'M18.707 12.707','arrow-down-up':'m3 16','chevron-up':'M12 8a1','chevron-down':'M4.293 8.293','chevron-right':'M8.293 4.293','chevron-left':'M15.707 4.293',check:'M18.063 5.674',x:'M5.636 5.636','alert-circle':'M11 12C11','circle-dot':'M12 6C15','check-circle':'M12 4C7.58172',database:'M6.00633 5.5',lightbulb:'M12 3c3.585',layers:'M4.94845 4.68299',eye:'M5.91456 7.59106',info:'M13 12a1','x-circle':'M10.207 8.793','alert-triangle':'M12.8534 5.314'};
  for(const n of scope.querySelectorAll('[data-dil-message-id] [data-d-component="icon"]'))for(const [name,signature] of Object.entries(iconSignatures)) {
    if(n.querySelector('path')?.getAttribute('d')?.startsWith(signature)&&!icons[name])icons[name]={html:n.innerHTML,fill:n.getAttribute('fill')||'currentColor',stroke:n.getAttribute('stroke'),strokeWidth:n.getAttribute('stroke-width')};
  }
  for(const n of scope.querySelectorAll('[data-dil-message-id] [data-d-component="icon"]')) {
    const path=n.querySelector('path')?.getAttribute('d')||'';
    const name=path.includes('ZM12 6C12.5523')?'clock':n.querySelector('line[x1="6"][x2="6"][y1="3"]')?'git-branch':n.querySelector('line[x1="22"][x2="2"]')?'hard-drive':null;
    if(name&&!icons[name])icons[name]={html:n.innerHTML,fill:n.getAttribute('fill')||'none',stroke:n.getAttribute('stroke'),strokeWidth:n.getAttribute('stroke-width')};
  }
  for(const n of scope.querySelectorAll('pre')) {
    const content=n.querySelector('code')?.textContent||n.textContent;
    if(content)codeBlocks[content]=n.closest('[data-d-component="code-block"],.contain-inline-size')?.outerHTML||n.outerHTML;
  }
  for(const response of scope.querySelectorAll('[data-dil-message-id]')) {
    const quiz=[...response.children].find(n=>n.querySelector('[aria-label="复制测验"]')&&n.querySelector('[role="group"]'));
    if(quiz)quizTemplates[response.getAttribute('data-dil-message-id')]=quiz.outerHTML;
  }
  // Some page builds label a widget container explicitly; these are inert
  // templates for code/math only. Interactive model code is mounted separately.
  for(const n of scope.querySelectorAll('[data-invocation-id],[data-widget-invocation-id]')) {
    const id=n.getAttribute('data-invocation-id')||n.getAttribute('data-widget-invocation-id');
    widgetHtml[id]=n.innerHTML;
  }
  return {version:1,root,classes,parts,math,icons,widgetHtml,codeBlocks,quizTemplates,chartWidth:Number(scope.querySelector('[data-d-component="chart"] svg')?.getAttribute('width'))||708};
}

const defaults = {
  text:['p','TextBase-hXhSqg Text-lIMP0_'], bold:['span','TextBase-hXhSqg Text-lIMP0_'],title:['h2','TextBase-hXhSqg Title-HRvkwB'],
  caption:['span','TextBase-hXhSqg Caption-VSNpzV'], box:['div','Box-qIMv6G'], row:['div','Box-qIMv6G'], col:['div','Box-qIMv6G'],
  button:['button','Button-MckCnJ Button-ryTVE1'],pressable:['button','Box-qIMv6G Pressable-KyqH6M'],
  grid:['div','Grid-CGRmTR'],'grid-item':['div','Box-qIMv6G Item-ev4eoI'],
  table:['div','TableFrame-YxtDrz'],'table-row':['tr',''],'table-cell':['td',''],
  list:['ul','List-rH8nmc'],'list-item':['li','Item-O8JWQe'],
  badge:['div','Badge-_iijmO Badge-G_joSy'],code:['code','Code-kbs71c'],
  divider:['div','Divider-WkGDyu'],blockquote:['blockquote','Blockquote-_tKmqd'],
  'radio-group':['div','RadioGroup-tMSWPY RadioGroup-GK30Bw'],radio:['div','flex'],
  math:['div','Math-C48SKy'],spacer:['div','Spacer-XHDwL4'],celebration:['div','Frame-j1nM8v'],card:['div','Box-qIMv6G Card-Y_lNYj']
};
const partDefaults = {buttonInner:'ButtonInner-okLAMd',table:'Table-QT1UX2',radioLabel:'RadioLabel-aEyICO',radioWrapper:'RadioIndicatorWrapper-VjVXTu',radioItem:'RadioItem-eqbQKh',radioIndicator:'RadioIndicator-QSL7RM',listMarker:'Marker-aITPzz',listContent:'Content-OKAHK6',listLabel:'Label-B5tj_e'};
const space=v=>typeof v==='number'?`calc(var(--spacing, 0.25rem) * ${v})`:v;
const color=(v,kind='text')=>!v?undefined:/^(#|rgb|hsl|oklch|var\(|transparent|currentColor|white|black|none)/.test(v)?v:/^(?:text|surface|border)-/.test(v)?`var(--color-${v})`:v===kind||v==='default'?`var(--color-${kind})`:`var(--color-${kind}-${v})`;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function cleanHTML(html,resources={}) {
  // Templates are page DOM, so remove active content and network-bearing URLs.
  const doc=new DOMParser().parseFromString(`<body>${html}</body>`,'text/html');
  for(const n of doc.querySelectorAll('script,iframe,object,embed,link,meta')) n.remove();
  for(const n of doc.querySelectorAll('*')) for(const a of [...n.attributes]) {
    if(/^on/i.test(a.name)) n.removeAttribute(a.name);
    else if(['src','href','poster'].includes(a.name)&&!a.value.startsWith('#')&&!a.value.startsWith('data:')) {
      if(resources[a.value]) n.setAttribute(a.name,resources[a.value]);
      else n.removeAttribute(a.name);
    }
  }
  return doc.body.innerHTML;
}

export function createComponents(templates={}, record={}, onAction=()=>{}) {
  const cls=t=>templates.classes?.[t]?.className ?? defaults[t]?.[1] ?? '';
  const part=n=>templates.parts?.[n]||partDefaults[n]||'';
  const counts = new Map();
  const registry={};
  function propsFor(type,p={}) {
    const a={'data-d-component':type,className:cls(type)},style={};
    for(const k of ['id','title','dir','role','tabIndex','aria-label','aria-expanded','aria-describedby']) if(p[k]!=null) a[k]=p[k];
    for(const [k,v] of Object.entries(p)) if(k.startsWith('data-')||k.startsWith('aria-')) a[k]=v;
    for(const k of ['size','weight','align','justify','wrap']) if(p[k]!=null)a[`data-d-${k}`]=p[k];
    for(const k of ['width','height','flex','opacity','textAlign','fontSize','fontWeight']) if(p[k]!=null) {style[k]=p[k];if(k==='width'||k==='height')a[`data-d-has-${k}`]='';}
    if(p.color)style.color=color(p.color);
    if(p.background){style.backgroundColor=color(p.background,'surface');style['--smoothing-background-color']=style.backgroundColor;}
    if(p.radius)style.borderRadius=typeof p.radius==='number'?p.radius:p.radius==='full'?9999:`var(--radius-${p.radius})`;
    if(p.border){let b=p.border===true?{}:p.border;style.border=`${b.size??1}px solid ${color(b.color,'border')||'var(--color-border)'}`;a['data-d-has-border']='';}
    if(p.padding!=null){
      if(typeof p.padding==='object')for(const [k,v]of Object.entries(p.padding))style[`padding${k[0].toUpperCase()+k.slice(1)}`]=space(v);
      else {style.paddingBlock=space(p.padding);style.paddingInline=space(p.padding);for(const d of ['block-end','block-start','inline-end','inline-start'])style[`--w-box-gutter-${d}`]=space(p.padding);}
    }
    if(p.gap!=null)style.gap=space(p.gap);
    if(p.clip)style.overflow='hidden';
    if(p.tabularNums)a['data-d-tabular-nums']='';
    if(p.style)Object.assign(style,p.style);
    a.style=style;
    if(p.disabled){a.disabled=true;a['data-disabled']='';}
    if(p.onClick)a.onClick=p.onClick;
    return a;
  }
  function CodeBlock({content,html,invocationId,language}) {
    const ref=React.useRef(null),[wrapped,setWrapped]=React.useState(false);
    React.useEffect(()=>{
      const node=ref.current;
      for(const pre of node.querySelectorAll('pre')){pre.style.whiteSpace=wrapped?'pre-wrap':'pre';pre.style.minWidth=wrapped?'0':'max-content';pre.style.overflowWrap=wrapped?'anywhere':'normal';}
      for(const scroll of node.querySelectorAll('.chatgpt-code-scrollport'))scroll.style.minWidth=wrapped?'0':'';
      const button=[...node.querySelectorAll('button')].find(b=>/自动换行|word wrap|line wrap/i.test(b.getAttribute('aria-label')||''));
      if(button){button.setAttribute('aria-pressed',String(wrapped));button.setAttribute('aria-label',wrapped?'禁用自动换行':'启用自动换行');}
    },[wrapped,html]);
    const copy=async button=>{
      const doc=button.ownerDocument;
      const copied=await copyTextLocally(content,doc);
      if(copied){button.setAttribute('data-offline-copied','');button.setAttribute('title','已复制');}
      else {const pre=ref.current.querySelector('pre');if(pre){const range=doc.createRange();range.selectNodeContents(pre);const selection=doc.defaultView.getSelection();selection.removeAllRanges();selection.addRange(range);}button.setAttribute('title','已选中代码，请按 Ctrl+C 复制');}
    };
    const onClick=e=>{const button=e.target.closest?.('button');if(!button||!e.currentTarget.contains(button))return;const label=button.getAttribute('aria-label')||button.textContent||'';if(/复制|copy/i.test(label)){e.preventDefault();void copy(button);}else if(/自动换行|word wrap|line wrap/i.test(label)){e.preventDefault();setWrapped(v=>!v);}else if(/滚动到底部|scroll to bottom/i.test(label)){e.preventDefault();const scroll=ref.current.querySelector('.chatgpt-code-scrollport')||ref.current.querySelector('pre');if(scroll)scroll.scrollTop=scroll.scrollHeight;}};
    return h('div',{ref,'data-offline-widget':invocationId,'data-offline-code-block':'',onClick,...(html?{dangerouslySetInnerHTML:{__html:cleanHTML(html,templates.resourceMap)}}:{children:h('pre',null,h('code',{'data-language':language},content))})});
  }
  function Generic({type,p={},children}) {
    const inline=useContext(TextContext),inSvg=useContext(SvgContext),list=useContext(ListContext);
    const a=propsFor(type,p);
    let tag=defaults[type]?.[0]||'div';
    if(['text','bold','caption','title'].includes(type)) {
      if(inSvg)return h('text',{...p,className:undefined},children);
      a['data-d-text-flow']='';
      if(type==='bold'){a['data-d-component']='text';a.className=cls('text');a['data-d-default-strong']='';}
      if(inline||type==='bold'||type==='caption'||p.inline){tag='span';a['data-d-inline']='';}
      else if(type==='title'){tag=['xl','2xl','3xl'].includes(p.size)?'h1':p.size==='md'?'h3':'h2';a['data-d-weight']=p.weight||'semibold';}
      if(type==='caption'){a['data-d-size']=p.size||'lg';a['data-d-weight']=p.weight||'normal';}
      return h(tag,a,h(TextContext.Provider,{value:true},children));
    }
    if(['box','row','col','pressable','grid-item','card'].includes(type)) {
      a['data-d-direction']=p.direction||(type==='row'||type==='pressable'?'row':'col');
      if(p.gap==null&&p.padding==null)a['data-d-auto-spacing']='';
      if(inline||p.inline){tag='span';a['data-d-inline']='';}
      if(type==='pressable'){tag='button';a.type='button';}
      if(type==='card')a['data-d-variant']=p.variant||'default';
      if(type==='grid-item'){
        // The original renderer elides the cell wrapper only for a single
        // undecorated child. Multiple children must stay together in one cell.
        const transparent=p.variant==='transparent'||(!p.variant&&React.Children.count(children)===1&&!['padding','gap','border','background','radius','style'].some(k=>p[k]!=null));
        if(p.variant||transparent)a['data-d-variant']=p.variant||'transparent';
        a.style['--grid-item-column']=p.column||'auto';a.style['--grid-item-row']=p.row||'auto';
        if(transparent)a.style.gap=space(p.gap??0);
      }
    }
    if(type==='grid')a.style.gridTemplateColumns=typeof p.columns==='number'?`repeat(${p.columns}, minmax(0px, 1fr))`:p.columns;
    if(type==='button') {
      a.type='button';a['data-color']=p.color||'primary';a['data-variant']=p.variant||'solid';a['data-size']=p.size||'lg';a['data-pill']='';
      delete a['data-d-size'];delete a.style.color;a.style['--scale']=0.96;
      if(p.block){a['data-block']='';a['data-d-block']='';a.style.width='100%';}
      return h('button',a,h('span',{className:part('buttonInner')},children));
    }
    if(type==='badge') {
      if(p.inline||inline)tag='span';
      a['data-color']=p.color||'secondary';a['data-variant']=p.variant||'soft';a['data-size']=p.size||'sm';a['data-pill']='';a['data-d-weight']=p.weight||'medium';
      delete a['data-d-size'];delete a.style.color;
    }
    if(type==='table')return h('div',{...a,'data-d-column-sizing':p.columnSizing||'auto'},h('table',{className:part('table'),'data-d-column-sizing':p.columnSizing||'auto','data-d-dividers':'',style:{tableLayout:'auto'}},h('tbody',null,children)));
    if(type==='table-cell'){tag=p.header?'th':'td';a['data-d-valign']=p.valign||'start';}
    if(type==='list') {
      tag=p.marker==='number'?'ol':'ul';a['data-d-marker']=p.marker||'bullet';a['data-d-marker-layout']='custom';if(p.connector)a['data-d-connector']=p.connector;
      a.style['--d-list-row-gap']=space(p.gap??2);
      return h(tag,a,h(ListContext.Provider,{value:p},children));
    }
    if(type==='list-item') {
      a['data-d-marker']=list.marker||'bullet';a['data-d-marker-layout']='custom';if(list.connector)a['data-d-connector']=list.connector;
      return h('li',a,h('span',{className:part('listMarker'),'data-d-marker':a['data-d-marker'],'aria-hidden':true}),h('div',{className:part('listContent')},h('div',{className:part('listLabel'),'data-d-list-item-content':''},children)));
    }
    if(type==='divider'){a.style['--divider-color']=color(p.color,'border')||'var(--color-border-subtle)';a.style['--divider-size']=`${p.size||1}px`;}
    if(type==='code')return h('code',a,children);
    return h(tag,a,children);
  }
  for(const type of Object.keys(defaults))registry[type]=({children,...p})=>h(Generic,{type,p},children);
  registry.card=({children,...p})=>h(Generic,{type:'card',p:{border:true,radius:'3xl',background:'surface-elevated',padding:4,...p}},children);
  registry.chart=makeChartComponent(templates);
  registry['pie-chart']=makeChartComponent(templates,true);
  registry.slider=({min=0,max=100,step=1,value=min,onChange,marks=[],disabled=false,'aria-label':label='Slider'})=>{
    const number=Number(value),percent=Math.max(0,Math.min(100,(number-min)/(max-min)*100));
    const change=e=>{if(!disabled)onChange?.(Number(e.currentTarget.value));};
    return h('div',{'data-d-component':'slider',className:cls('slider')||'Slider-veC4c6'},h('style',null,'input[data-offline-slider]::-webkit-slider-runnable-track{height:24px;background:transparent;border:0}input[data-offline-slider]::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;background:transparent;border:0}input[data-offline-slider]::-moz-range-track{background:transparent;border:0}input[data-offline-slider]::-moz-range-thumb{background:transparent;border:0}input[data-offline-slider]:focus-visible{outline:2px solid var(--color-border);outline-offset:2px}'),h('div',{className:part('sliderContainer')||'SliderContainer-csaRc8',style:{position:'relative'}},h('span',{dir:'ltr','data-orientation':'horizontal','data-slider-style':'continuous',className:part('sliderRoot')||'Root-NumEJ3',style:{'--radix-slider-thumb-transform':'translateX(-50%)'}},h('span',{'data-orientation':'horizontal',className:part('sliderTrack')||'Track-J8JrvV'},h('span',{className:part('sliderRange')||'Range-OINGKj',style:{left:'0%',right:`${100-percent}%`}})),h('span',{style:{transform:'var(--radix-slider-thumb-transform)',position:'absolute',left:`calc(${percent}% + ${10-percent/5}px)`}},h('span',{className:part('sliderThumb')||'Thumb-ZDGlbm'})),h('input',{type:'range','data-offline-slider':'',min,max,step,value:number,disabled,'aria-label':label,onInput:change,onChange:change,style:{position:'absolute',inset:0,margin:0,width:'100%',height:'100%',appearance:'none',WebkitAppearance:'none',background:'transparent',cursor:'pointer',zIndex:2}})),marks.length?h('div',{className:part('sliderMarksContainer')||'MarksContainer-Zb701Z',style:{height:26}},marks.map((mark,i)=>h('div',{key:i,className:part('sliderMark')||'Mark-wqRjbk','data-mark':true,style:{left:`${(Number(mark.value??mark)-min)/(max-min)*100}%`,transform:i===marks.length-1?'translateX(-100%)':i===0?'none':'translateX(-50%)'}},h('span',{className:part('sliderMarks')||'MarkLabel-TlZ8aM'},mark.label??mark.value??mark)))):null));
  };
  registry['segmented-control']=({value,onChange,options=[],size='lg',disabled=false})=>{
    const ref=React.useRef(null),[position,setPosition]=React.useState({left:0,width:0});
    React.useLayoutEffect(()=>{const node=ref.current,active=node.querySelector('[aria-checked="true"]');if(active)setPosition(old=>old.left===active.offsetLeft&&old.width===active.offsetWidth?old:{left:active.offsetLeft,width:active.offsetWidth});},[value,options]);
    return h('div',{'data-d-component':'segmented-control',className:cls('segmented-control')||'SegmentedControl-H_wCVX'},h('div',{ref,dir:'ltr',role:'radiogroup','aria-label':'Options',className:part('segmentRoot')||'SegmentedControl-QpvYX9','data-pill':'','data-variant':'ghost','data-size':size},h('div',{className:part('segmentThumb')||'SegmentedControlThumb-q65vDK',style:{width:position.width,transform:`translateX(${position.left}px)`}}),options.map((option,i)=>{const v=typeof option==='object'?option.value:option,label=typeof option==='object'?option.label:option,selected=String(v)===String(value);return h('button',{key:i,type:'button',role:'radio','aria-label':label,'aria-checked':selected,'data-state':selected?'on':'off',className:part('segmentOption')||'SegmentedControlOption-y4aI7a',disabled:disabled||option.disabled,onClick:()=>onChange?.(v),onKeyDown:e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const next=options[(i+(e.key==='ArrowLeft'?-1:1)+options.length)%options.length];onChange?.(typeof next==='object'?next.value:next);}}},h('span',{className:'relative'},label));})));
  };
  registry['radio-group']=({children,...p})=> {
    const a=propsFor('radio-group',p);a.role='radiogroup';a['aria-label']=p['aria-label']||'Options';a['aria-required']=!!p.required;a['data-direction']=p.direction==='horizontal'?'row':p.direction==='vertical'?'col':p.direction||'col';a.tabIndex=0;a.style.outline='none';
    delete a['data-d-direction'];
    const onKeyDown=e=>{if(!['ArrowDown','ArrowRight','ArrowUp','ArrowLeft'].includes(e.key))return;const buttons=[...e.currentTarget.querySelectorAll('[role="radio"]:not(:disabled)')];const cur=buttons.findIndex(b=>b.getAttribute('aria-checked')==='true');const next=(cur+(['ArrowUp','ArrowLeft'].includes(e.key)?-1:1)+buttons.length)%buttons.length;buttons[next]?.click();buttons[next]?.focus();e.preventDefault();};
    return h('div',{...a,onKeyDown},h(RadioContext.Provider,{value:p},children));
  };
  registry.radio=({children,...p})=> {
    const group=useContext(RadioContext),id=useId(),checked=String(group.value)===String(p.value),state=checked?'checked':'unchecked';
    const select=()=>{if(!p.disabled&&!group.disabled)group.onChange?.(p.value);};
    return h('div',{'data-d-component':'radio',className:cls('radio')},h('label',{className:part('radioLabel'),htmlFor:id},h('div',{className:part('radioWrapper')},h('button',{id,className:part('radioItem'),type:'button',role:'radio','aria-checked':checked,'data-state':state,'data-radix-collection-item':'',value:p.value,tabIndex:checked?0:-1,disabled:p.disabled||group.disabled,onClick:select},checked&&h('span',{className:part('radioIndicator'),'data-state':state}))),children));
  };
  registry.svg=({children,...p})=>h('svg',{...p,'data-d-component':'svg',fill:p.fill||'currentColor',xmlns:'http://www.w3.org/2000/svg'},h(SvgContext.Provider,{value:true},children));
  for(const t of ['path','circle','rect','line','ellipse','polygon','polyline','g','defs','linearGradient','stop'])registry[t]=({children,...p})=>h(t,p,children);
  const iconPaths={
    check:'M20 6L9 17l-5-5',x:'M6 6l12 12M18 6L6 18','chevron-down':'m6 9 6 6 6-6','chevron-up':'m6 15 6-6 6 6','arrow-down':'M12 4v16m-6-6 6 6 6-6','arrow-right':'M4 12h16m-6-6 6 6-6 6','arrow-right-left':'M3 7h18m-5-5 5 5-5 5M21 17H3m5-5-5 5 5 5',clock:'M12 8v4l3 2','check-circle':'m8 12 3 3 5-6',circle:'','circle-dot':'M12 12h.01',database:'M4 6c0-4 16-4 16 0v12c0 4-16 4-16 0Zm0 6c0 4 16 4 16 0',lock:'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5Z'};
  registry.icon=({name,size=18,color:co='secondary',...p})=> {
    const html=templates.icons?.[name];
    const style={color:color(co),fontSize:size,...(p.inline?{display:'inline-block',verticalAlign:'text-bottom'}:{})};
    if(html)return h('svg',{'data-d-component':'icon',...(p.inline?{'data-d-inline':''}:{}),viewBox:'0 0 24 24',width:'1em',height:'1em',fill:html.fill,stroke:html.stroke||undefined,strokeWidth:html.strokeWidth||undefined,style,dangerouslySetInnerHTML:{__html:cleanHTML(html.html,templates.resourceMap)}});
    const round=['clock','check-circle','circle-dot','circle'].includes(name);
    return h('svg',{'data-d-component':'icon',...(p.inline?{'data-d-inline':''}:{}),viewBox:'0 0 24 24',width:'1em',height:'1em',fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round',strokeLinejoin:'round',style},round&&h('circle',{cx:12,cy:12,r:9}),h('path',{d:iconPaths[name]||iconPaths['circle-dot']}));
  };
  registry.math=({value,block=true})=>h(block?'div':'span',{className:cls('math'),'data-d-component':'math',...(block?{'data-d-block':''}:{}),dir:'ltr',...(templates.math?.[value]?{dangerouslySetInnerHTML:{__html:cleanHTML(templates.math[value],templates.resourceMap)}}:{children:value})});
  registry.image=registry.img=({src,alt='',...p})=>h('img',{...propsFor('image',p),alt,src:src?.startsWith('data:')?src:templates.resourceMap?.[src]});
  registry.__chatgptClientDefinedWidget=({invocationId})=> {
    const def=record.clientDefinedWidgets?.[invocationId];
    const reference=record.contentReferences?.[def?.refIndex];
    if(reference?.category==='code_block') {
      const content=reference.data?.content||'';
      const html=templates.codeBlocks?.[content];
      return h(CodeBlock,{content,html,invocationId,language:reference.data?.language});
    }
    if(reference?.category==='math')return h(registry.math,{value:reference.data?.value||reference.data?.content||reference.matched_text});
    const html=templates.widgetHtml?.[invocationId];
    if(html)return h('div',{'data-offline-widget':invocationId,dangerouslySetInnerHTML:{__html:cleanHTML(html,templates.resourceMap)}});
    const result=record.appData?.opGenui?.componentResults?.[invocationId];
    if(result?.type==='math'||def?.type==='math')return h(registry.math,{value:result?.value||def?.value});
    if(result?.type==='text'||def?.type==='text')return h(registry.text,null,result?.value||def?.value);
    return h('span',{'data-offline-widget':invocationId,'data-offline-pending':''},def?.label||'');
  };
  return {registry,counts,propsFor,cleanHTML,onAction};
}
