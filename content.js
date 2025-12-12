// content.js - injects inject.js into page context
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.type = 'text/javascript';
script.onload = function(){ this.remove(); };
(document.head || document.documentElement).appendChild(script);
