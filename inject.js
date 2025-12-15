(function () {
    "use strict";

    if (window.__OI_HISTOGRAM_INIT__) return;
    window.__OI_HISTOGRAM_INIT__ = true;

    let RENDER_LOCK = false;

    /* ============================================================
       WAIT FOR TABLE TO LOAD
    ============================================================ */
    function waitForTable(cb) {
        const t = setInterval(() => {
            if (document.querySelector("table tbody tr td")) {
                clearInterval(t);
                cb();
            }
        }, 400);
    }

    /* ============================================================
       PANEL
    ============================================================ */
    function createPanel() {
        const p = document.createElement("div");
        p.id = "oiHistogramPanel";
        p.style.cssText = `
            position:fixed;top:70px;left:10px;width:92%;max-width:420px;
            background:#fff;border-radius:16px;
            box-shadow:0 4px 20px rgba(0,0,0,.3);
            z-index:9999999;font-family:sans-serif;
        `;

        p.innerHTML = `
            <div style="padding:8px 12px;background:#0a73eb;color:#fff;
                font-size:20px;font-weight:700;border-radius:12px;">
                OI Histogram
            </div>
            <div id="oiContainer"
                style="margin-top:10px;height:70vh;overflow:auto;
                border:1px solid #ddd;border-radius:10px;padding:10px;">
            </div>
        `;

        document.body.appendChild(p);

        // preload cache ONCE
        const cached = loadCache();
        if (cached.length) drawBars(cached);
    }

    /* ============================================================
       CACHE
    ============================================================ */
    const CACHE_KEY = "__OI_CACHE__";

    function saveCache(d) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch {}
    }
    function loadCache() {
        try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || []; }
        catch { return []; }
    }

    /* ============================================================
       UTIL
    ============================================================ */
    function n(v) { return parseInt(v.replace(/,/g, "")) || 0; }
    function w(v, m) { return Math.max(8, (v / m) * 250); }

    /* ============================================================
       READ TABLE
    ============================================================ */
    function getData() {
        const rows = [...document.querySelectorAll("table tbody tr")];
        const d = [];

        rows.forEach(r => {
            const c = r.querySelectorAll("td");
            if (c.length < 22) return;

            d.push({
                ceOI: n(c[1].innerText),
                ceChg: n(c[2].innerText),
                strike: n(c[11].innerText),
                peChg: n(c[20].innerText),
                peOI: n(c[21].innerText)
            });
        });

        return d.filter(x => x.strike > 0);
    }

    /* ============================================================
       DRAW (NO RECURSION, NO BLANK)
    ============================================================ */
    function drawBars(data) {
        const box = document.getElementById("oiContainer");
        if (!box || !data.length) return;

        saveCache(data);

        data.sort((a, b) => b.strike - a.strike);

        const max = Math.max(
            ...data.map(x => x.ceOI),
            ...data.map(x => x.peOI),
            ...data.map(x => x.ceChg),
            ...data.map(x => x.peChg)
        );

        box.innerHTML = data.map(r => `
            <div style="margin-bottom:20px;border-bottom:1px dashed #ddd;">
                <div style="font-size:20px;font-weight:700">${r.strike}</div>

                <div><div style="width:${w(r.ceOI,max)}px;height:12px;background:#ff3030"></div>${r.ceOI}</div>
                <div><div style="width:${w(r.peOI,max)}px;height:12px;background:#16c784"></div>${r.peOI}</div>
                <div><div style="width:${w(r.ceChg,max)}px;height:12px;background:#ffb300"></div>${r.ceChg}</div>
                <div><div style="width:${w(r.peChg,max)}px;height:12px;background:#0066ff"></div>${r.peChg}</div>
            </div>
        `).join("");
    }

    /* ============================================================
       SAFE RENDER
    ============================================================ */
    function safeRender() {
        if (RENDER_LOCK) return;

        const d = getData();
        if (!d.length) return;

        RENDER_LOCK = true;
        drawBars(d);
        setTimeout(() => RENDER_LOCK = false, 300);
    }

    /* ============================================================
       NSE REFRESH FIX
    ============================================================ */
    document.addEventListener("click", e => {
        const a = e.target.closest("a[onclick*='refreshOCPage']");
        if (!a) return;

        const cached = loadCache();
        if (cached.length) drawBars(cached);

        setTimeout(() => waitForTable(safeRender), 1200);
    }, true);

    /* ============================================================
       OBSERVERS (NO LOOP)
    ============================================================ */
    function observe() {
        const bodyObs = new MutationObserver(() => {
            if (document.querySelector("table tbody tr td")) safeRender();
        });
        bodyObs.observe(document.body, { childList: true, subtree: true });
    }

    /* ============================================================
       INIT
    ============================================================ */
    createPanel();
    observe();
    waitForTable(safeRender);

})();
    
