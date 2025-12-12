// inject.js — runs inside the NSE page context (can access DOM + __NEXT_DATA__)
(function(){
  if (window.__NSE_OI_EXT_INJECTED) return;
  window.__NSE_OI_EXT_INJECTED = true;

  /*****************************
   Config
  *****************************/
  const MOBILE_WIDTH = 320;
  const DEFAULT_VISIBLE = 5;      // default number of visible strikes
  const POLL_MS = 900;            // quick poll for changes
  const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes snapshot

  /*****************************
   State
  *****************************/
  let visibleCount = DEFAULT_VISIBLE;
  let lastTableSnapshot = '';
  let historySnapshots = []; // {time, data: {strike: {ceOI,peOI,ceChg,peChg}}}
  let lastSnapshotTime = 0;
  let popupWindow = null;

  /*****************************
   Utilities
  *****************************/
  function nowMs(){ return Date.now(); }

  function safeGet(fn, fallback=null){
    try{ return fn() }catch(e){ return fallback; }
  }

  function formatNumber(n){
    if (n === null || n === undefined) return '0';
    if (Math.abs(n) >= 100000) return Math.round(n/1000)+'k';
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function pctChange(newV, oldV){
    if (!oldV || oldV === 0) {
      return {text: '0.0%', color: '#6c757d', val: 0};
    }
    const diff = ((newV - oldV) / Math.abs(oldV)) * 100;
    return { text: (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%', color: diff>=0 ? '#0b8b3b' : '#c82333', val: diff };
  }

  /*****************************
   DOM creation: floating mobile-size draggable card
  *****************************/
  function createUI(){
    if (document.getElementById('nse-oi-card')) return;

    const card = document.createElement('div');
    card.id = 'nse-oi-card';
    card.innerHTML = `
      <div id="nse-oi-head">
        <div id="nse-oi-title">OI Histogram</div>
        <div id="nse-oi-actions">
          <button id="nse-oi-detach" title="Pop-out">Detach</button>
          <button id="nse-oi-close" title="Close">✕</button>
        </div>
      </div>

      <div id="nse-oi-controls">
        <button id="nse-oi-dec" class="small">−</button>
        <div id="nse-oi-count">${visibleCount}</div>
        <button id="nse-oi-inc" class="small">+</button>

        <div id="nse-oi-mode">
          <label><input type="checkbox" id="nse-oi-autocenter" checked/> Keep ATM center</label>
        </div>
      </div>

      <div id="nse-oi-body">
        <div id="nse-oi-list"></div>
      </div>

      <div id="nse-oi-foot">
        <div id="nse-oi-last">Last updated: -</div>
        <div id="nse-oi-hint">ATM centered • CE red • PE green • Δ CE orange • Δ PE blue</div>
      </div>
    `;

    document.documentElement.appendChild(card);

    // events
    document.getElementById('nse-oi-close').addEventListener('click', ()=>card.remove());
    document.getElementById('nse-oi-inc').addEventListener('click', ()=>{ visibleCount = Math.min(visibleCount+1, 20); document.getElementById('nse-oi-count').innerText = visibleCount; renderLatest(); });
    document.getElementById('nse-oi-dec').addEventListener('click', ()=>{ visibleCount = Math.max(1, visibleCount-1); document.getElementById('nse-oi-count').innerText = visibleCount; renderLatest(); });
    document.getElementById('nse-oi-detach').addEventListener('click', detachPopup);

    makeDraggable(card, document.getElementById('nse-oi-head'));
  }

  function makeDraggable(el, handle){
    el.style.position = 'fixed';
    el.style.top = '80px';
    el.style.left = '12px';
    el.style.zIndex = 2147483647;

    let offsetX=0, offsetY=0, down=false;

    handle.style.cursor = 'grab';
    handle.addEventListener('pointerdown', (e)=>{
      down = true;
      offsetX = e.clientX - el.getBoundingClientRect().left;
      offsetY = e.clientY - el.getBoundingClientRect().top;
      handle.setPointerCapture(e.pointerId);
      handle.style.cursor = 'grabbing';
    });

    window.addEventListener('pointermove', (e)=>{
      if (!down) return;
      let x = e.clientX - offsetX;
      let y = e.clientY - offsetY;
      // clamp within viewport
      const w = Math.max(320, el.offsetWidth);
      const maxLeft = window.innerWidth - w - 6;
      x = Math.max(6, Math.min(x, maxLeft));
      y = Math.max(6, Math.min(y, window.innerHeight - 100));
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    });

    window.addEventListener('pointerup', (e)=>{
      if (!down) return;
      down = false;
      handle.releasePointerCapture && handle.releasePointerCapture(e.pointerId);
      handle.style.cursor = 'grab';
    });
  }

  /*****************************
   Data extraction from page
   Prefer __NEXT_DATA__ path, fallback to table DOM if necessary
  *****************************/
  function extractFromNextData(){
    const s = document.querySelector('#__NEXT_DATA__');
    if (!s) return null;
    let json;
    try { json = JSON.parse(s.textContent); } catch(e){ return null; }
    // try multiple known paths
    const records = safeGet(()=> json.props.pageProps.data.records) || safeGet(()=> json.props.pageProps.optionChain) || null;
    if (!records || !Array.isArray(records.data)) return null;
    const underlying = records.underlyingValue || json?.props?.pageProps?.underlyingValue || null;
    // Normalize array
    const arr = records.data.map(item => ({
      strike: item.strikePrice,
      CE: item.CE || null,
      PE: item.PE || null
    }));
    return {arr, underlying, expiryDates: records.expiryDates || records.expiries || []};
  }

  function extractFromTable(){
    // older DOM structure fallback
    const table = document.querySelector('.opttbldata') || document.querySelector('table'); // fallback
    if (!table) return null;
    const rows = [...table.querySelectorAll('tbody tr')];
    if (!rows.length) return null;
    const arr = rows.map(r=>{
      const td = r.querySelectorAll('td');
      // many NSE pages have fixed column positions — this is best-effort
      return {
        strike: parseFloat(td[11]?.innerText.replace(/,/g,'') || td[td.length-10]?.innerText.replace(/,/g,'') || 0),
        CE: {
          openInterest: parseFloat(td[1]?.innerText.replace(/,/g,'') || 0),
          changeinOpenInterest: parseFloat(td[2]?.innerText.replace(/,/g,'') || 0),
        },
        PE: {
          openInterest: parseFloat(td[21]?.innerText.replace(/,/g,'') || 0),
          changeinOpenInterest: parseFloat(td[20]?.innerText.replace(/,/g,'') || 0),
        },
      };
    });
    const spotEl = document.querySelector('#underlyingSpot') || document.querySelector('.underlying-price') || null;
    const underlying = spotEl ? parseFloat(spotEl.innerText.replace(/,/g,'')) : null;
    return {arr, underlying, expiryDates: []};
  }

  function readOptionChain(){
    // try __NEXT_DATA__ first
    const n = extractFromNextData();
    if (n) return n;
    return extractFromTable();
  }

  /*****************************
   Snapshot / history logic for 5-minute change
  *****************************/
  function pushHistorySnapshot(dataMap){
    const t = nowMs();
    historySnapshots.push({time: t, data: dataMap});
    // keep last 30 snapshots to bound memory (e.g. last ~30 * poll interval)
    if (historySnapshots.length > 60) historySnapshots.shift();
    // Persist minimally to localStorage so popout can use across reload (same origin)
    try { localStorage.setItem('nse_oi_history', JSON.stringify(historySnapshots)); } catch(e){}
    lastSnapshotTime = t;
  }

  function loadHistory(){
    try {
      const raw = localStorage.getItem('nse_oi_history');
      if (raw) historySnapshots = JSON.parse(raw);
    } catch(e){}
  }

  function findSnapshotClosestTo(targetTimeMs){
    if (!historySnapshots.length) return null;
    let best = historySnapshots[0];
    let bestDiff = Math.abs(best.time - targetTimeMs);
    for (const s of historySnapshots){
      const d = Math.abs(s.time - targetTimeMs);
      if (d < bestDiff){ best = s; bestDiff = d; }
    }
    return best;
  }

  /*****************************
   Render logic: build visible rows, center ATM
  *****************************/
  function renderLatest(){
    const data = readOptionChain();
    if (!data || !data.arr || !data.arr.length) return;

    // normalize to rows with numbers
    const rows = data.arr.map(it => ({
      strike: Number(it.strike),
      ceOI: Number(it.CE?.openInterest || 0),
      peOI: Number(it.PE?.openInterest || 0),
      ceChg: Number(it.CE?.changeinOpenInterest || 0),
      peChg: Number(it.PE?.changeinOpenInterest || 0)
    }));

    // sort descending by strike (top -> bottom)
    rows.sort((a,b)=>b.strike - a.strike);

    // find ATM (closest to underlying)
    const spot = Number(data.underlying || 0);
    let atm = rows[ Math.floor(rows.length/2) ];
    if (spot && !isNaN(spot)){
      atm = rows.reduce((p,c)=> Math.abs(c.strike - spot) < Math.abs(p.strike - spot) ? c : p, rows[0]);
    }

    // determine slice so ATM is centered in visibleCount
    const half = Math.floor(visibleCount / 2);
    const atmIndex = rows.findIndex(r=> r.strike === atm.strike);
    let start = Math.max(0, atmIndex - half);
    let end = start + visibleCount;
    if (end > rows.length){ end = rows.length; start = Math.max(0, end - visibleCount); }

    // ensure visibleCount length by padding if possible
    let visible = rows.slice(start, end);

    // Build a quick map for current snapshot
    const nowMap = {};
    visible.forEach(r => {
      nowMap[r.strike] = { ceOI: r.ceOI, peOI: r.peOI, ceChg: r.ceChg, peChg: r.peChg };
    });

    // If snapshot older than SNAPSHOT_INTERVAL_MS, push new snapshot
    const tNow = nowMs();
    if (!lastSnapshotTime || (tNow - lastSnapshotTime) >= SNAPSHOT_INTERVAL_MS){
      pushHistorySnapshot(nowMap);
    } else {
      // still push rolling snapshots periodically every minute for better res match
      // (optional) we can push every minute
      if (tNow - lastSnapshotTime >= 60*1000){ pushHistorySnapshot(nowMap); }
    }

    // find snapshot close to 5 minutes ago
    const target = tNow - SNAPSHOT_INTERVAL_MS;
    const snap = findSnapshotClosestTo(target);

    // render UI rows
    const list = document.getElementById('nse-oi-list');
    if (!list) return;
    list.innerHTML = ''; // clear

    visible.forEach(r=>{
      // compute pct changes vs snapshot
      let cePct = {text:'0.0%', color:'#6c757d'}, pePct = {text:'0.0%', color:'#6c757d'};
      let ceChPct = {text:'0.0%', color:'#6c757d'}, peChPct = {text:'0.0%', color:'#6c757d'};
      if (snap && snap.data && snap.data[r.strike]){
        cePct = pctChange(r.ceOI, snap.data[r.strike].ceOI);
        pePct = pctChange(r.peOI, snap.data[r.strike].peOI);
        ceChPct = pctChange(r.ceChg, snap.data[r.strike].ceChg);
        peChPct = pctChange(r.peChg, snap.data[r.strike].peChg);
      }

      const row = document.createElement('div');
      row.className = 'nse-oi-row';
      if (r.strike === atm.strike) row.classList.add('atm-row');

      /* Build inner HTML:
         left: strike label
         then four horizontal stacked items in order: CE, PE, CEchg, PEchg
         each shows colored bar + numeric value + pct-change small label
      */
      row.innerHTML = `
        <div class="nse-oi-strike">${r.strike}</div>

        <div class="nse-oi-block">
          <div class="nse-oi-bar ce" style="width:${Math.min(1000, r.ceOI/Math.max(1, rows[0].ceOI||1))*1.0}px"></div>
          <div class="nse-oi-val">${formatNumber(r.ceOI)}</div>
          <div class="nse-oi-pct" style="color:${cePct.color}">${cePct.text}</div>
        </div>

        <div class="nse-oi-block">
          <div class="nse-oi-bar pe" style="width:${Math.min(1000, r.peOI/Math.max(1, rows[0].peOI||1))*1.0}px"></div>
          <div class="nse-oi-val">${formatNumber(r.peOI)}</div>
          <div class="nse-oi-pct" style="color:${pePct.color}">${pePct.text}</div>
        </div>

        <div class="nse-oi-block">
          <div class="nse-oi-bar ce-chg" style="width:${Math.min(600, Math.abs(r.ceChg)/Math.max(1, Math.abs(rows[0].ceChg)||1))*1.0}px"></div>
          <div class="nse-oi-val">${formatNumber(r.ceChg)}</div>
          <div class="nse-oi-pct" style="color:${ceChPct.color}">${ceChPct.text}</div>
        </div>

        <div class="nse-oi-block">
          <div class="nse-oi-bar pe-chg" style="width:${Math.min(600, Math.abs(r.peChg)/Math.max(1, Math.abs(rows[0].peChg)||1))*1.0}px"></div>
          <div class="nse-oi-val">${formatNumber(r.peChg)}</div>
          <div class="nse-oi-pct" style="color:${peChPct.color}">${peChPct.text}</div>
        </div>
      `;

      list.appendChild(row);
    });

    // last updated
    document.getElementById('nse-oi-last').innerText = 'Last updated: ' + (new Date()).toLocaleTimeString();

    // send data to popup if present
    if (popupWindow && !popupWindow.closed){
      try { popupWindow.receiveData && popupWindow.receiveData({ visible, atmStrike: atm.strike, time: tNow }); }
      catch(e){ /* ignore */ }
    }
  }

  /*****************************
   Auto select nearest expiry when page loads & when expiry list appears
  *****************************/
  function autoSelectExpiryIfPresent(){
    // Many NSE pages have <select name="expiryDate"> or a custom select.
    const sel = document.querySelector('select[name="expiryDate"], select#expiryDate');
    if (!sel) return;
    if (sel.options.length === 0) return;
    // choose the expiry that is closest to today (first future expire)
    sel.selectedIndex = 0;
    sel.dispatchEvent(new Event('change', { bubbles:true }));
  }

  /*****************************
   Detach / Pop-out functionality
  *****************************/
  function detachPopup(){
    // open small popup (same origin as opener)
    if (popupWindow && !popupWindow.closed){
      popupWindow.focus();
      return;
    }
    popupWindow = window.open('', 'nse_oi_popup', `width=${MOBILE_WIDTH+40},height=640`);
    if (!popupWindow) { alert('Popup blocked. Allow popups for this site.'); return; }

    // write minimal HTML with styles and a container
    const doc = popupWindow.document;
    doc.open();
    doc.write(`
      <html>
        <head>
          <title>OI Histogram (detached)</title>
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <style>
            body{font-family:Inter,Arial,sans-serif;margin:8px;background:#fff}
            .title{font-weight:700;margin-bottom:8px}
            #popup-list{max-height:86vh;overflow:auto}
            .nse-oi-row{display:flex;align-items:center;padding:6px 4px;border-bottom:1px solid #eee}
            .nse-oi-strike{width:60px;font-weight:700}
            .nse-oi-block{display:flex;align-items:center;margin-right:6px}
            .nse-oi-bar{height:10px;border-radius:5px;margin-right:6px}
            .ce{background:#ff3b30}
            .pe{background:#2ecc71}
            .ce-chg{background:#ff8c00}
            .pe-chg{background:#0a84ff}
            .nse-oi-val{width:64px;text-align:right;margin-right:6px;font-size:12px}
            .nse-oi-pct{width:56px;text-align:right;font-size:11px}
            .atm-row{background:#fff7e6;border-left:4px solid orange}
          </style>
        </head>
        <body>
          <div class="title">OI Histogram (detached)</div>
          <div id="popup-list"></div>
          <script>
            // child receives data from opener via window.receiveData
            window.receiveData = function(payload){
              const list = document.getElementById('popup-list');
              if (!payload || !payload.visible) return;
              const visible = payload.visible;
              const atm = payload.atmStrike;
              list.innerHTML = '';
              visible.forEach(r=>{
                const ceBarW = Math.min(140, r.ceOI/Math.max(1, visible[0].ceOI||1)*140);
                const peBarW = Math.min(140, r.peOI/Math.max(1, visible[0].peOI||1)*140);
                const ceChW = Math.min(120, Math.abs(r.ceChg)/Math.max(1, Math.abs(visible[0].ceChg)||1)*120);
                const peChW = Math.min(120, Math.abs(r.peChg)/Math.max(1, Math.abs(visible[0].peChg)||1)*120);
                const div = document.createElement('div');
                div.className = 'nse-oi-row' + (r.strike === atm ? ' atm-row' : '');
                div.innerHTML = \`
                  <div class="nse-oi-strike">\${r.strike}</div>
                  <div class="nse-oi-block"><div class="nse-oi-bar ce" style="width:\${ceBarW}px"></div><div class="nse-oi-val">\${r.ceOI.toLocaleString()}</div></div>
                  <div class="nse-oi-block"><div class="nse-oi-bar pe" style="width:\${peBarW}px"></div><div class="nse-oi-val">\${r.peOI.toLocaleString()}</div></div>
                  <div class="nse-oi-block"><div class="nse-oi-bar ce-chg" style="width:\${ceChW}px"></div><div class="nse-oi-val">\${r.ceChg.toLocaleString()}</div></div>
                  <div class="nse-oi-block"><div class="nse-oi-bar pe-chg" style="width:\${peChW}px"></div><div class="nse-oi-val">\${r.peChg.toLocaleString()}</div></div>
                \`;
                list.appendChild(div);
              });
            };
            // Inform opener that popup ready
            window.opener && window.opener.postMessage && window.opener.postMessage({nseOIpopupReady:true}, '*');
          <\/script>
        </body>
      </html>
    `);
    doc.close();
  }

  // Listen for message from popup if needed
  window.addEventListener('message', (ev)=>{
    // can be used for handshake; currently unused
  });

  /*****************************
   Auto-refresh & change detection
  *****************************/
  function startLoop(){
    loadHistory();
    createUI();
    autoSelectExpiryIfPresent();
    // initial render after slight delay (allow page to populate)
    setTimeout(renderLatest, 800);

    // set an interval to poll DOM quickly and render when changes
    setInterval(()=>{
      // Try read a summary fingerprint to detect changes quickly
      const table = document.querySelector('.opttbldata');
      const next = document.querySelector('#__NEXT_DATA__');
      const fingerprint = (next ? next.textContent.slice(0,2000) : (table ? table.innerText.slice(0,2000) : ''));
      if (fingerprint && fingerprint !== lastTableSnapshot){
        lastTableSnapshot = fingerprint;
        renderLatest();
      }
    }, POLL_MS);

    // MutationObserver as additional immediate trigger
    const observer = new MutationObserver((mutations) =>{
      // small debounce
      if (window.__nse_oi_debounce) clearTimeout(window.__nse_oi_debounce);
      window.__nse_oi_debounce = setTimeout(()=>{
        renderLatest();
      }, 250);
    });
    observer.observe(document.documentElement, { childList:true, subtree:true, characterData:true });
  }

  // initialize
  startLoop();

})();
        
