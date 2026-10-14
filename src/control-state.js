// Read standard DOM control values only. Persist a value only when the compiled
// program has one unambiguous, direct binding to a named DIL state hook.
export function captureControlState(record,root){
 const viewState={...(record.viewState||{})},keys=new Map();
 for(const match of record.code.matchAll(/const\s+\[\s*([\w$]+)\s*,[^\]]+\]\s*=\s*DIL\.useState\([\s\S]{0,160}?\{\s*(?:key|"key"|'key')\s*:\s*["']([^"']+)["']/g))keys.set(match[1],match[2]);
 for(const type of ['slider','segmented-control']){
  const matches=[...record.code.matchAll(new RegExp(`__dil\\.jsx\\("${type}"\\s*,\\s*\\{([^}]*)\\}`,'g'))];
  const nodes=[...root.querySelectorAll(`[data-d-component="${type}"]`)];
  if(matches.length!==1||nodes.length!==1)continue;
  const variable=matches[0][1].match(/"value"\s*:\s*([\w$]+)\s*(?:,|$)/)?.[1],key=keys.get(variable);if(!key)continue;
  if(type==='slider'){
   const slider=nodes[0].querySelector('[role="slider"],input[type="range"]');
   const value=Number(slider?.getAttribute('aria-valuenow')??slider?.value);if(slider&&Number.isFinite(value))viewState[key]=value;
  }else{
   const selected=nodes[0].querySelector('[aria-checked="true"]');
   const constant=matches[0][1].match(/"options"\s*:\s*__dilConstants\["([^"]+)"\]/)?.[1];
   const options=record.constants?.[constant];const option=Array.isArray(options)?options.find(o=>o.label===(selected?.getAttribute('aria-label')||selected?.textContent.trim())):null;
   if(option)viewState[key]=option.value;
  }
 }
 return {...record,viewState};
}
