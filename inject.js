(function () {
    "use strict";

    if (window.__OI_HISTOGRAM_INIT__) return;
    window.__OI_HISTOGRAM_INIT__ = true;

    const CACHE_KEY = "__OI_LAST_VALID_DATA__";
    window.__OI_CACHE__ = null;

    /* ============================================================
       WAIT FOR TABLE
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
       DRAG SUPPORT
    ============================================================ */
    function makePanelDraggable(panel, header) {
        let d = false, x = 0, y = 0;

        header.addEventListener("mousedown", e => {
            d = true;
            x = e.clientX - panel.offsetLeft;
            y = e.clientY - panel.offsetTop;
            document.body.style.userSelect = "none";
        });

        document.addEventListener("mousemove", e => {
            if (!d) return;
            panel.style.left = e.clientX - x + "px";
            panel.style.top = e.clientY - y + "px";
        });

        document.addEventListener("mouseup", () => {
            d = false;
            document.body.style.userSelect = "auto";
        });
    }

    /* ============================================================
       PANEL
    ============================================================ */
    function createPanel() {
        const p = document.createElement("div");
        p.id = "oiHistogramPanel";
        p.style.cssText = `
            position:fixed;top:70px;left:10px;width:92%;
            max-width:420px;background:#fff;border-radius:16px;
            box-shadow:0 4px 20px rgba(0,0,0,.3);
            z-index:9999999;font-family:sans-serif;
        `;

        p.innerHTML = `
            <div id="oiHeader"
                style="padding:8px 12px;background:#0a73eb;
                color:#fff;font-weight:700;cursor:grab;
                display:flex;justify-content:space-between">
                <span>OI Histogram</span>
                <span id="closeOI" style="cursor:pointer">✖</span>
            </div>
            <div id="oiContainer" style="padding:10px;height:70vh;overflow:auto">
                Loading…
            </div>
        `;

        document.body.appendChild(p);
        makePanelDraggable(p, p.querySelector("#oiHeader"));
        p.querySelector("#closeOI").onclick = () => p.remove();
    }

    createPanel();

    /* ============================================================
       UTIL
    ============================================================ */
    const num = v => parseInt(v.replace(/,/g, "")) || 0;
    const bar = (v, m) => m ? Math.max(8, v / m * 250) : 8;

    /* ============================================================
       READ TABLE
    ============================================================ */
    function readTable() {
        const rows = [...document.querySelectorAll("table tbody tr")];
        const out = [];

        rows.forEach(r => {
            const c = r.children;
            if (c.length < 22) return;
            out.push({
                ceOI: num(c[1].innerText),
                ceChg: num(c[2].innerText),
                strike: num(c[11].innerText),
                peChg: num(c[20].innerText),
                peOI: num(c[21].innerText)
            });
        });

        return out.filter(x => x.strike);
    }

    /* ============================================================
       RENDER (CACHE SAFE)
    ============================================================ */
    function render(data) {
        const box = document.getElementById("oiContainer");
        if (!data || !data.length) return;

        data.sort((a, b) => b.strike - a.strike);

        const max = Math.max(
            ...data.map(x => x.ceOI),
            ...data.map(x => x.peOI),
            ...data.map(x => x.ceChg),
            ...data.map(x => x.peChg)
        );

        box.innerHTML = data.map(r => `
            <div style="border-bottom:1px dashed #ddd;margin-bottom:12px">
                <div style="font-weight:700">${r.strike}</div>
                <div><div style="width:${bar(r.ceOI,max)}px;height:10px;background:#ff3030"></div>${r.ceOI}</div>
                <div><div style="width:${bar(r.peOI,max)}px;height:10px;background:#16c784"></div>${r.peOI}</div>
                <div><div style="width:${bar(r.ceChg,max)}px;height:10px;background:#ffb300"></div>${r.ceChg}</div>
                <div><div style="width:${bar(r.peChg,max)}px;height:10px;background:#0066ff"></div>${r.peChg}</div>
            </div>
        `).join("");
    }

    /* ============================================================
       MAIN UPDATE LOGIC (ANTI-LOADING FREEZE)
    ============================================================ */
    function update() {
        const live = readTable();

        if (live.length) {
            window.__OI_CACHE__ = live;
            localStorage.setItem(CACHE_KEY, JSON.stringify(live));
            render(live);
            return;
        }

        if (window.__OI_CACHE__) {
            render(window.__OI_CACHE__);
            return;
        }

        const saved = localStorage.getItem(CACHE_KEY);
        if (saved) render(JSON.parse(saved));
    }

    /* ============================================================
       OBSERVER
    ============================================================ */
    function bindObserver() {
        const tb = document.querySelector("table tbody");
        if (!tb) return;

        let last = tb.innerText;
        new MutationObserver(() => {
            if (tb.innerText !== last) {
                last = tb.innerText;
                update();
            }
        }).observe(tb, { childList: true, subtree: true });
    }

    /* ============================================================
       NSE REFRESH FIX
    ============================================================ */
    (function () {
        const orig = window.refreshOCPage;
        if (typeof orig !== "function") return;

        window.refreshOCPage = function () {
            update(); // keep cached view
            orig.apply(this, arguments);
            waitForTable(() => setTimeout(update, 300));
        };
    })();

    /* ============================================================
       BOOT
    ============================================================ */
    waitForTable(() => {
        const saved = localStorage.getItem(CACHE_KEY);
        if (saved) render(JSON.parse(saved));
        update();
        bindObserver();
    });

})();
 
