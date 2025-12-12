// inject.js
(function(){
  "use strict";

  if (window.__OI_HISTOGRAM_INJECTED__) return;
  window.__OI_HISTOGRAM_INJECTED__ = true;

  /**************************************************************************
   * Config
   **************************************************************************/
  const REFRESH_MS = 3000;          // redraw interval
  const HISTORY_WINDOW_MS = 300000; // 5 minutes in ms
  let strikeRange = 5;              // default ± strikes (user can change)
  let keepATMcenter = true;

  /**************************************************************************
   * Utilities
   **************************************************************************/
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const num = s => {
    if (s === null || s === undefined) return 0;
    const t = String(s).replace(/[^\d\-.]/g, "");
    const v = parseFloat(t);
    return Number.isFinite(v) ? v : 0;
  };

  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

  /**************************************************************************
   * Panel UI
   **************************************************************************/
  function createPanel(){
    const panel = document.createElement("div");
    panel.id = "oi-hist-panel";
    panel.style.cssText = `
      position: fixed;
      top: 72px;
      left: 12px;
      z-index: 999999;
      width: 420px;
      max-width: calc(100% - 24px);
      border-radius: 14px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.25);
      background: #fff;
      font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial;
      color: #111;
      user-select: none;
    `;
    panel.innerHTML = `
      <div id="oi-hist-bar" style="background:#0a73eb;color:#fff;padding:10px 12px;border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between">
        <div style="font-weight:700">OI Histogram</div>
        <div style="display:flex;gap:10px;align-items:center">
          <button id="oi-detach-btn" title="Detach" style="background:transparent;border:none;color:#fff;font-weight:700;cursor:pointer">Detach</button>
          <button id="oi-close-btn" title="Close" style="background:transparent;border:none;color:#fff;font-weight:700;cursor:pointer">✖</button>
        </div>
      </div>

      <div style="padding:10px 12px; font-size:13px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <button id="oi-minus" style="width:34px;height:34px;font-size:20px">−</button>
          <div style="min-width:36px;text-align:center;font-weight:700" id="oi-range-txt">${strikeRange}</div>
          <button id="oi-plus" style="width:34px;height:34px;font-size:20px">+</button>
          <label style="margin-left:8px;display:flex;align-items:center;gap:6px;">
            <input type="checkbox" id="oi-atm-chk" ${keepATMcenter? 'checked':''}> <span>ATM center</span>
          </label>
        </div>
        <div style="font-size:12px;color:#555;margin-bottom:6px">ATM centered • CE red • PE green • ΔCE yellow • ΔPE blue</div>
        <div id="oi-canvas-wrap" style="width:100%;height:420px;overflow:auto;padding-top:6px"></div>
      </div>
    `;
    document.body.appendChild(panel);

    // drag
    dragElement(panel, $("#oi-hist-bar"));

    // wire controls
    $("#oi-close-btn").onclick = ()=> panel.remove();
    $("#oi-detach-btn").onclick = () => detachPanel();

    $("#oi-minus").onclick = () => {
      strikeRange = Math.max(1, strikeRange - 1);
      $("#oi-range-txt").innerText = strikeRange;
      renderOnce();
    };
    $("#oi-plus").onclick = () => {
      strikeRange = Math.min(20, strikeRange + 1);
      $("#oi-range-txt").innerText = strikeRange;
      renderOnce();
    };
    $("#oi-atm-chk").onchange = (e) => {
      keepATMcenter = e.target.checked;
      renderOnce();
    };

    return panel;
  }

  function dragElement(elmnt, handle){
    handle.style.cursor = 'grab';
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onpointerdown = function(e) {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      pos3 = e.clientX;
      pos4 = e.clientY;
      handle.style.cursor = 'grabbing';
      document.onpointermove = pointerMove;
      document.onpointerup = pointerUp;
    };
    function pointerMove(e){
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      const rect = elmnt.getBoundingClientRect();
      const left = clamp(rect.left - pos1, 4, window.innerWidth - 100);
      const top = clamp(rect.top - pos2, 4, window.innerHeight - 60);
      elmnt.style.left = left + "px";
      elmnt.style.top = top + "px";
    }
    function pointerUp(e){
      handle.releasePointerCapture(e.pointerId);
      document.onpointermove = null;
      document.onpointerup = null;
      handle.style.cursor = 'grab';
    }
  }

  // detach to full overlay
  function detachPanel(){
    const overlay = document.createElement("div");
    overlay.id = "oi-detach-overlay";
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 1000001; display:flex;align-items:flex-start;justify-content:center;padding-top:40px;
    `;
    const content = document.createElement("div");
    content.style.cssText = `width:95%;max-width:1100px;height:86vh;background:#fff;border-radius:12px;padding:12px;overflow:auto;`;
    const close = document.createElement("button");
    close.innerText = "Close";
    close.style.cssText = "position:absolute;right:20px;top:20px;padding:8px 12px";
    content.appendChild(close);
    overlay.appendChild(content);
    document.body.appendChild(overlay);

    // move canvas wrap into overlay content
    const wrap = $("#oi-canvas-wrap");
    if (wrap) content.appendChild(wrap);
    close.onclick = ()=>{
      // move wrap back
      const parent = document.querySelector("#oi-hist-panel div[id='oi-canvas-wrap']");
      if (parent) parent.appendChild(wrap);
      overlay.remove();
    };
  }

  /**************************************************************************
   * Table detection & parsing
   **************************************************************************/
  // Wait until the table (option chain) appears without interfering.
  function whenTableReady(cb){
    let tries=0;
    const id = setInterval(()=>{
      tries++;
      // prefer the NSE option-chain table elements
      let table = document.querySelector("table.opttbldata, table#optionChainTable, table.optionChainTable, table");
      // avoid picking tiny tables: choose table with > 8 columns
      if (table){
        const cols = table.querySelectorAll("thead tr th").length || table.querySelectorAll("tbody tr:first-child td").length;
        if (cols >= 8){
          clearInterval(id);
          cb(table);
          return;
        }
      }
      if (tries > 60) { // ~ 24s timeout
        clearInterval(id);
        cb(null);
      }
    }, 400);
  }

  // Heuristic parser for each row -> returns {strike, ceOI, peOI, ceChg, peChg}
  function parseTableRows(table){
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    const parsed = [];

    // try to find underlying spot price from page (several selectors tried)
    let spot = 0;
    const selectors = ["#underlyingValue", ".underlying", ".underlyingValue", ".index-val", ".index_val", ".widget_head .lastprice"];
    for (const s of selectors){
      const el = document.querySelector(s);
      if (el && el.innerText){
        spot = num(el.innerText);
        if (spot>0) break;
      }
    }

    // For each row, we need to extract numeric values. NSE table structure often places
    // CE columns left, strike in middle, PE columns right. We'll attempt fixed indices first
    // and fall back to heuristic token extraction.
    rows.forEach((r)=> {
      const tds = Array.from(r.querySelectorAll("td"));
      if (tds.length < 6) return;

      // Common new NSE layout mapping (works in many cases)
      let ceOI=0, ceChg=0, strike=0, peChg=0, peOI=0;
      try {
        // try standard index positions (these indices may match many NSE pages)
        // fallback safely using num() and guard for NaN
        ceOI = num(tds[1]?.innerText);
        ceChg = num(tds[2]?.innerText);
        // strike often at middle
        const midIdx = Math.floor(tds.length/2);
        strike = num(tds[midIdx]?.innerText);
        // right side indices (approx)
        peChg = num(tds[midIdx+1]?.innerText);
        peOI = num(tds[midIdx+2]?.innerText);
      } catch(e){ /* ignore */ }

      // If strike is zero/unreliable, attempt heuristic: find the single cell that looks like a strike (integer, >100 and <1e6)
      if (!strike || strike < 1) {
        for (const cell of tds){
          const v = num(cell.innerText);
          if (v>100 && v<1000000){
            // pick the best candidate close to spot if available
            strike = v;
            break;
          }
        }
      }

      // If still 0, try fallback token extraction: gather numeric tokens across cells
      if (!strike) {
        const allNums = tds.map(td => num(td.innerText)).filter(n=>n>0);
        if (allNums.length>0){
          // pick middle value as strike
          strike = allNums[Math.floor(allNums.length/2)] || 0;
        }
      }

      // If some fields still zero, attempt mapping by proximity (left-most numeric as CE OI, right-most as PE OI)
      if ((!ceOI || ceOI===0) || (!peOI || peOI===0)) {
        const nums = tds.map(td => num(td.innerText));
        // pick left numeric (not very robust but ok)
        ceOI = ceOI || nums.find(n=>n>0) || 0;
        peOI = peOI || (nums.slice().reverse().find(n=>n>0) || 0);
      }

      // push if strike valid
      if (strike && strike>0){
        parsed.push({
          strike: Math.round(strike),
          ceOI: Math.max(0, Math.round(ceOI)),
          peOI: Math.max(0, Math.round(peOI)),
          ceChg: Math.round(ceChg || 0),
          peChg: Math.round(peChg || 0)
        });
      }
    });

    // remove duplicates by strike and sort descending (top->bottom decreasing)
    const map = new Map();
    parsed.forEach(it => map.set(it.strike, it));
    const arr = Array.from(map.values()).sort((a,b)=> b.strike - a.strike);
    return {arr, spot};
  }

  /**************************************************************************
   * Drawing: canvas histogram (4 rows per strike)
   **************************************************************************/
  function createCanvas(width=880, height=600){
    const wrap = document.createElement("div");
    wrap.style.cssText = "width:100%;height:100%;overflow:auto;";
    const can = document.createElement("canvas");
    can.width = width;
    can.height = height;
    can.style.width = "100%";
    can.style.height = "auto";
    wrap.appendChild(can);
    return {wrap, can, ctx: can.getContext("2d")};
  }

  // state for history to compute % change in last 5 minutes
  const historyStore = new Map(); // key = strike, value = array of {ts, ceOI, peOI, ceChg, peChg}

  function addHistory(snapshot){
    const ts = Date.now();
    snapshot.forEach(it=>{
      if (!historyStore.has(it.strike)) historyStore.set(it.strike, []);
      historyStore.get(it.strike).push({ts, ceOI:it.ceOI, peOI:it.peOI, ceChg:it.ceChg, peChg:it.peChg});
      // trim older than HISTORY_WINDOW_MS
      const arr = historyStore.get(it.strike).filter(x => (ts - x.ts) <= HISTORY_WINDOW_MS);
      historyStore.set(it.strike, arr);
    });
  }

  function pctChangeFrom5Min(strike, field){
    const arr = historyStore.get(strike) || [];
    if (arr.length < 2) return null;
    const oldest = arr[0];
    const latest = arr[arr.length-1];
    const oldVal = oldest[field] || 0;
    const newVal = latest[field] || 0;
    if (oldVal === 0) return null;
    return ((newVal - oldVal)/Math.abs(oldVal))*100;
  }

  // main draw function: expects filteredStrikes array (descending by strike)
  function drawHistogram(filteredStrikes, spot){
    // get wrapper
    const wrapParent = $("#oi-canvas-wrap");
    if (!wrapParent) return;
    // calculate canvas size
    const rows = filteredStrikes.length;
    const rowHeight = 48; // per strike block height (4 rows stacked vertically)
    const totalH = Math.max(200, rows * rowHeight + 40);

    // create or reuse canvas
    const existingCanvas = wrapParent.querySelector("canvas");
    let can, ctx, wrapperDiv;
    if (existingCanvas) {
      can = existingCanvas;
      ctx = can.getContext("2d");
      // resize backing store to fit content
      can.width = Math.max(900, window.innerWidth * 0.9);
      can.height = totalH;
    } else {
      const created = createCanvas(Math.max(900, window.innerWidth * 0.9), totalH);
      wrapperDiv = created.wrap;
      can = created.can;
      ctx = created.ctx;
      // clear wrapParent and append
      wrapParent.innerHTML = "";
      wrapParent.appendChild(wrapperDiv);
      // ensure scroll within panel
      created.wrap.style.height = Math.min(520, totalH) + "px";
    }

    // style constants
    const leftLabelX = 12;
    const strikeLabelW = 72;
    const baselineX = leftLabelX + strikeLabelW + 6; // where bars begin (center vertical at baselineX)
    const availableW = can.width - baselineX - 40;
    const centerLineX = baselineX + Math.round(availableW * 0.15); // small left margin for red bars if we want visual separation
    const barMaxW = availableW - Math.round(availableW*0.05);

    // compute max value for scaling across CE OI & PE OI & changes
    let maxVal = 1;
    filteredStrikes.forEach(it=>{
      maxVal = Math.max(maxVal, Math.abs(it.ceOI||0), Math.abs(it.peOI||0), Math.abs(it.ceChg||0), Math.abs(it.peChg||0));
    });

    // adjust scale to allow labels inside bars
    const scale = barMaxW / maxVal;

    // clear canvas
    ctx.clearRect(0,0,can.width,can.height);
    // background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0,0,can.width,can.height);

    // draw horizontal separators
    ctx.strokeStyle = "#e7e7e7";
    ctx.lineWidth = 1;
    for (let i=0;i<=rows;i++){
      const y = 10 + i * rowHeight + 0;
      ctx.beginPath();
      ctx.moveTo(baselineX - 10, y);
      ctx.lineTo(can.width - 10, y);
      ctx.stroke();
    }

    // draw central thin baseline for visual alignment (not required)
    ctx.strokeStyle = "#f0f0f0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerLineX, 4);
    ctx.lineTo(centerLineX, can.height-4);
    ctx.stroke();

    // For each strike draw 4 bars stacked with small gaps
    filteredStrikes.forEach((it, idx) => {
      const blockTop = 12 + idx * rowHeight;
      const labelY = blockTop + 12;

      // strike label
      ctx.fillStyle = "#111";
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "left";
      ctx.fillText(String(it.strike), leftLabelX, labelY+2);

      // for each of the 4 rows compute Y positions
      // Row mapping:
      // r0: CE OI (red)
      // r1: PE OI (green)
      // r2: CE change (yellow)
      // r3: PE change (blue)
      const rowOffsets = [ -6, 10, 26, 42 ]; // offsets relative to blockTop for small stacking
      const colors = ["#e53935","#2e7d32","#ffb300","#1565c0"];
      const fields = ["ceOI","peOI","ceChg","peChg"];

      for (let r=0;r<4;r++){
        const val = Math.abs(it[fields[r]] || 0); // option A: always positive bars
        const barW = Math.round(val * scale);
        const y = blockTop + rowOffsets[r];

        // bar background area (thin muted track)
        ctx.fillStyle = "#f6f6f6";
        ctx.fillRect(baselineX, y-8, barMaxW, 12);

        // draw colored bar (extend right from baseline)
        ctx.fillStyle = colors[r];
        const drawW = Math.max(0, Math.min(barW, barMaxW));
        ctx.fillRect(baselineX, y-8, drawW, 12);

        // draw numeric label above bar (centered over bar end)
        ctx.fillStyle = "#000";
        ctx.font = "bold 12px Arial";
        ctx.textAlign = "left";
        const labelX = baselineX + drawW + 6;
        ctx.fillText(String(it[fields[r]]), labelX, y-1);

        // compute % change in last 5 minutes for corresponding field (if available)
        // we'll map ceOI->ceOI, peOI->peOI, ceChg->ceChg, peChg->peChg
        const pct = pctChangeFrom5Min(it.strike, fields[r]);
        if (pct !== null){
          ctx.font = "11px Arial";
          ctx.fillStyle = pct >= 0 ? "#2e7d32" : "#d32f2f";
          ctx.textAlign = "left";
          ctx.fillText((pct>=0?"+":"")+pct.toFixed(1)+"%", labelX, y+11);
        }
      }
    });

    // finally annotate spot/ATM (if available)
    if (spot && spot>0){
      ctx.fillStyle = "#333";
      ctx.font = "12px Arial";
      ctx.textAlign = "right";
      ctx.fillText("ATM ~ "+String(Math.round(spot)), can.width - 12, 16);
    }
  }

  /**************************************************************************
   * Main render pipeline: parse -> select strikes -> add history -> draw
   **************************************************************************/
  let latestTableRef = null;
  let lastParsed = {arr:[], spot:0};

  function selectStrikeWindow(allArr, spot, range){
    if (!allArr || !allArr.length) return [];
    // find closest strike to spot
    let midIdx = Math.floor(allArr.length/2);
    if (spot && spot>0){
      let bestIdx = 0;
      let bestDiff = Infinity;
      allArr.forEach((it, idx)=>{
        const d = Math.abs(it.strike - spot);
        if (d < bestDiff){ bestDiff = d; bestIdx = idx; }
      });
      midIdx = bestIdx;
    }
    const start = clamp(midIdx - range, 0, allArr.length-1);
    const end = clamp(midIdx + range + 1, 0, allArr.length);
    // ensure decreasing order (already sorted descending in parser)
    return allArr.slice(start, end);
  }

  function renderOnce(){
    if (!latestTableRef) return;
    lastParsed = parseTableRows(latestTableRef);
    const allArr = lastParsed.arr;
    const spot = lastParsed.spot;
    if (!allArr || !allArr.length) return;
    const windowArr = selectStrikeWindow(allArr, spot, strikeRange);
    // update history
    addHistory(windowArr);
    // draw
    drawHistogram(windowArr, spot);
  }

  // wrapper for scheduled rendering
  let refreshTimer = null;
  function startAutoRefresh(){
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(renderOnce, REFRESH_MS);
  }

  /**************************************************************************
   * Kickoff: wait for table and then attach observer to re-render on changes
   **************************************************************************/
  whenTableReady((table) => {
    if (!table){
      console.warn("OI Histogram: Option table was not found within timeout.");
      return;
    }
    latestTableRef = table;
    // initial render
    const panel = createPanel();
    renderOnce();
    startAutoRefresh();

    // observe DOM changes on table (rows update dynamically)
    const mo = new MutationObserver((mutList) => {
      // simply re-render on any significant mutation (fast)
      latestTableRef = table;
      renderOnce();
    });
    mo.observe(table, {childList: true, subtree: true, characterData: true});

    // also re-select table if user triggers page navigation via the same page
    window.addEventListener("scroll", throttle( ()=> {
      // nothing heavy here; keep it to ensure table reference still valid
      if (!document.body.contains(latestTableRef)){
        whenTableReady((t2) => { if (t2) latestTableRef = t2; });
      }
    }, 1000));
  });

  /**************************************************************************
   * Helpers: throttle
   **************************************************************************/
  function throttle(fn, wait){
    let last = 0;
    return function(...args){
      const now = Date.now();
      if (now - last >= wait){
        last = now;
        fn.apply(this, args);
      }
    };
  }

})();
