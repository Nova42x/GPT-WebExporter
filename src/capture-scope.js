// The active conversation DOM is the export boundary. Offscreen loaded messages
// are included, but hidden panels and previously visited chats are excluded.
export function isDisplayed(element) {
  for(let n=element;n?.nodeType===1;n=n.parentElement){
    if(n.hidden||n.hasAttribute('inert')||n.getAttribute('aria-hidden')==='true')return false;
    const style=n.ownerDocument.defaultView?.getComputedStyle(n);
    if(style?.display==='none'||['hidden','collapse'].includes(style?.visibility))return false;
  }
  return true;
}
export function displayedMessageRoots(document) {
  const mains=[...document.querySelectorAll('main,[role="main"]')].filter(isDisplayed);
  const scope=mains[0]||(!document.querySelector('main,[role="main"]')?document:null);
  if(!scope)return [];
  const modern=[...scope.querySelectorAll('[data-content-search-unit-key]')].filter(e=>isDisplayed(e)&&(e.querySelector('[data-conversation-role]')||/:(?:user|assistant)$/.test(e.getAttribute('data-content-search-unit-key')||'')));
  if(modern.length)return [...new Set(modern.map(e=>e.parentElement?.getAttribute('data-chatgpt-search-unit-key')===e.getAttribute('data-content-search-unit-key')?e.parentElement:e))];
  const articles=[...scope.querySelectorAll('article[data-testid^="conversation-turn"],article[data-turn]')].filter(isDisplayed);
  if(articles.length)return articles;
  return [...scope.querySelectorAll('[data-message-author-role]')].filter(isDisplayed);
}
export function restrictToCurrentMessages(messages,source,currentId,warnings) {
  if(!currentId||source.conversationId!==currentId||!source.messages?.length)return messages;
  const allowed=new Set(source.messages.flatMap(m=>[m.id||m.messageId,...(m.sourceMessageIds||[])]));
  const selected=messages.filter(m=>allowed.has(m.id));
  if(selected.length!==messages.length)warnings.push(`未能匹配当前会话的 ${messages.length-selected.length} 条页面残留消息，未导出。`);
  return selected;
}
