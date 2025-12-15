
(function () {
    "use strict";

    if (window.__OI_HISTOGRAM_INIT__) return;
    window.__OI_HISTOGRAM_INIT__ = true;

    /* ============================================================
       CREATE FLOATING PANEL
    ============================================================ */
    function createPanel() {
        const panel = document.createElement("div");
        panel.id = "oiHistogramPanel";
        panel.style.cssText = `
            position:fixed;
            top:70px;
            left:10px;
            width:92%;
            max-width:420px;
            background:#fff;
            border-radius:16px;
            box-shadow:0 4px 20px rgba(0,0,0,.35);
            z-index:9999999;
            font-family:sans-serif;
            overflow:hidden;
        `;

        panel.innerHTML = `
            <div style="
                background:#0a73eb;
                color:#fff;
                padding:8px 12px;
                font-weight:700">
                OI Histogram
            </div>

            <div id="oiContainer"
                style="height:70vh;overflow:auto;padding:10px">
                Click NSE refresh ⟳ to load data
            </div>
        `;

        document.body.appendChild(panel);
    }

    createPanel();

    /* ============================================================
       UTILS
    ============================================================ */
    const num = v => parseInt((v || "").replace(/,/g, ""), 10) || 0;
    const barW = (v, m) => m ? Math.max(8, (v / m) * 240) : 0;

    /* ============================================================
       READ NSE OPTION CHAIN (STRICT)
    ============================================================ */
    function getOptionData() {
        const rows = document.querySelectorAll("table tbody tr");
        const out = [];

        rows.forEach(row => {
            const c = row.querySelectorAll("td");
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
       RENDER HISTOGRAM
    ============================================================ */
    function renderHTMLBars() {
        const box = document.getElementById("oiContainer");
        const data = getOptionData();

        if (!data.length) {
            box.innerHTML = "NSE data not ready… click refresh again ⟳";
            return;
        }

        data.sort((a, b) => b.strike - a.strike);

        const max = Math.max(
            ...data.flatMap(d => [d.ceOI, d.peOI, d.ceChg, d.peChg])
        );

        box.innerHTML = data.map(d => `
            <div style="margin-bottom:14px;border-bottom:1px dashed #ddd">
                <div style="font-weight:700;font-size:18px">
                    ${d.strike}
                </div>

                <div>
                    <div style="width:${barW(d.ceOI,max)}px;height:10px;background:#ff3030"></div>
                    CE OI: ${d.ceOI}
                </div>

                <div>
                    <div style="width:${barW(d.peOI,max)}px;height:10px;background:#16c784"></div>
                    PE OI: ${d.peOI}
                </div>

                <div>
                    <div style="width:${barW(d.ceChg,max)}px;height:10px;background:#ffb300"></div>
                    CE Δ: ${d.ceChg}
                </div>

                <div>
                    <div style="width:${barW(d.peChg,max)}px;height:10px;background:#0066ff"></div>
                    PE Δ: ${d.peChg}
                </div>
            </div>
        `).join("");
    }

    /* ============================================================
       🔥 HOOK NSE refreshOCPage (KEY FIX)
    ============================================================ */
    function hookRefreshOCPage() {
        if (!window.refreshOCPage || window.__OI_HOOKED__) return;

        window.__OI_HOOKED__ = true;

        const original = window.refreshOCPage;

        window.refreshOCPage = function (...args) {
            const result = original.apply(this, args);

            // NSE updates DOM AFTER this function
            setTimeout(renderHTMLBars, 1200);

            return result;
        };

        console.log("[OI Histogram] refreshOCPage hooked");
    }

    /* ============================================================
       INIT – WAIT FOR NSE JS
    ============================================================ */
    const init = setInterval(() => {
        if (typeof window.refreshOCPage === "function") {
            clearInterval(init);
            hookRefreshOCPage();
        }
    }, 300);

})();
