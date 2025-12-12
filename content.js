// content.js - injects inject.js into page context
const s = document.createElement('script');
s.src = chrome.runtime.getURL('inject.js');
s.type = 'text/javascript';
s.onload = function(){ this.remove(); };
(document.head || document.documentElement).appendChild(s);
