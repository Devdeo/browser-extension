
(function () {
    "use strict";

    if (window.__OI_HISTOGRAM_INIT__) return;
    window.__OI_HISTOGRAM_INIT__ = true;

    /* ============================================================
       WAIT FOR TABLE TO LOAD
    ============================================================ */
    function waitForTable(callback) {
        const check = setInterval(() => {
            if (document.querySelector("table tbody tr td")) {
                clearInterval(check);
                callback();
            }
        }, 400);
    }

    /* ============================================================
       DRAGGABLE PANEL SUPPORT
    ============================================================ */
    function makePanelDraggable(panel, header) {
        let isDown = false;
        let offsetX = 0;
        let offsetY = 0;

        header.addEventListener("mousedown", e => {
            isDown = true;
            offsetX = e.clientX - panel.offsetLeft;
            offsetY = e.clientY - panel.offsetTop;
            document.body.style.userSelect = "none";
        });

        document.addEventListener("mousemove", e => {
            if (!isDown) return;
            panel.style.left = (e.clientX - offsetX) + "px";
            panel.style.top = (e.clientY - offsetY) + "px";
        });

        document.addEventListener("mouseup", () => {
            isDown = false;
            document.body.style.userSelect = "auto";
        });

        header.addEventListener("touchstart", e => {
            isDown = true;
            const t = e.touches[0];
            offsetX = t.clientX - panel.offsetLeft;
            offsetY = t.clientY - panel.offsetTop;
            document.body.style.userSelect = "none";
        });

        document.addEventListener("touchmove", e => {
            if (!isDown) return;
            const t = e.touches[0];
            panel.style.left = (t.clientX - offsetX) + "px";
            panel.style.top = (t.clientY - offsetY) + "px";
        });

        document.addEventListener("touchend", () => {
            isDown = false;
            document.body.style.userSelect = "auto";
        });
    }

    /* ============================================================
       CREATE PANEL
    ============================================================ */
    function createPanel() {
        const panel = document.createElement("div");
        panel.id = "oiHistogramPanel";
        panel.style.cssText = `
            position: fixed;
            top: 70px;
            left: 10px;
            width: 92%;
            max-width: 420px;
            background: #fff;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 9999999;
            padding: 0;
            font-family: sans-serif;
            overflow: hidden;
        `;

        panel.innerHTML = `
            <div id="oiHeader"
                style="display:flex;justify-content:space-between;align-items:center;
                font-size:20px;font-weight:700;padding:8px 12px;
                background:#0a73eb;color:white;border-radius:12px;cursor:grab;">
                <span>OI Histogram</span>
                <div style="display:flex;gap:12px;">
                    <span id="toggleMin" style="cursor:pointer;">—</span>
                    <span id="closeOI" style="cursor:pointer;">✖</span>
                </div>
            </div>

            <div id="oiContainer"
                style="margin-top:10px;height:70vh;overflow:auto;
                border:1px solid #ddd;border-radius:10px;padding:10px;">
            </div>
        `;

        document.body.appendChild(panel);

        const container = document.getElementById("oiContainer");
        const header = document.getElementById("oiHeader");

        makePanelDraggable(panel, header);

        // 🔥 preload cached data instantly
        const cached = loadCache();
        if (cached.length) renderHTMLBars(cached);
    }

    /* ============================================================
       LOCAL STORAGE CACHE
    ============================================================ */
    const OI_CACHE_KEY = "__OI_HISTOGRAM_CACHE__";

    function saveCache(data) {
        try {
            localStorage.setItem(OI_CACHE_KEY, JSON.stringify(data));
        } catch (e) {}
    }

    function loadCache() {
        try {
            return JSON.parse(localStorage.getItem(OI_CACHE_KEY)) || [];
        } catch (e) {
            return [];
        }
    }

    /* ============================================================
       UTIL
    ============================================================ */
    function parseNumber(v) {
        return parseInt(v.replace(/,/g, "")) || 0;
    }

    function barWidth(value, max) {
        if (!max) return 8;
        return Math.max(8, (value / max) * 250);
    }

    /* ============================================================
       READ OPTION CHAIN
    ============================================================ */
    function getOptionData() {
        const rows = [...document.querySelectorAll("table tbody tr")];
        const data = [];

        rows.forEach(r => {
            const c = r.querySelectorAll("td");
            if (c.length < 22) return;

            data.push({
                ceOI: parseNumber(c[1].innerText),
                ceChg: parseNumber(c[2].innerText),
                strike: parseNumber(c[11].innerText),
                peChg: parseNumber(c[20].innerText),
                peOI: parseNumber(c[21].innerText)
            });
        });

        return data.filter(x => x.strike > 0);
    }

    /* ============================================================
       RENDER HISTOGRAM
    ============================================================ */
    function renderHTMLBars(dataOverride) {
        const box = document.getElementById("oiContainer");
        const data = dataOverride || getOptionData();

        if (!data.length) {
            const cached = loadCache();
            if (cached.length) renderHTMLBars(cached);
            return;
        }

        saveCache(data);

        data.sort((a, b) => b.strike - a.strike);

        const maxVal = Math.max(
            ...data.map(x => x.ceOI),
            ...data.map(x => x.peOI),
            ...data.map(x => x.ceChg),
            ...data.map(x => x.peChg)
        );

        let html = "";

        data.forEach(row => {
            html += `
            <div style="margin-bottom:20px;border-bottom:1px dashed #ddd;padding-bottom:10px;">
                <div style="font-size:20px;font-weight:700;margin-bottom:10px;">
                    ${row.strike.toLocaleString()}
                </div>

                <div style="display:flex;align-items:center;margin:4px 0;">
                    <div style="width:${barWidth(row.ceOI,maxVal)}px;height:12px;background:#ff3030;border-radius:6px;"></div>
                    <span style="margin-left:6px;">${row.ceOI.toLocaleString()}</span>
                </div>

                <div style="display:flex;align-items:center;margin:4px 0;">
                    <div style="width:${barWidth(row.peOI,maxVal)}px;height:12px;background:#16c784;border-radius:6px;"></div>
                    <span style="margin-left:6px;">${row.peOI.toLocaleString()}</span>
                </div>

                <div style="display:flex;align-items:center;margin:4px 0;">
                    <div style="width:${barWidth(row.ceChg,maxVal)}px;height:12px;background:#ffb300;border-radius:6px;"></div>
                    <span style="margin-left:6px;">${row.ceChg.toLocaleString()}</span>
                </div>

                <div style="display:flex;align-items:center;margin:4px 0;">
                    <div style="width:${barWidth(row.peChg,maxVal)}px;height:12px;background:#0066ff;border-radius:6px;"></div>
                    <span style="margin-left:6px;">${row.peChg.toLocaleString()}</span>
                </div>
            </div>`;
        });

        box.innerHTML = html;
    }

    /* ============================================================
       AUTO SYNC
    ============================================================ */
    function enableInstantSync() {
        const table = document.querySelector("table tbody");
        if (!table) return;

        let last = table.innerText;

        const observer = new MutationObserver(() => {
            const now = table.innerText;
            if (now !== last) {
                last = now;
                renderHTMLBars();
            }
        });

        observer.observe(table, { childList: true, subtree: true });
    }

    /* ============================================================
       NSE REFRESH BUTTON FIX
    ============================================================ */
    function bindNSERefresh() {
        document.addEventListener("click", e => {
            const a = e.target.closest("a[onclick*='refreshOCPage']");
            if (!a) return;

            const cached = loadCache();
            if (cached.length) renderHTMLBars(cached);

            setTimeout(() => {
                waitForTable(() => {
                    renderHTMLBars();
                    enableInstantSync();
                });
            }, 1200);
        }, true);
    }

    /* ============================================================
       TABLE REPLACEMENT MONITOR
    ============================================================ */
    function monitorTableReplacement() {
        const observer = new MutationObserver(() => {
            const table = document.querySelector("table tbody");
            if (table) {
                renderHTMLBars();
                enableInstantSync();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    /* ============================================================
       INIT
    ============================================================ */
    createPanel();
    bindNSERefresh();
    monitorTableReplacement();

    waitForTable(() => {
        renderHTMLBars();
        enableInstantSync();
    });

})();
