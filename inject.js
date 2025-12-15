
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
            overflow: hidden;
            font-family: sans-serif;
        `;

        panel.innerHTML = `
            <div id="oiHeader"
                style="display:flex;justify-content:space-between;align-items:center;
                padding:8px 12px;background:#0a73eb;color:#fff;
                font-size:18px;font-weight:700;cursor:grab;">
                <span>OI Histogram</span>
                <span id="closeOI" style="cursor:pointer;">✖</span>
            </div>
            <div id="oiContainer"
                style="padding:10px;height:70vh;overflow:auto;">
                Loading…
            </div>
        `;

        document.body.appendChild(panel);
        makePanelDraggable(panel, document.getElementById("oiHeader"));
        document.getElementById("closeOI").onclick = () => panel.remove();
    }

    createPanel();

    /* ============================================================
       ADD SYNC BUTTON
    ============================================================ */
    function addSyncButton() {
        const nodes = [...document.querySelectorAll("*")];
        let target = null;

        for (let el of nodes) {
            if (el.innerText && el.innerText.includes("Underlying Index")) {
                target = el.parentElement;
                break;
            }
        }

        if (!target || document.getElementById("oiSyncBtn")) return;

        const btn = document.createElement("button");
        btn.id = "oiSyncBtn";
        btn.innerText = "🔄 Sync";
        btn.style.cssText = `
            margin-left:10px;
            padding:4px 10px;
            border-radius:8px;
            border:1px solid #0a73eb;
            background:#fff;
            color:#0a73eb;
            cursor:pointer;
        `;
        btn.onclick = () => renderHTMLBars();
        target.appendChild(btn);
    }

    setTimeout(addSyncButton, 1200);

    /* ============================================================
       UTIL
    ============================================================ */
    function parseNumber(v) {
        return parseInt(v.replace(/,/g, "")) || 0;
    }

    /* ============================================================
       READ TABLE
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

        return data.filter(x => x.strike);
    }

    function barWidth(v, max) {
        return max ? Math.max(8, (v / max) * 250) : 0;
    }

    /* ============================================================
       RENDER HISTOGRAM
    ============================================================ */
    function renderHTMLBars() {
        const box = document.getElementById("oiContainer");
        const data = getOptionData();

        if (!data.length) {
            box.innerHTML = "Waiting for NSE data…";
            return;
        }

        data.sort((a, b) => b.strike - a.strike);

        const maxVal = Math.max(
            ...data.map(x => x.ceOI),
            ...data.map(x => x.peOI),
            ...data.map(x => x.ceChg),
            ...data.map(x => x.peChg)
        );

        box.innerHTML = data.map(r => `
            <div style="margin-bottom:14px;border-bottom:1px dashed #ddd;">
                <div style="font-weight:700;margin-bottom:6px;">${r.strike}</div>
                <div><div style="width:${barWidth(r.ceOI,maxVal)}px;height:10px;background:#ff3030"></div>${r.ceOI}</div>
                <div><div style="width:${barWidth(r.peOI,maxVal)}px;height:10px;background:#16c784"></div>${r.peOI}</div>
                <div><div style="width:${barWidth(r.ceChg,maxVal)}px;height:10px;background:#ffb300"></div>${r.ceChg}</div>
                <div><div style="width:${barWidth(r.peChg,maxVal)}px;height:10px;background:#0066ff"></div>${r.peChg}</div>
            </div>
        `).join("");
    }

    /* ============================================================
       AUTO UPDATE
    ============================================================ */
    function enableInstantSync() {
        const table = document.querySelector("table tbody");
        if (!table) return;

        let last = table.innerText;
        const observer = new MutationObserver(() => {
            if (table.innerText !== last) {
                last = table.innerText;
                renderHTMLBars();
            }
        });

        observer.observe(table, { childList: true, subtree: true });
    }

    /* ============================================================
       FIX: NSE REFRESH BUTTON HOOK
    ============================================================ */
    (function hookNSERefresh() {
        if (window.__OI_REFRESH_HOOK__) return;
        window.__OI_REFRESH_HOOK__ = true;

        const original = window.refreshOCPage;
        if (typeof original === "function") {
            window.refreshOCPage = function () {
                const box = document.getElementById("oiContainer");
                if (box) box.innerHTML = "Refreshing NSE data…";

                original.apply(this, arguments);

                waitForTable(() => {
                    setTimeout(() => {
                        renderHTMLBars();
                        enableInstantSync();
                        addSyncButton();
                    }, 300);
                });
            };
        }
    })();

    /* ============================================================
       MONITOR TABLE REPLACEMENT
    ============================================================ */
    function monitorTableReplacement() {
        const obs = new MutationObserver(() => {
            if (document.querySelector("table tbody")) {
                enableInstantSync();
                renderHTMLBars();
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    monitorTableReplacement();

    /* ============================================================
       INITIAL
    ============================================================ */
    waitForTable(() => {
        renderHTMLBars();
        enableInstantSync();
    });

})();
