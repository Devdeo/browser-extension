(function () {
    "use strict";

    if (window.__OI_HISTOGRAM_INIT__) return;
    window.__OI_HISTOGRAM_INIT__ = true;

    let RENDER_LOCK = false;
    let TABLE_OBSERVER = null;

    /* ============================================================
       WAIT FOR TABLE
    ============================================================ */
    function waitForTable(cb) {
        const t = setInterval(() => {
            const tbody = document.querySelector("table tbody");
            if (tbody && tbody.querySelector("tr td")) {
                clearInterval(t);
                cb(tbody);
            }
        }, 400);
    }

    /* ============================================================
       DRAGGABLE
    ============================================================ */
    function makeDraggable(panel, header) {
        let down = false, ox = 0, oy = 0;

        header.addEventListener("mousedown", e => {
            down = true;
            ox = e.clientX - panel.offsetLeft;
            oy = e.clientY - panel.offsetTop;
            document.body.style.userSelect = "none";
        });

        document.addEventListener("mousemove", e => {
            if (!down) return;
            panel.style.left = (e.clientX - ox) + "px";
            panel.style.top = (e.clientY - oy) + "px";
        });

        document.addEventListener("mouseup", () => {
            down = false;
            document.body.style.userSelect = "auto";
        });

        header.addEventListener("touchstart", e => {
            const t = e.touches[0];
            down = true;
            ox = t.clientX - panel.offsetLeft;
            oy = t.clientY - panel.offsetTop;
        });

        document.addEventListener("touchmove", e => {
            if (!down) return;
            const t = e.touches[0];
            panel.style.left = (t.clientX - ox) + "px";
            panel.style.top = (t.clientY - oy) + "px";
        });

        document.addEventListener("touchend", () => down = false);
    }

    /* ============================================================
       PANEL (UNCHANGED UI)
    ============================================================ */
    function createPanel() {
        const panel = document.createElement("div");
        panel.id = "oiHistogramPanel";
        panel.style.cssText = `
            position:fixed;top:70px;left:10px;width:92%;max-width:420px;
            background:#fff;border-radius:16px;
            box-shadow:0 4px 20px rgba(0,0,0,.3);
            z-index:9999999;font-family:sans-serif;
            overflow:hidden;
        `;

        panel.innerHTML = `
            <div id="oiHeader"
                style="display:flex;justify-content:space-between;align-items:center;
                font-size:20px;font-weight:700;padding:8px 12px;
                background:#0a73eb;color:white;border-radius:12px;cursor:grab;">
                <span>OI Histogram</span>
                <div style="display:flex;gap:12px;">
                    <span id="oiMin" style="cursor:pointer;">—</span>
                    <span id="oiClose" style="cursor:pointer;">✖</span>
                </div>
            </div>

            <div id="oiContainer"
                style="margin-top:10px;height:70vh;overflow:auto;
                border:1px solid #ddd;border-radius:10px;padding:10px;">
            </div>
        `;

        document.body.appendChild(panel);

        const header = document.getElementById("oiHeader");
        const container = document.getElementById("oiContainer");
        const minBtn = document.getElementById("oiMin");
        const closeBtn = document.getElementById("oiClose");

        let minimized = false;
        let fullHeight = null;

        setTimeout(() => fullHeight = panel.offsetHeight, 200);

        minBtn.onclick = () => {
            minimized = !minimized;
            container.style.display = minimized ? "none" : "block";
            panel.style.height = minimized ? "48px" : fullHeight + "px";
            minBtn.innerText = minimized ? "+" : "—";
        };

        closeBtn.onclick = () => panel.remove();

        makeDraggable(panel, header);

        const cached = loadCache();
        if (cached.length) drawBars(cached);
    }

    /* ============================================================
       CACHE
    ============================================================ */
    const CACHE_KEY = "__OI_HISTOGRAM_CACHE__";
    const saveCache = d => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch {} };
    const loadCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || []; } catch { return []; } };

    /* ============================================================
       UTIL
    ============================================================ */
    const num = v => parseInt(v.replace(/,/g, "")) || 0;
    const bw = (v, m) => Math.max(8, (v / m) * 250);

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
                ceOI: num(c[1].innerText),
                ceChg: num(c[2].innerText),
                strike: num(c[11].innerText),
                peChg: num(c[20].innerText),
                peOI: num(c[21].innerText)
            });
        });

        return d.filter(x => x.strike > 0);
    }

    /* ============================================================
       DRAW
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
            <div style="margin-bottom:20px;border-bottom:1px dashed #ddd;padding-bottom:10px;">
                <div style="font-size:20px;font-weight:700;margin-bottom:6px;">
                    ${r.strike}
                </div>

                <div><div style="width:${bw(r.ceOI,max)}px;height:12px;background:#ff3030"></div>${r.ceOI}</div>
                <div><div style="width:${bw(r.peOI,max)}px;height:12px;background:#16c784"></div>${r.peOI}</div>
                <div><div style="width:${bw(r.ceChg,max)}px;height:12px;background:#ffb300"></div>${r.ceChg}</div>
                <div><div style="width:${bw(r.peChg,max)}px;height:12px;background:#0066ff"></div>${r.peChg}</div>
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
       AUTO SYNC (FIXED)
    ============================================================ */
    function bindTableObserver(tbody) {
        if (TABLE_OBSERVER) TABLE_OBSERVER.disconnect();

        let lastText = tbody.innerText;

        TABLE_OBSERVER = new MutationObserver(() => {
            const now = tbody.innerText;
            if (now !== lastText) {
                lastText = now;
                safeRender();
            }
        });

        TABLE_OBSERVER.observe(tbody, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    /* ============================================================
       NSE REFRESH FIX
    ============================================================ */
    document.addEventListener("click", e => {
        const a = e.target.closest("a[onclick*='refreshOCPage']");
        if (!a) return;

        const cached = loadCache();
        if (cached.length) drawBars(cached);

        setTimeout(() => {
            waitForTable(tbody => {
                bindTableObserver(tbody);
                safeRender();
            });
        }, 1200);
    }, true);

    /* ============================================================
       DETECT TABLE REPLACEMENT
    ============================================================ */
    const bodyObs = new MutationObserver(() => {
        const tbody = document.querySelector("table tbody");
        if (tbody && (!TABLE_OBSERVER || TABLE_OBSERVER.__target !== tbody)) {
            bindTableObserver(tbody);
            safeRender();
        }
    });
    bodyObs.observe(document.body, { childList: true, subtree: true });

    /* ============================================================
       INIT
    ============================================================ */
    createPanel();
    waitForTable(tbody => {
        bindTableObserver(tbody);
        safeRender();
    });

})();

