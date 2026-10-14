chrome.action.onClicked.addListener(async tab=>{
  if(!/^https:\/\/chatgpt\.com\/(?:c\/|g\/[^/]+\/c\/|g\/g-p-[^/]+\/c\/)/.test(tab.url||'')){
    await chrome.action.setBadgeText({tabId:tab.id,text:'聊天'});
    await chrome.action.setBadgeBackgroundColor({tabId:tab.id,color:'#b45309'});
    return;
  }
  await chrome.tabs.create({url:chrome.runtime.getURL(`export.html?tab=${tab.id}`)});
});
chrome.runtime.onMessage.addListener(message=>{
  if(!['archive-finished','archive-job-error'].includes(message.type)||!Number.isInteger(message.sourceTabId))return;
  chrome.action.setBadgeText({tabId:message.sourceTabId,text:message.type==='archive-finished'?'✓':'!'}).catch(()=>{});
  chrome.action.setBadgeBackgroundColor({tabId:message.sourceTabId,color:message.type==='archive-finished'?'#15803d':'#b45309'}).catch(()=>{});
});
