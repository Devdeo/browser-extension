
(function () {
    "use strict";

    if (window.__OI_HISTOGRAM_INIT__) return;
    window.__OI_HISTOGRAM_INIT__ = true;

    /* ================= WAIT FOR TABLE ================= */
    function waitForTable(cb) {
        const i = setInterval(() => {
            if (document.querySelector("table tbody tr td")) {
                clearInterval(i);
                cb();
            }
        }, 400);
    }

    /* ================= DRAG ================= */
    function makePanelDraggable(panel, header) {
        let d = false, ox = 0, oy = 0;
        const start = (x, y) => { d = true; ox = x - panel.offsetLeft; oy = y - panel.offsetTop; };
        const move = (x, y) => d && (panel.style.left = x - ox + "px", panel.style.top = y - oy + "px");
        const end = () => d = false;

        header.addEventListener("mousedown", e => start(e.clientX, e.clientY));
        document.addEventListener("mousemove", e => move(e.clientX, e.clientY));
        document.addEventListener("mouseup", end);

        header.addEventListener("touchstart", e => {
            const t = e.touches[0]; start(t.clientX, t.clientY);
        });
        document.addEventListener("touchmove", e => {
            const t = e.touches[0]; t && move(t.clientX, t.clientY);
        });
        document.addEventListener("touchend", end);
    }

    /* ================= PANEL ================= */
    function createPanel() {
        const p = document.createElement("div");
        p.id = "oiHistogramPanel";
        p.style.cssText = `
            position:fixed;top:70px;left:10px;width:92%;max-width:420px;
            background:#fff;border-radius:16px;
            box-shadow:0 4px 20px rgba(0,0,0,.3);
            z-index:9999999;font-family:sans-serif;overflow:hidden;
        `;

        p.innerHTML = `
            <div id="oiHeader" style="background:#0a73eb;color:#fff;
                 padding:8px 12px;font-weight:700;cursor:grab;
                 display:flex;justify-content:space-between">
                <span>OI Histogram</span>
                <span id="oiClose" style="cursor:pointer">✖</span>
            </div>
            <div id="oiContainer" style="height:70vh;overflow:auto;padding:10px">
                Loading…
            </div>
        `;

        document.body.appendChild(p);
        p.querySelector("#oiClose").onclick = () => p.remove();
        makePanelDraggable(p, p.querySelector("#oiHeader"));
    }

    createPanel();

    /* ================= UTILS ================= */
    const num = v => parseInt(v.replace(/,/g, "")) || 0;
    const bw = (v, m) => m ? Math.max(8, (v / m) * 240) : 0;

    /* ================= READ DATA ================= */
    function getOptionData() {
        return [...document.querySelectorAll("table tbody tr")]
            .map(r => {
                const c = r.querySelectorAll("td");
                if (c.length < 22) return null;
                return {
                    ceOI: num(c[1].innerText),
                    ceChg: num(c[2].innerText),
                    strike: num(c[11].innerText),
                    peChg: num(c[20].innerText),
                    peOI: num(c[21].innerText)
                };
            }).filter(Boolean);
    }

    /* ================= RENDER ================= */
    function renderHTMLBars() {
        const box = document.getElementById("oiContainer");
        const d = getOptionData();
        if (!d.length) return box.innerHTML = "Waiting for data…";

        d.sort((a, b) => b.strike - a.strike);
        const max = Math.max(...d.flatMap(x => [x.ceOI, x.peOI, x.ceChg, x.peChg]));

        box.innerHTML = d.map(x => `
            <div style="margin-bottom:14px;border-bottom:1px dashed #ddd">
                <b>${x.strike}</b>
                <div><div style="width:${bw(x.ceOI,max)}px;height:10px;background:#ff3030"></div>${x.ceOI}</div>
                <div><div style="width:${bw(x.peOI,max)}px;height:10px;background:#16c784"></div>${x.peOI}</div>
                <div><div style="width:${bw(x.ceChg,max)}px;height:10px;background:#ffb300"></div>${x.ceChg}</div>
                <div><div style="width:${bw(x.peChg,max)}px;height:10px;background:#0066ff"></div>${x.peChg}</div>
            </div>
        `).join("");
    }

    /* ================= AUTO SYNC ================= */
    function enableInstantSync() {
        const tb = document.querySelector("table tbody");
        if (!tb) return;
        let last = tb.innerText;
        new MutationObserver(() => {
            if (tb.innerText !== last) {
                last = tb.innerText;
                renderHTMLBars();
            }
        }).observe(tb, { childList: true, subtree: true });
    }

    /* ================= REFRESH FIX ================= */
    function bindNSERefreshButton() {
        const a = document.querySelector("a[onclick*='refreshOCPage']");
        if (!a || a.__OI_BOUND__) return;
        a.__OI_BOUND__ = true;
        a.addEventListener("click", () => {
            setTimeout(renderHTMLBars, 1500);
        });
    }

    new MutationObserver(bindNSERefreshButton)
        .observe(document.body, { childList: true, subtree: true });

    /* ================= MONITOR TABLE ================= */
    new MutationObserver(() => {
        if (document.querySelector("table tbody")) {
            enableInstantSync();
            renderHTMLBars();
            bindNSERefreshButton();
        }
    }).observe(document.body, { childList: true, subtree: true });

    /* ================= INIT ================= */
    waitForTable(() => {
        renderHTMLBars();
        enableInstantSync();
        bindNSERefreshButton();
    });

})();
