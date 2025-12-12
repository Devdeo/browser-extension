// inject.js — NSE Option Chain OI Histogram content script
(function () {
  if (window.__NSE_OI_HISTOGRAM_INJECTED) return;
  window.__NSE_OI_HISTOGRAM_INJECTED = true;

  /*********************************************************
   * Utilities
   *********************************************************/
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const formatNum = (n) => {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return '-';
    n = Number(n);
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + 'k';
    return n.toString();
  };
  const formatPercent = (v) => (v === null || v === undefined) ? '-' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';

  /*********************************************************
   * Core: find option chain table and map columns
   *********************************************************/
  function findOptionChainTable() {
    // Look for a table that contains "CALLS" or "STRIKE" text in headers
    const tables = $$('table');
    for (const t of tables) {
      const headerText = t.innerText || '';
      if (/CALLS/i.test(headerText) && /STRIKE/i.test(headerText)) return t;
      if (/Option Chain/i.test(headerText) && /STRIKE/i.test(headerText)) return t;
    }
    // fallback: first large table
    const big = tables.sort((a, b) => b.offsetHeight - a.offsetHeight)[0];
    return big || null;
  }

  function mapTableColumns(table) {
    // Attempt to find <thead> header cells, flatten them, and find STRIKE column index.
    const thead = table.tHead;
    const headerCells = thead ? Array.from(thead.querySelectorAll('th,td')) : Array.from(table.querySelectorAll('tr:first-child th, tr:first-child td'));
    const texts = headerCells.map(h => (h.textContent || '').trim().replace(/\s+/g, ' '));
    // find strike column by header text "STRIKE"
    const strikeIndex = texts.findIndex(t => /STRIKE/i.test(t));
    if (strikeIndex === -1) {
      // try rows with 'STRIKE' anywhere
      const r = Array.from(table.querySelectorAll('tr')).find(row => /STRIKE/i.test(row.innerText || ''));
      if (r) {
        const cells = Array.from(r.querySelectorAll('th,td')).map(c => (c.textContent || '').trim().replace(/\s+/g, ' '));
        const idx = cells.findIndex(t => /STRIKE/i.test(t));
        if (idx !== -1) return { strikeIndex: idx, headerCells: cells };
      }
      return null;
    }
    return { strikeIndex, headerCells: texts };
  }

  /*********************************************************
   * Parse rows
   *********************************************************/
  function parseRows(table, mapping) {
    const strikeIdx = mapping.strikeIndex;
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const parsed = [];

    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('td,th')).map(c => (c.textContent || '').trim());
      if (!cells || cells.length <= strikeIdx) continue;
      const strikeRaw = cells[strikeIdx];
      const strike = Number((strikeRaw || '').replace(/[,₹₹]/g, '').match(/-?\d+(\.\d+)?/) ? (strikeRaw.replace(/[,₹₹]/g,'').match(/-?\d+(\.\d+)?/)[0]) : NaN);

      // left section: indices < strikeIdx
      // right section: indices > strikeIdx
      // find CE OI and CE CHNG IN OI in left side by header text matching
      // fallback heuristics: leftmost OI etc.

      // helper to find header index by keywords inside headerCells on left/right.
      const leftHeaders = mapping.headerCells.slice(0, strikeIdx);
      const rightHeaders = mapping.headerCells.slice(strikeIdx + 1);

      function findIndexIn(headersArray, keywords) {
        for (let i = 0; i < headersArray.length; i++) {
          const txt = headersArray[i].toUpperCase();
          for (const kw of keywords) {
            if (txt.includes(kw)) return i;
          }
        }
        return -1;
      }

      // candidate keywords
      const oiKeys = ['OI', 'O I', 'OPEN INTEREST'];
      const chgKeys = ['CHNG IN OI', 'CHNG IN OI', 'CHNG', 'CHANGE IN OI', 'CHNG IN OI'];

      const ceOiLocalIdx = findIndexIn(leftHeaders, oiKeys);
      const ceChgLocalIdx = findIndexIn(leftHeaders, chgKeys);

      const peOiLocalIdx = findIndexIn(rightHeaders, oiKeys);
      const peChgLocalIdx = findIndexIn(rightHeaders, chgKeys);

      // Convert local indices to global indices
      const ceOiIdx = (ceOiLocalIdx >= 0) ? ceOiLocalIdx : -1;
      const ceChgIdx = (ceChgLocalIdx >= 0) ? ceChgLocalIdx : -1;
      const peChgIdx = (peChgLocalIdx >= 0) ? (strikeIdx + 1 + peChgLocalIdx) : -1;
      const peOiIdx = (peOiLocalIdx >= 0) ? (strikeIdx + 1 + peOiLocalIdx) : -1;

      // values from cells (with fallback heuristics):
      function numFromCell(idx) {
        if (idx === -1) return 0;
        const txt = (cells[idx] || '').replace(/[,₹₹\s]+/g, '');
        const signMatch = (cells[idx] || '').match(/^\s*[-–]/) ? -1 : 1;
        const n = Number(txt.match(/-?\d+(\.\d+)?/) ? txt.match(/-?\d+(\.\d+)?/)[0] : NaN);
        return Number.isFinite(n) ? n * signMatch : 0;
      }

      const ceOI = (ceOiIdx >= 0) ? numFromCell(ceOiIdx) : (numFromCell(0) || 0);
      const ceChange = (ceChgIdx >= 0) ? numFromCell(ceChgIdx) : (numFromCell(1) || 0);

      const peChange = (peChgIdx >= 0) ? numFromCell(peChgIdx) : (numFromCell(cells.length - 2) || 0);
      const peOI = (peOiIdx >= 0) ? numFromCell(peOiIdx) : (numFromCell(cells.length - 1) || 0);

      // some rows (header separators) might be non-numeric; ignore
      if (isNaN(strike)) continue;

      parsed.push({
        strike,
        ceOI,
        ceChange,
        peChange,
        peOI,
        rawCells: cells,
        rowEl: row
      });
    }

    return parsed;
  }

  /*********************************************************
   * State: previous snapshot to compute % change over 5m
   *********************************************************/
  const state = {
    lastSnapshot: null, // {timestamp, map: {strike -> {ceOI, peOI, ceChange, peChange}}}
    settings: {
      strikesEachSide: 5,
      atmCentered: true
    }
  };

  function computePercentChange(prev, cur) {
    if (prev == null || prev === 0) return 0;
    return ((cur - prev) / Math.abs(prev)) * 100;
  }

  /*********************************************************
   * UI: create histogram container
   *********************************************************/
  function createUI() {
    // root container
    const root = document.createElement('div');
    root.id = '__nse_oi_histogram';
    root.style.position = 'fixed';
    root.style.left = '12px';
    root.style.top = '80px';
    root.style.zIndex = 99999;
    root.style.maxWidth = '92vw';
    root.style.width = '360px';
    root.style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)';
    root.style.borderRadius = '12px';
    root.style.background = '#ffffff';
    root.style.fontFamily = 'Inter, system-ui, Arial, sans-serif';
    root.style.userSelect = 'none';
    root.style.touchAction = 'none';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.overflow = 'hidden';
    root.style.paddingBottom = '8px';

    // header
    const header = document.createElement('div');
    header.style.background = '#1787FF';
    header.style.color = 'white';
    header.style.padding = '12px';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.cursor = 'grab';
    header.innerHTML = `<div style="font-weight:600">OI Histogram</div><div style="font-weight:600;opacity:0.95;cursor:pointer" id="hist-detach">Detach ✖</div>`;
    root.appendChild(header);

    // controls row
    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.alignItems = 'center';
    controls.style.gap = '10px';
    controls.style.padding = '10px';
    controls.style.flexWrap = 'wrap';

    // minus button
    const minus = document.createElement('button');
    minus.textContent = '-';
    Object.assign(minus.style, {
      width: '36px',
      height: '36px',
      borderRadius: '6px',
      border: '1px solid #ccc',
      background: '#fff',
      fontSize: '20px'
    });
    controls.appendChild(minus);

    // strikes label
    const strikesLabel = document.createElement('div');
    strikesLabel.textContent = String(state.settings.strikesEachSide);
    strikesLabel.style.fontWeight = '700';
    strikesLabel.style.minWidth = '28px';
    strikesLabel.style.textAlign = 'center';
    controls.appendChild(strikesLabel);

    // plus
    const plus = document.createElement('button');
    plus.textContent = '+';
    Object.assign(plus.style, {
      width: '36px',
      height: '36px',
      borderRadius: '6px',
      border: '1px solid #ccc',
      background: '#fff',
      fontSize: '20px'
    });
    controls.appendChild(plus);

    // ATM center checkbox
    const atmWrap = document.createElement('label');
    atmWrap.style.display = 'flex';
    atmWrap.style.alignItems = 'center';
    atmWrap.style.gap = '6px';
    atmWrap.innerHTML = `<input type="checkbox" id="atm_center_chk" ${state.settings.atmCentered ? 'checked' : ''}/> <span style="font-weight:600">ATM center</span>`;
    controls.appendChild(atmWrap);

    root.appendChild(controls);

    // hint line
    const hint = document.createElement('div');
    hint.style.padding = '6px 12px 0 12px';
    hint.style.fontSize = '12px';
    hint.style.color = '#555';
    hint.innerHTML = `ATM centered • CE red • PE green • ΔCE orange • ΔPE blue`;
    root.appendChild(hint);

    // content: scrollable area for bars
    const content = document.createElement('div');
    content.style.padding = '8px 10px';
    content.style.maxHeight = '52vh';
    content.style.overflowY = 'auto';
    content.style.background = '#fff';
    content.style.borderTop = '1px solid #eee';
    root.appendChild(content);

    // attach to body
    document.body.appendChild(root);

    // interactions
    minus.addEventListener('click', () => {
      state.settings.strikesEachSide = clamp(state.settings.strikesEachSide - 1, 1, 20);
      strikesLabel.textContent = String(state.settings.strikesEachSide);
      renderLast();
    });
    plus.addEventListener('click', () => {
      state.settings.strikesEachSide = clamp(state.settings.strikesEachSide + 1, 1, 20);
      strikesLabel.textContent = String(state.settings.strikesEachSide);
      renderLast();
    });

    $('#atm_center_chk', root).addEventListener('change', (e) => {
      state.settings.atmCentered = !!e.target.checked;
      renderLast();
    });

    // detach: create larger floating full-screen mode (toggle)
    let detached = false;
    $('#hist-detach', root).addEventListener('click', () => {
      detached = !detached;
      if (detached) {
        root.style.width = '92vw';
        root.style.left = '4vw';
        root.style.top = '10vh';
        root.style.maxHeight = '80vh';
        content.style.maxHeight = '65vh';
        $('#hist-detach', root).textContent = 'Attach ⤺';
      } else {
        root.style.width = '360px';
        root.style.left = '12px';
        root.style.top = '80px';
        root.style.maxHeight = '52vh';
        content.style.maxHeight = '52vh';
        $('#hist-detach', root).textContent = 'Detach ✖';
      }
    });

    // Make draggable by header (mobile friendly)
    (function makeDraggable(el, handle) {
      let dragging = false, startX = 0, startY = 0, origX = 0, origY = 0;
      handle.addEventListener('pointerdown', (e) => {
        dragging = true;
        handle.setPointerCapture(e.pointerId);
        startX = e.clientX;
        startY = e.clientY;
        origX = parseFloat(el.style.left || 0);
        origY = parseFloat(el.style.top || 0);
        handle.style.cursor = 'grabbing';
      });
      window.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        el.style.left = (origX + dx) + 'px';
        el.style.top = (origY + dy) + 'px';
      });
      window.addEventListener('pointerup', (e) => {
        dragging = false;
        try { handle.releasePointerCapture(e.pointerId);} catch {}
        handle.style.cursor = 'grab';
      });
    })(root, header);

    // store references
    return { root, content, header, strikesLabel };
  }

  const ui = createUI();

  /*********************************************************
   * Render histogram rows
   *********************************************************/
  let lastRenderedParsed = null;

  function renderHistogram(parsedRows) {
    // sort descending (strike decreasing top->bottom)
    const sorted = parsedRows.slice().sort((a, b) => b.strike - a.strike);

    // determine ATM: using underlying value on page if available
    let underlying = null;
    try {
      const underlyingEl = Array.from(document.querySelectorAll('body *')).find(el => /Underlying Index/i.test(el.textContent || ''));
      if (underlyingEl) {
        const m = (underlyingEl.textContent || '').match(/Underlying\s+Index\s*:\s*.*?([\d,]+(\.\d+)?)/i);
        if (m) underlying = Number(m[1].replace(/,/g, ''));
      }
    } catch (e) {}

    // fallback ATM: choose closest strike to mid of list
    const strikes = sorted.map(r => r.strike);
    let atmStrike = null;
    if (underlying) {
      atmStrike = strikes.reduce((prev, curr) => Math.abs(curr - underlying) < Math.abs(prev - underlying) ? curr : prev, strikes[0]);
    } else {
      atmStrike = strikes[Math.floor(sorted.length / 2)];
    }

    // select center slice
    const half = state.settings.strikesEachSide;
    // find index of atm in sorted
    const atmIndex = sorted.findIndex(r => r.strike === atmStrike);
    const centerIndex = (state.settings.atmCentered && atmIndex !== -1) ? atmIndex : Math.floor(sorted.length / 2);

    // compute display window
    let start = clamp(centerIndex - half, 0, sorted.length - 1);
    let end = clamp(centerIndex + half, 0, sorted.length - 1);
    // ensure enough items
    if (end - start < half * 2) {
      start = Math.max(0, Math.min(start, Math.max(0, sorted.length - (half * 2 + 1))));
      end = Math.min(sorted.length - 1, start + half * 2);
    }

    const visible = sorted.slice(start, end + 1);

    // update content DOM
    const container = ui.content;
    container.innerHTML = '';

    // legend row
    const legend = document.createElement('div');
    legend.style.display = 'flex';
    legend.style.justifyContent = 'space-between';
    legend.style.padding = '6px 4px';
    legend.style.fontSize = '12px';
    legend.style.color = '#333';
    container.appendChild(legend);

    // rows
    visible.forEach(item => {
      const rowWrap = document.createElement('div');
      rowWrap.style.display = 'flex';
      rowWrap.style.alignItems = 'center';
      rowWrap.style.gap = '8px';
      rowWrap.style.padding = '8px 4px';
      rowWrap.style.borderBottom = '1px solid rgba(0,0,0,0.05)';

      // strike label left
      const strikeLabel = document.createElement('div');
      strikeLabel.style.width = '56px';
      strikeLabel.style.fontWeight = '700';
      strikeLabel.style.fontSize = '16px';
      strikeLabel.textContent = item.strike;
      rowWrap.appendChild(strikeLabel);

      // small left column for mini icons or change percent
      const leftCol = document.createElement('div');
      leftCol.style.width = '28px';
      leftCol.style.textAlign = 'center';
      leftCol.style.fontSize = '12px';
      leftCol.style.color = '#333';
      leftCol.innerHTML = ''; // reserved for markers
      rowWrap.appendChild(leftCol);

      // bars container
      const bars = document.createElement('div');
      bars.style.flex = '1';
      bars.style.display = 'flex';
      bars.style.flexDirection = 'column';
      bars.style.gap = '6px';

      // function to create single bar row with color, value, percent
      function createBarRow(color, value, percentText) {
        const br = document.createElement('div');
        br.style.display = 'flex';
        br.style.alignItems = 'center';
        br.style.gap = '10px';

        const barWrap = document.createElement('div');
        barWrap.style.flex = '1';
        barWrap.style.height = '18px';
        barWrap.style.background = '#f1f1f1';
        barWrap.style.borderRadius = '10px';
        barWrap.style.position = 'relative';
        barWrap.style.overflow = 'visible';

        // compute normalized width against max among visible for that metric
        return { br, barWrap, color, value, percentText };
      }

      // collect metric values for normalization later
      rowWrap._metrics = {
        ce: Math.abs(item.ceOI || 0),
        pe: Math.abs(item.peOI || 0),
        dce: Math.abs(item.ceChange || 0),
        dpe: Math.abs(item.peChange || 0),
        raw: item
      };

      bars.appendChild(document.createElement('div')); // placeholder; will replace later
      rowWrap.appendChild(bars);
      container.appendChild(rowWrap);
    });

    // compute maxima per metric across visible
    const visibles = visible.map(v => ({
      ce: Math.abs(v.ceOI || 0),
      pe: Math.abs(v.peOI || 0),
      dce: Math.abs(v.ceChange || 0),
      dpe: Math.abs(v.peChange || 0),
      strike: v.strike
    }));
    const maxCe = Math.max(1, ...visibles.map(v => v.ce));
    const maxPe = Math.max(1, ...visibles.map(v => v.pe));
    const maxDce = Math.max(1, ...visibles.map(v => v.dce));
    const maxDpe = Math.max(1, ...visibles.map(v => v.dpe));

    // now re-render each row's bar set with normalized widths
    Array.from(container.children).forEach((child, idx) => {
      // skip legend (index 0)
      if (idx === 0) return;
      const v = visible[idx - 1];
      // clear placeholder
      const strikeLabel = child.children[0];
      const leftCol = child.children[1];
      const barsDiv = child.children[2];
      barsDiv.innerHTML = '';

      // four bars order: CE (red), PE (green), ΔCE (orange), ΔPE (blue)
      const metrics = [
        { key: 'ce', color: '#d9534f', label: 'CE', val: v.ceOI, max: maxCe },
        { key: 'pe', color: '#218838', label: 'PE', val: v.peOI, max: maxPe },
        { key: 'dce', color: '#ff9800', label: 'ΔCE', val: v.ceChange, max: maxDce },
        { key: 'dpe', color: '#0d47a1', label: 'ΔPE', val: v.peChange, max: maxDpe }
      ];

      metrics.forEach(m => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';

        // small value column
        const valBox = document.createElement('div');
        valBox.style.width = '46px';
        valBox.style.fontSize = '12px';
        valBox.style.fontWeight = '700';
        valBox.textContent = formatNum(m.val);
        row.appendChild(valBox);

        // bar wrapper
        const barWrap = document.createElement('div');
        barWrap.style.flex = '1';
        barWrap.style.height = '20px';
        barWrap.style.background = '#f3f3f3';
        barWrap.style.borderRadius = '12px';
        barWrap.style.position = 'relative';
        barWrap.style.overflow = 'visible';

        const widthPercent = Math.abs(m.val) === 0 ? 2 : clamp((Math.abs(m.val) / (m.max || 1)) * 100, 2, 100);
        const fill = document.createElement('div');
        fill.style.height = '100%';
        fill.style.background = m.color;
        fill.style.width = widthPercent + '%';
        fill.style.borderRadius = '12px';
        fill.style.boxShadow = 'inset 0 -2px 0 rgba(0,0,0,0.06)';
        fill.style.position = 'relative';
        fill.style.display = 'flex';
        fill.style.alignItems = 'center';
        fill.style.justifyContent = 'flex-end';
        fill.style.paddingRight = '6px';
        fill.style.color = '#000';
        fill.style.fontWeight = '700';

        // show exact value on fill (if space) else to the right
        const valText = document.createElement('div');
        valText.style.fontSize = '12px';
        valText.textContent = formatNum(m.val);
        // place value inside fill and also show percent change below
        fill.appendChild(valText);
        barWrap.appendChild(fill);

        // percent label to the right
        const pct = document.createElement('div');
        pct.style.width = '56px';
        pct.style.fontSize = '12px';
        // compute % change from previous snapshot if available
        let pctVal = '-';
        if (state.lastSnapshot && state.lastSnapshot.map && state.lastSnapshot.map[v.strike]) {
          const prev = state.lastSnapshot.map[v.strike];
          let prevVal = prev[m.key] || 0;
          const curVal = m.val || 0;
          const pc = computePercentChange(prevVal, curVal);
          pctVal = formatPercent(pc);
          pct.style.color = pc >= 0 ? '#138000' : '#d9534f';
        } else {
          pctVal = '0.0%';
          pct.style.color = '#666';
        }
        pct.textContent = pctVal;

        row.appendChild(barWrap);
        row.appendChild(pct);
        barsDiv.appendChild(row);
      });

      // highlight ATM row
      if (v.strike === atmStrike) {
        child.style.background = 'linear-gradient(90deg, rgba(3,169,244,0.04), transparent)';
      } else {
        child.style.background = 'transparent';
      }
    });

    // update lastSnapshot (store raw numeric values)
    const now = Date.now();
    const map = {};
    parsedRows.forEach(p => {
      map[p.strike] = {
        ce: p.ceOI || 0,
        pe: p.peOI || 0,
        dce: p.ceChange || 0,
        dpe: p.peChange || 0
      };
    });
    // if previous more than 5m old, replace snapshot; else keep previous older for 5-min compares
    if (!state.lastSnapshot || (now - state.lastSnapshot.timestamp) > 5 * 60 * 1000) {
      state.lastSnapshot = { timestamp: now, map };
    } else {
      // merge (keep older snapshot to compute 5-min change)
      state.lastSnapshot = { timestamp: state.lastSnapshot.timestamp, map: state.lastSnapshot.map || map };
    }

    lastRenderedParsed = parsedRows;
  }

  function renderLast() {
    if (!lastRenderedParsed) return;
    renderHistogram(lastRenderedParsed);
  }

  /*********************************************************
   * Main updater: parse and render
   *********************************************************/
  function updateOnce() {
    try {
      const table = findOptionChainTable();
      if (!table) {
        // no table yet; clear
        ui.content.innerHTML = `<div style="padding:16px;color:#666">Option table not found on page.</div>`;
        return;
      }
      const mapping = mapTableColumns(table);
      if (!mapping || typeof mapping.strikeIndex === 'undefined') {
        ui.content.innerHTML = `<div style="padding:16px;color:#666">Option table mapping failed — headers changed.</div>`;
        return;
      }
      const parsed = parseRows(table, mapping);
      if (!parsed || parsed.length === 0) {
        ui.content.innerHTML = `<div style="padding:16px;color:#666">No option rows found yet.</div>`;
        return;
      }

      // store snapshot and render
      lastRenderedParsed = parsed;
      renderHistogram(parsed);
    } catch (err) {
      console.error('NSE OI histogram error', err);
    }
  }

  /*********************************************************
   * Auto-update: observe DOM changes and interval fallback
   *********************************************************/
  // observe the whole document for table updates
  const observer = new MutationObserver((mutations) => {
    let touched = false;
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length) touched = true;
      if (m.type === 'characterData') touched = true;
      if (m.removedNodes && m.removedNodes.length) touched = true;
      if (touched) break;
    }
    if (touched) updateOnce();
  });

  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  // fallback interval
  const pollInterval = setInterval(updateOnce, 4000);

  // initial call (small delay to let page render)
  setTimeout(updateOnce, 600);

  // expose manual API on window for debugging
  window.__nseOiHistogram = {
    update: updateOnce,
    destroy: () => {
      observer.disconnect();
      clearInterval(pollInterval);
      const el = document.getElementById('__nse_oi_histogram');
      if (el) el.remove();
      window.__NSE_OI_HISTOGRAM_INJECTED = false;
    }
  };

})();
