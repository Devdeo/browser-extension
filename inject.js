
(function () {
    "use strict";

    if (window.__OI_HISTOGRAM_INIT__) return;
    window.__OI_HISTOGRAM_INIT__ = true;

    /* ============================================================
       WAIT FOR NSE OPTION CHAIN TABLE
    ============================================================ */
    function waitForTable(cb) {
        const t = setInterval(() => {
            if (document.querySelector("table tbody")) {
                clearInterval(t);
                cb();
            }
        }, 400);
    }

    /* ============================================================
       DRAGGABLE PANEL
    ============================================================ */
    function makeDraggable(panel, header) {
        let down = false, ox = 0, oy = 0;

        const start = (x, y) => {
            down = true;
            ox = x - panel.offsetLeft;
            oy = y - panel.offsetTop;
        };

        const move = (x, y) => {
            if (!down) return;
            panel.style.left = (x - ox) + "px";
            panel.style.top = (y - oy) + "px";
        };

        const end = () => down = false;

        header.addEventListener("mousedown", e => start(e.clientX, e.clientY));
        document.addEventListener("mousemove", e => move(e.clientX, e.clientY));
        document.addEventListener("mouseup", end);

        header.addEventListener("touchstart", e => {
            const t = e.touches[0];
            start(t.clientX, t.clientY);
        });
        document.addEventListener("touchmove", e => {
            const t = e.touches[0];
            if (t) move(t.clientX, t.clientY);
        });
        document.addEventListener("touchend", end);
    }

    /* ============================================================
       CREATE FLOATING PANEL
    ============================================================ */
    function createPanel() {
        const p = document.createElement("div");
        p.id = "oiHistogramPanel";
        p.style.cssText = `
            position:fixed;top:70px;left:10px;
            width:92%;max-width:420px;
            background:#fff;border-radius:16px;
            box-shadow:0 4px 20px rgba(0,0,0,.3);
            z-index:9999999;font-family:sans-serif;
            overflow:hidden;
        `;

        p.innerHTML = `
            <div id="oiHeader" style="
                background:#0a73eb;color:#fff;
                padding:8px 12px;font-weight:700;
                cursor:grab;display:flex;
                justify-content:space-between">
                <span>OI Histogram</span>
                <span id="oiClose" style="cursor:pointer">✖</span>
            </div>

            <div id="oiContainer" style="
                height:70vh;overflow:auto;
                padding:10px">
                Loading NSE data…
            </div>
        `;

        document.body.appendChild(p);
        document.getElementById("oiClose").onclick = () => p.remove();
        makeDraggable(p, document.getElementById("oiHeader"));
    }

    createPanel();

    /* ============================================================
       UTILS
    ============================================================ */
    const num = v => parseInt((v || "").replace(/,/g, ""), 10) || 0;
    const barW = (v, m) => m ? Math.max(8, (v / m) * 240) : 0;

    /* ============================================================
       READ OPTION CHAIN DATA (CORRECT NSE MAP)
    ============================================================ */
    function getOptionData() {
        const rows = document.querySelectorAll("table tbody tr");
        const out = [];

        rows.forEach(r => {
            const c = r.querySelectorAll("td");
            if (c.length < 22) return;

            const strike = num(c[11].innerText);
            if (!strike) return;

            out.push({
                strike,
                ceOI: num(c[1].innerText),
                ceChg: num(c[2].innerText),
                peChg: num(c[20].innerText),
                peOI: num(c[21].innerText)
            });
        });

        return out;
    }

    /* ============================================================
       SAFE RENDER (HARD NSE FIX)
    ============================================================ */
    function renderHTMLBars(retry = 0) {
        const box = document.getElementById("oiContainer");
        const rows = [...document.querySelectorAll("table tbody tr")];

        // 🔒 HARD CONDITION: valid strike prices must exist
        const validStrikeRows = rows.filter(r => {
            const c = r.querySelectorAll("td");
            if (c.length < 12) return false;
            const strike = num(c[11].innerText);
            return strike > 0;
        });

        if (validStrikeRows.length < 3) {
            if (retry < 15) {
                box.innerHTML = "Loading NSE data…";
                setTimeout(() => renderHTMLBars(retry + 1), 500);
            } else {
                box.innerHTML = "NSE data delayed. Click refresh ⟳";
            }
            return;
        }

        const data = getOptionData();
        if (!data.length) {
            if (retry < 15) {
                box.innerHTML = "Syncing option chain…";
                setTimeout(() => renderHTMLBars(retry + 1), 500);
            }
            return;
        }

        data.sort((a, b) => b.strike - a.strike);

        const max = Math.max(
            ...data.flatMap(d => [d.ceOI, d.peOI, d.ceChg, d.peChg])
        );

        box.innerHTML = data.map(d => `
            <div style="margin-bottom:14px;
                        border-bottom:1px dashed #ddd;
                        padding-bottom:6px">

                <div style="font-weight:700;font-size:18px">
                    ${d.strike}
                </div>

                <div>
                    <div style="width:${barW(d.ceOI,max)}px;
                                height:10px;background:#ff3030"></div>
                    CE OI: ${d.ceOI}
                </div>

                <div>
                    <div style="width:${barW(d.peOI,max)}px;
                                height:10px;background:#16c784"></div>
                    PE OI: ${d.peOI}
                </div>

                <div>
                    <div style="width:${barW(d.ceChg,max)}px;
                                height:10px;background:#ffb300"></div>
                    CE Δ: ${d.ceChg}
                </div>

                <div>
                    <div style="width:${barW(d.peChg,max)}px;
                                height:10px;background:#0066ff"></div>
                    PE Δ: ${d.peChg}
                </div>
            </div>
        `).join("");
    }

    /* ============================================================
       TABLE MUTATION OBSERVER (DEBOUNCED)
    ============================================================ */
    function bindTableObserver() {
        const tbody = document.querySelector("table tbody");
        if (!tbody || tbody.__OI_OBS__) return;

        tbody.__OI_OBS__ = true;
        let timer;

        new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => renderHTMLBars(0), 500);
        }).observe(tbody, { childList: true, subtree: true });
    }

    /* ============================================================
       NSE REFRESH BUTTON FIX (ANCHOR BASED)
    ============================================================ */
    function bindNSERefreshButton() {
        const a = document.querySelector("a[onclick*='refreshOCPage']");
        if (!a || a.__OI_BOUND__) return;

        a.__OI_BOUND__ = true;
        a.addEventListener("click", () => {
            setTimeout(() => renderHTMLBars(0), 1200);
        });
    }

    /* ============================================================
       GLOBAL DOM MONITOR
    ============================================================ */
    new MutationObserver(() => {
        if (document.querySelector("table tbody")) {
            bindTableObserver();
            bindNSERefreshButton();
            renderHTMLBars(0);
        }
    }).observe(document.body, { childList: true, subtree: true });

    /* ============================================================
       INIT
    ============================================================ */
    waitForTable(() => {
        bindTableObserver();
        bindNSERefreshButton();
        renderHTMLBars(0);
    });

})();
