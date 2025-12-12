// inject.js - main in-page extension logic
(function(){
  if (window.__NSE_OI_EXT_INSTALLED) return;
  window.__NSE_OI_EXT_INSTALLED = true;

  // ---------- CONFIG ----------
  const MOBILE_WIDTH = 320;
  const DEFAULT_VISIBLE = 5;
  const POLL_MS = 900;
  const SNAPSHOT_MS = 5 * 60 * 1000; // 5 minutes
  const MAX_HISTORY = 60; // keep limited snapshots

  // ---------- STATE ----------
  let visibleCount = DEFAULT_VISIBLE;
  let lastFingerprint = '';
  let historySnapshots = loadHistory();
  let lastSnapshotTime = historySnapshots.length ? historySnapshots[historySnapshots.length-1].time : 0;
  let popupWin = null;

  // ---------- UTIL ----------
  function loadHistory(){
    try {
      const raw = localStorage.getItem('nse_oi_history_v1');
      return raw ? JSON.parse(raw) : [];
    } catch(e){ return []; }
  }
  function saveHistory(){
    try { localStorage.setItem('nse_oi_history_v1', JSON.stringify(historySnapshots)); } catch(e){}
  }
  function pushSnapshot(map){
    const t = Date.now();
    historySnapshots.push({time: t, data: map});
    if (historySnapshots.length > MAX_HISTORY) historySnapshots.shift();
    lastSnapshotTime = t;
    saveHistory();
  }
  function findClosestSnapshot(targetTime){
    if (!historySnapshots.length) return null;
    let best = historySnapshots[0], bestD = Math.abs(best.time - targetTime);
    for (const s of historySnapshots){
      const d = Math.abs(s.time - targetTime);
      if (d < bestD){ best = s; bestD = d; }
    }
    return best;
  }
  function formatNum(n){
    if (n === null || n === undefined) return '0';
    n = Number(n) || 0;
    if (Math.abs(n) >= 100000) return Math.round(n/1000) + 'k';
    return n.toLocaleString('en-IN');
  }
  function pctChange(newV, oldV){
    newV = Number(newV)||0; oldV = Number(oldV)||0;
    if (!oldV) return {text:'0.0%', color:'#6c757d', val:0};
    const diff = ((newV - oldV)/Math.abs(oldV))*100;
    return { text: (diff>=0?'+':'')+diff.toFixed(1)+'%', color: diff>=0? '#0b8b3b' : '#c82333', val: diff };
  }

  // ---------- UI CREATION ----------
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
        <label id="nse-oi-autocenter"><input type="checkbox" id="nse-oi-cent" checked/> Keep ATM center</label>
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

    // wire events
    document.getElementById('nse-oi-close').addEventListener('click', ()=>card.remove());
    document.getElementById('nse-oi-inc').addEventListener('click', ()=>{
      visibleCount = Math.min(visibleCount+1, 20);
      document.getElementById('nse-oi-count').innerText = visibleCount;
      renderLatest();
    });
    document.getElementById('nse-oi-dec').addEventListener('click', ()=>{
      visibleCount = Math.max(1, visibleCount-1);
      document.getElementById('nse-oi-count').innerText = visibleCount;
      renderLatest();
    });
    document.getElementById('nse-oi-detach').addEventListener('click', detachPopup);

    // draggable
    makeDraggable(card, document.getElementById('nse-oi-head'));
  }

  function makeDraggable(el, handle){
    el.style.position = 'fixed';
    el.style.top = '80px';
    el.style.left = '12px';
    el.style.zIndex = 2147483647;
    let dragging=false, ox=0, oy=0;
    handle.style.cursor='grab';
    handle.addEventListener('pointerdown', (e)=>{
      dragging=true; ox=e.clientX - el.getBoundingClientRect().left; oy=e.clientY - el.getBoundingClientRect().top;
      handle.setPointerCapture && handle.setPointerCapture(e.pointerId);
      handle.style.cursor='grabbing';
    });
    window.addEventListener('pointermove', (e)=>{
      if(!dragging) return;
      let x=e.clientX-ox, y=e.clientY-oy;
      const maxLeft = window.innerWidth - Math.max(MOBILE_WIDTH, el.offsetWidth) - 6;
      x = Math.max(6, Math.min(x, maxLeft));
      y = Math.max(6, Math.min(y, window.innerHeight - 80));
      el.style.left = x+'px'; el.style.top = y+'px';
    });
    window.addEventListener('pointerup', (e)=>{
      if(!dragging) return; dragging=false; handle.style.cursor='grab';
      try{ handle.releasePointerCapture && handle.releasePointerCapture(e.pointerId);}catch(e){}
    });
  }

  // ---------- Data extraction ----------
  function extractFromNextData(){
    const s = document.querySelector('#__NEXT_DATA__');
    if (!s) return null;
    try {
      const json = JSON.parse(s.textContent);
      const records = (json?.props?.pageProps?.data?.records) || (json?.props?.pageProps?.optionChain) || null;
      if (!records || !records.data) return null;
      const underlying = records.underlyingValue || json?.props?.pageProps?.underlyingValue || null;
      const arr = records.data.map(it => ({
        strike: Number(it.strikePrice || it.strike || 0),
        CE: it.CE || null,
        PE: it.PE || null
      }));
      return {arr, underlying, expiryDates: records.expiryDates || records.expiries || []};
    } catch(e){ return null; }
  }

  function extractFromTable(){
    const table = document.querySelector('.opttbldata') || document.querySelector('table');
    if (!table) return null;
    const rows = Array.from(table.querySelectorAll('tbody tr')).filter(r => r.children && r.children.length > 6);
    if (!rows.length) return null;
    const arr = rows.map(r=>{
      const td = r.querySelectorAll('td');
      // best-effort indexes — updated for new NSE layout
      const strike = Number((td[11]?.innerText || td[td.length-10]?.innerText || '0').replace(/,/g,''));
      const ceOI = Number((td[1]?.innerText || '0').replace(/,/g,''));
      const ceChg = Number((td[2]?.innerText || '0').replace(/,/g,''));
      const peOI = Number((td[21]?.innerText || '0').replace(/,/g,''));
      const peChg = Number((td[20]?.innerText || '0').replace(/,/g,''));
      return {
        strike,
        CE: { openInterest: ceOI, changeinOpenInterest: ceChg },
        PE: { openInterest: peOI, changeinOpenInterest: peChg }
      };
    });
    const spotEl = document.querySelector('#underlyingSpot') || document.querySelector('.underlying-price') || document.querySelector('.instrument-price');
    const underlying = spotEl ? Number((spotEl.innerText||'0').replace(/,/g,'')) : null;
    return {arr, underlying, expiryDates: []};
  }

  function readOptionChain(){
    const a = extractFromNextData();
    if (a) return a;
    return extractFromTable();
  }

  // ---------- Render latest snapshot ----------
  function renderLatest(){
    const data = readOptionChain();
    if (!data || !data.arr || !data.arr.length) return;
    const rows = data.arr.map(it => ({
      strike: Number(it.strike||0),
      ceOI: Number(it.CE?.openInterest || 0),
      ceChg: Number(it.CE?.changeinOpenInterest || it.CE?.changeInOpenInterest || 0),
      peOI: Number(it.PE?.openInterest || 0),
      peChg: Number(it.PE?.changeinOpenInterest || it.PE?.changeInOpenInterest || 0)
    }));

    // sort desc by strike
    rows.sort((a,b)=>b.strike - a.strike);

    // ATM detection
    const spot = Number(data.underlying || 0);
    let atm = rows[Math.floor(rows.length/2)];
    if (spot && !isNaN(spot)){
      atm = rows.reduce((p,c)=> Math.abs(c.strike - spot) < Math.abs(p.strike - spot) ? c : p, rows[0]);
    }

    // determine visible slice so ATM is centered
    const half = Math.floor(visibleCount/2);
    const atmIndex = rows.findIndex(r=> r.strike === atm.strike);
    let start = Math.max(0, atmIndex - half);
    let end = start + visibleCount;
    if (end > rows.length){ end = rows.length; start = Math.max(0, end - visibleCount); }
    let visible = rows.slice(start, end);

    // ensure visible length (pad if at edges)
    while (visible.length < visibleCount && (start>0 || end<rows.length)){
      if (start>0){ start--; visible = rows.slice(start, end); }
      else if (end<rows.length){ end++; visible = rows.slice(start,end); }
      else break;
    }

    // build current snapshot map
    const nowMap = {};
    visible.forEach(r => {
      nowMap[r.strike] = { ceOI: r.ceOI, peOI: r.peOI, ceChg: r.ceChg, peChg: r.peChg };
    });

    // add snapshot each SNAPSHOT_MS (or at least once per minute)
    const tNow = Date.now();
    if (!lastSnapshotTime || (tNow - lastSnapshotTime) >= SNAPSHOT_MS){
      pushSnapshot(nowMap);
    } else if ((tNow - lastSnapshotTime) >= 60*1000){
      pushSnapshot(nowMap);
    }

    const snap = findClosestSnapshot(tNow - SNAPSHOT_MS);

    // render to DOM
    createUI();
    const list = document.getElementById('nse-oi-list');
    list.innerHTML = '';

    // compute normalization factors so bars look good
    const maxCeOI = Math.max(...rows.map(r=>r.ceOI||0), 1);
    const maxPeOI = Math.max(...rows.map(r=>r.peOI||0), 1);
    const maxCeCh = Math.max(...rows.map(r=>Math.abs(r.ceChg)||0), 1);
    const maxPeCh = Math.max(...rows.map(r=>Math.abs(r.peChg)||0), 1);

    visible.forEach(r=>{
      const cePct = snap && snap.data && snap.data[r.strike] ? pctChange(r.ceOI, snap.data[r.strike].ceOI) : {text:'0.0%', color:'#6c757d'};
      const pePct = snap && snap.data && snap.data[r.strike] ? pctChange(r.peOI, snap.data[r.strike].peOI) : {text:'0.0%', color:'#6c757d'};
      const ceChPct = snap && snap.data && snap.data[r.strike] ? pctChange(r.ceChg, snap.data[r.strike].ceChg) : {text:'0.0%', color:'#6c757d'};
      const peChPct = snap && snap.data && snap.data[r.strike] ? pctChange(r.peChg, snap.data[r.strike].peChg) : {text:'0.0%', color:'#6c757d'};

      const row = document.createElement('div');
      row.className = 'nse-oi-row' + (r.strike === atm.strike ? ' atm-row' : '');
      // left-aligned decreasing strike (top->bottom)
      row.innerHTML = `
        <div class="nse-oi-strike">${r.strike}</div>

        <div class="nse-oi-block">
          <div class="nse-oi-bar ce" style="width:${Math.round((r.ceOI/maxCeOI)*140)}px"></div>
          <div class="nse-oi-val">${formatNum(r.ceOI)}</div>
          <div class="nse-oi-pct" style="color:${cePct.color}">${cePct.text}</div>
        </div>

        <div class="nse-oi-block">
          <div class="nse-oi-bar pe" style="width:${Math.round((r.peOI/maxPeOI)*140)}px"></div>
          <div class="nse-oi-val">${formatNum(r.peOI)}</div>
          <div class="nse-oi-pct" style="color:${pePct.color}">${pePct.text}</div>
        </div>

        <div class="nse-oi-block">
          <div class="nse-oi-bar ce-chg" style="width:${Math.round((Math.abs(r.ceChg)/maxCeCh)*120)}px"></div>
          <div class="nse-oi-val">${formatNum(r.ceChg)}</div>
          <div class="nse-oi-pct" style="color:${ceChPct.color}">${ceChPct.text}</div>
        </div>

        <div class="nse-oi-block">
          <div class="nse-oi-bar pe-chg" style="width:${Math.round((Math.abs(r.peChg)/maxPeCh)*120)}px"></div>
          <div class="nse-oi-val">${formatNum(r.peChg)}</div>
          <div class="nse-oi-pct" style="color:${peChPct.color}">${peChPct.text}</div>
        </div>
      `;

      list.appendChild(row);
    });

    document.getElementById('nse-oi-last').innerText = 'Last updated: ' + (new Date()).toLocaleTimeString();

    // notify detached popup if present
    if (popupWin && !popupWin.closed){
      try{
        popupWin.receiveData && popupWin.receiveData({visible, atmStrike: atm.strike, t: tNow});
      }catch(e){}
    }
  }

  // ---------- Auto-expiry select (best effort) ----------
  function autoSelectExpiry(){
    const sel = document.querySelector('select[name="expiryDate"], select#expiryDate');
    if (!sel) return;
    if (sel.options && sel.options.length>0){
      sel.selectedIndex = 0;
      sel.dispatchEvent(new Event('change', {bubbles:true}));
    }
  }

  // ---------- Detach popup ----------
  function detachPopup(){
    if (popupWin && !popupWin.closed){ popupWin.focus(); return; }
    popupWin = window.open('', 'nse_oi_popup', `width=${MOBILE_WIDTH+80},height=720`);
    if (!popupWin){ alert('Popup blocked. Allow popups for this site.'); return; }

    const doc = popupWin.document;
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
          .atm-row{background:#fff8e6;border-left:4px solid orange}
        </style>
      </head>
      <body>
        <div class="title">OI Histogram (detached)</div>
        <div id="popup-list"></div>
        <script>
          window.receiveData = function(payload){
            const list = document.getElementById('popup-list');
            if (!payload || !payload.visible) return;
            list.innerHTML = '';
            const visible = payload.visible;
            const atm = payload.atmStrike;
            const maxCe = Math.max(...visible.map(r=>r.ceOI||0),1);
            const maxPe = Math.max(...visible.map(r=>r.peOI||0),1);
            const maxCeCh = Math.max(...visible.map(r=>Math.abs(r.ceChg)||0),1);
            const maxPeCh = Math.max(...visible.map(r=>Math.abs(r.peChg)||0),1);
            visible.forEach(r=>{
              const ceW = Math.round((r.ceOI/maxCe)*140);
              const peW = Math.round((r.peOI/maxPe)*140);
              const ceChW = Math.round((Math.abs(r.ceChg)/maxCeCh)*120);
              const peChW = Math.round((Math.abs(r.peChg)/maxPeCh)*120);
              const d = document.createElement('div');
              d.className = 'nse-oi-row' + (r.strike===atm?' atm-row':'');
              d.innerHTML = \`
                <div class="nse-oi-strike">\${r.strike}</div>
                <div class="nse-oi-block"><div class="nse-oi-bar ce" style="width:\${ceW}px"></div><div class="nse-oi-val">\${r.ceOI.toLocaleString()}</div></div>
                <div class="nse-oi-block"><div class="nse-oi-bar pe" style="width:\${peW}px"></div><div class="nse-oi-val">\${r.peOI.toLocaleString()}</div></div>
                <div class="nse-oi-block"><div class="nse-oi-bar ce-chg" style="width:\${ceChW}px"></div><div class="nse-oi-val">\${r.ceChg.toLocaleString()}</div></div>
                <div class="nse-oi-block"><div class="nse-oi-bar pe-chg" style="width:\${peChW}px"></div><div class="nse-oi-val">\${r.peChg.toLocaleString()}</div></div>
              \`;
              list.appendChild(d);
            });
          };
          // let opener know we are ready (optional)
          try{ window.opener && window.opener.postMessage({nse_popup_ready:true}, '*'); }catch(e){}
        <\/script>
      </body>
      </html>
    `);
    doc.close();
  }

  // ---------- watchers ----------
  function startObservers(){
    // quick poll with fingerprint
    setInterval(()=>{
      const next = document.querySelector('#__NEXT_DATA__');
      const table = document.querySelector('.opttbldata') || document.querySelector('table');
      const fp = (next ? (next.textContent||'').slice(0,3000) : '') + '|' + (table ? (table.innerText||'').slice(0,2000) : '');
      if (fp && fp !== lastFingerprint){
        lastFingerprint = fp;
        renderLatest();
      }
    }, POLL_MS);

    // mutation observer for immediate re-render
    const mo = new MutationObserver(()=> {
      if (window.__nse_oi_debounce) clearTimeout(window.__nse_oi_debounce);
      window.__nse_oi_debounce = setTimeout(()=>renderLatest(), 220);
    });
    mo.observe(document.documentElement, {childList:true, subtree:true, characterData:true});
  }

  // ---------- init ----------
  function init(){
    createUI();
    autoSelectExpiry();
    renderLatest();
    startObservers();
  }

  // run after short delay to let page initialize
  setTimeout(init, 800);

})();
