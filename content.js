function injectScript(file) {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL(file);
    s.onload = () => s.remove();
    document.documentElement.appendChild(s);
}

injectScript("inject.js");
