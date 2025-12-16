
(function () {
    "use strict";

    if (window.__OI_HISTOGRAM_INIT__) return;
    window.__OI_HISTOGRAM_INIT__ = true;

    let TABLE_OBSERVER = null;
    let TABLE_WATCHER = null;
    let STABLE_TIMER = null;
    let LAST_RENDER_HASH = "";
    let LAST_INSTRUMENT = "";

    /* ===================== UTIL ===================== */
    const num = v => parseInt(String(v || "").replace(/,/g, "")) || 0;
    const bw = (v, m) => Math.max(8, (v / m) * 250);

    /* ===================== WAIT TABLE ===================== */
    function waitForTable(cb) {
        const t = setInterval(() => {
            const tbody = document.querySelector("table tbody");
            if (tbody && tbody.querySelector("tr td")) {
                clearInterval(t);
                cb(tbody);
            }
        }, 300);
    }

    /* ===================== DRAG ===================== */
    function makeDraggable(panel, header) {
        let d = false, ox = 0, oy = 0;

        header.addEventListener("mousedown", e => {
            d = true;
            ox = e.clientX - panel.offsetLeft;
            oy = e.clientY - panel.offsetTop;
            document.body.style.userSelect = "none";
        });

        document.addEventListener("mousemove", e => {
            if (!d) return;
            panel.style.left = (e.clientX - ox) + "px";
            panel.style.top = (e.clientY - oy) + "px";
        });

        document.addEventListener("mouseup", () => {
            d = false;
            document.body.style.userSelect = "auto";
        });
    }

    /* ===================== PANEL ===================== */
    function createPanel() {
        if (document.getElementById("oiHistogramPanel")) return;

        const panel = document.createElement("div");
        panel.id = "oiHistogramPanel";
        panel.style.cssText = `
            position:fixed;top:70px;left:10px;width:92%;max-width:420px;
            background:#fff;border-radius:16px;
            box-shadow:0 4px 20px rgba(0,0,0,.3);
            z-index:9999999;font-family:sans-serif;overflow:hidden;
        `;

        panel.innerHTML = `
            <div id="oiHeader" style="background:#0a73eb;color:#fff;
                padding:8px 12px;border-radius:12px;cursor:grab;">
                <div style="display:flex;justify-content:space-between;">
                    <b>OI Histogram</b>
                    <span id="oiMin" style="cursor:pointer">—</span>
                </div>
                <div style="font-size:12px;margin-top:4px;">
                    <span id="oiPCR">PCR: --</span> |
                    <span id="oiTotals">CE: -- | PE: --</span><br>
                    <span id="oiRefresh">As on: --</span>
                </div>
            </div>
            <div id="oiContainer"
                style="margin-top:10px;height:70vh;overflow:auto;
                border:1px solid #ddd;border-radius:10px;padding:10px;">
            </div>
        `;

        document.body.appendChild(panel);

        const header = panel.querySelector("#oiHeader");
        const box = panel.querySelector("#oiContainer");
        const minBtn = panel.querySelector("#oiMin");

        let min = false, fullH = null;
        setTimeout(() => fullH = panel.offsetHeight, 200);

        minBtn.onclick = () => {
            min = !min;
            box.style.display = min ? "none" : "block";
            panel.style.height = min ? "48px" : fullH + "px";
            minBtn.innerText = min ? "+" : "—";
        };

        makeDraggable(panel, header);
    }

    /* ===================== DATA ===================== */
    function getData() {
        const rows = document.querySelectorAll("table tbody tr");
        const out = [];

        rows.forEach(r => {
            const c = r.querySelectorAll("td");
            if (c.length < 22) return;
            out.push({
                strike: num(c[11].innerText),
                ceOI: num(c[1].innerText),
                ceChg: num(c[2].innerText),
                peChg: num(c[20].innerText),
                peOI: num(c[21].innerText)
            });
        });

        return out.filter(x => x.strike > 0);
    }

    function getTotalsFromLastRow() {
        const rows = document.querySelectorAll("table tbody tr");
        if (!rows.length) return null;
        const c = rows[rows.length - 1].querySelectorAll("td");
        if (c.length < 22) return null;
        return { ce: num(c[1].innerText), pe: num(c[21].innerText) };
    }

    /* ===================== HEADER ===================== */
    function updateHeader() {
        const t = getTotalsFromLastRow();
        if (!t) return;

        document.getElementById("oiPCR").innerText =
            `PCR: ${(t.pe / t.ce).toFixed(2)}`;

        document.getElementById("oiTotals").innerText =
            `CE: ${t.ce.toLocaleString()} | PE: ${t.pe.toLocaleString()}`;

        const ts = document.querySelector("#equity_timeStamp span:last-child");
        document.getElementById("oiRefresh").innerText =
            `As on: ${ts ? ts.innerText.trim() : "--"}`;
    }

    /* ===================== DRAW ===================== */
    function draw() {
        const data = getData();
        if (!data.length) return;

        const hash = JSON.stringify(data.map(d => d.ceOI + "|" + d.peOI));
        if (hash === LAST_RENDER_HASH) return;
        LAST_RENDER_HASH = hash;

        const box = document.getElementById("oiContainer");
        updateHeader();

        data.sort((a, b) => b.strike - a.strike);

        const max = Math.max(
            ...data.map(x => x.ceOI),
            ...data.map(x => x.peOI),
            ...data.map(x => x.ceChg),
            ...data.map(x => x.peChg)
        );

        box.innerHTML = data.map(r => `
            <div class="oiRow" data-strike="${r.strike}"
                style="border-bottom:1px dashed #ddd;margin-bottom:10px">
                <b>${r.strike}</b>
                <div><div style="width:${bw(r.ceOI,max)}px;height:10px;background:#ff3030"></div>${r.ceOI}</div>
                <div><div style="width:${bw(r.peOI,max)}px;height:10px;background:#16c784"></div>${r.peOI}</div>
                <div><div style="width:${bw(r.ceChg,max)}px;height:8px;background:#ffb300"></div>${r.ceChg}</div>
                <div><div style="width:${bw(r.peChg,max)}px;height:8px;background:#0066ff"></div>${r.peChg}</div>
            </div>
        `).join("");

        centerATM(data);
    }

    /* ===================== ATM ===================== */
    function centerATM(data) {
        const el = document.getElementById("equity_underlyingVal");
        if (!el) return;

        const spot = num(el.innerText);
        const atm = data.reduce((a, b) =>
            Math.abs(b.strike - spot) < Math.abs(a.strike - spot) ? b : a
        );

        const row = document.querySelector(`.oiRow[data-strike="${atm.strike}"]`);
        if (row) row.scrollIntoView({ block: "center" });
    }

    /* ===================== STABLE RENDER ===================== */
    function scheduleStableRender() {
        clearTimeout(STABLE_TIMER);
        STABLE_TIMER = setTimeout(draw, 300);
    }

    /* ===================== OBSERVER ===================== */
    function bindObserver(tbody) {
        if (TABLE_OBSERVER) TABLE_OBSERVER.disconnect();

        TABLE_OBSERVER = new MutationObserver(scheduleStableRender);
        TABLE_OBSERVER.observe(tbody, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    /* ===================== TABLE REPLACEMENT WATCH ===================== */
    function watchTableReplacement() {
        let lastTable = null;

        if (TABLE_WATCHER) TABLE_WATCHER.disconnect();

        TABLE_WATCHER = new MutationObserver(() => {
            const table = document.querySelector("table");
            if (!table || table === lastTable) return;

            lastTable = table;
            waitForTable(tbody => {
                bindObserver(tbody);
                scheduleStableRender();
            });
        });

        TABLE_WATCHER.observe(document.body, { childList: true, subtree: true });
    }

    /* ===================== INSTRUMENT WATCH ===================== */
    function getInstrument() {
        const el = document.getElementById("equity_underlyingVal");
        return el ? el.innerText.split(/\s+/)[0] : "";
    }

    function watchInstrumentChange() {
        setInterval(() => {
            const now = getInstrument();
            if (now && now !== LAST_INSTRUMENT) {
                LAST_INSTRUMENT = now;
                waitForTable(tbody => {
                    bindObserver(tbody);
                    scheduleStableRender();
                });
            }
        }, 400);
    }

    /* ===================== INIT ===================== */
    createPanel();

    waitForTable(tbody => {
        bindObserver(tbody);
        draw();
    });

    watchTableReplacement();
    watchInstrumentChange();

})();
        
