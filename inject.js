
(function () {
    "use strict";

    if (window.__OI_HISTOGRAM_INIT__) return;
    window.__OI_HISTOGRAM_INIT__ = true;

    let RENDER_LOCK = false;
    let TABLE_OBSERVER = null;

    /* ===================== UTIL ===================== */
    const num = v => parseInt(v.replace(/,/g, "")) || 0;
    const bw = (v, m) => Math.max(8, (v / m) * 250);

    /* ===================== WAIT TABLE ===================== */
    function waitForTable(cb) {
        const t = setInterval(() => {
            const tbody = document.querySelector("table tbody");
            if (tbody && tbody.querySelector("tr td")) {
                clearInterval(t);
                cb(tbody);
            }
        }, 400);
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
                    <div>
                        <span id="oiMin" style="cursor:pointer;margin-right:8px;">—</span>
                        <span id="oiClose" style="cursor:pointer;">✖</span>
                    </div>
                </div>
                <div style="font-size:12px;margin-top:4px;">
                    <span id="oiPCR">PCR: --</span> |
                    <span id="oiTotals">CE: -- | PE: --</span><br>
                    <span id="oiRefresh">Last Sync: --</span>
                </div>
            </div>
            <div id="oiContainer" style="margin-top:10px;height:70vh;
                overflow:auto;border:1px solid #ddd;border-radius:10px;padding:10px;">
            </div>
        `;

        document.body.appendChild(panel);

        const header = document.getElementById("oiHeader");
        const box = document.getElementById("oiContainer");
        const minBtn = document.getElementById("oiMin");
        const closeBtn = document.getElementById("oiClose");

        let min = false, fullH = null;
        setTimeout(() => fullH = panel.offsetHeight, 200);

        minBtn.onclick = () => {
            min = !min;
            box.style.display = min ? "none" : "block";
            panel.style.height = min ? "48px" : fullH + "px";
            minBtn.innerText = min ? "+" : "—";
        };

        closeBtn.onclick = () => panel.remove();
        makeDraggable(panel, header);
    }

    /* ===================== DATA ===================== */
    function getData() {
        const rows = [...document.querySelectorAll("table tbody tr")];
        return rows.map(r => {
            const c = r.querySelectorAll("td");
            if (c.length < 22) return null;
            return {
                strike: num(c[11].innerText),
                ceOI: num(c[1].innerText),
                ceChg: num(c[2].innerText),
                peChg: num(c[20].innerText),
                peOI: num(c[21].innerText)
            };
        }).filter(x => x && x.strike > 0);
    }

    function getTotalsFromLastRow() {
        const rows = [...document.querySelectorAll("table tbody tr")];
        if (!rows.length) return null;
        const c = rows[rows.length - 1].querySelectorAll("td");
        if (c.length < 22) return null;
        return {
            ce: num(c[1].innerText),
            pe: num(c[21].innerText)
        };
    }

    /* ===================== HEADER ===================== */
    /* ===================== HEADER ===================== */
function updateHeader(data) {
    const t = getTotalsFromLastRow();
    if (!t) return;

    // PCR
    document.getElementById("oiPCR").innerText =
        `PCR: ${(t.pe / t.ce).toFixed(2)}`;

    // Totals
    document.getElementById("oiTotals").innerText =
        `CE: ${t.ce.toLocaleString()} | PE: ${t.pe.toLocaleString()}`;

    // ===== NSE OFFICIAL TIMESTAMP =====
    let ts = "--";
    const tsEl = document.querySelector("#equity_timeStamp span:last-child");

    if (tsEl && tsEl.innerText.trim()) {
        ts = tsEl.innerText.trim(); // "15-Dec-2025 15:30:00 IST"
    }

    document.getElementById("oiRefresh").innerText =
        `As on: ${ts}`;
}


    /* ===================== DRAW ===================== */
    function draw(data) {
        const box = document.getElementById("oiContainer");
        if (!box || !data.length) return;

        data.sort((a, b) => b.strike - a.strike);
        updateHeader(data);

        const max = Math.max(
            ...data.map(x => x.ceOI),
            ...data.map(x => x.peOI),
            ...data.map(x => x.ceChg),
            ...data.map(x => x.peChg)
        );

        box.innerHTML = data.map(r => `
            <div class="oiRow" data-strike="${r.strike}"
                style="border-bottom:1px dashed #ddd;margin-bottom:12px;">
                <b>${r.strike}</b>
                <div><div style="width:${bw(r.ceOI,max)}px;height:12px;background:#ff3030"></div>${r.ceOI}</div>
                <div><div style="width:${bw(r.peOI,max)}px;height:12px;background:#16c784"></div>${r.peOI}</div>
                <div><div style="width:${bw(r.ceChg,max)}px;height:12px;background:#ffb300"></div>${r.ceChg}</div>
                <div><div style="width:${bw(r.peChg,max)}px;height:12px;background:#0066ff"></div>${r.peChg}</div>
            </div>
        `).join("");

        centerATM(data);
    }

    /* ===================== ATM ===================== */
    function centerATM(data) {
        const spotEl = [...document.querySelectorAll("strong,span,b")]
            .find(e => e.innerText.includes("Underlying"));
        if (!spotEl) return;

        const spot = num(spotEl.innerText);
        const atm = data.reduce((a, b) =>
            Math.abs(b.strike - spot) < Math.abs(a.strike - spot) ? b : a
        );

        const row = document.querySelector(`.oiRow[data-strike="${atm.strike}"]`);
        if (row) row.scrollIntoView({ block: "center" });
    }

    /* ===================== SAFE RENDER ===================== */
    function safeRender() {
        if (RENDER_LOCK) return;
        const d = getData();
        if (!d.length) return;
        RENDER_LOCK = true;
        draw(d);
        setTimeout(() => RENDER_LOCK = false, 400);
    }

    /* ===================== AUTO SYNC ===================== */
    function bindObserver(tbody) {
        if (TABLE_OBSERVER) TABLE_OBSERVER.disconnect();
        let last = tbody.innerText;

        TABLE_OBSERVER = new MutationObserver(() => {
            const now = tbody.innerText;
            if (now !== last) {
                last = now;
                safeRender();
            }
        });

        TABLE_OBSERVER.observe(tbody, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

/* ===================== NSE REFRESH (HARD SAFE FIX) ===================== */
document.addEventListener("click", e => {
    const btn = e.target.closest("a[onclick*='refreshOCPage']");
    if (!btn) return;

    // Allow NSE JS to run first
    setTimeout(() => {
        location.reload(); // ✅ FULL SAFE RELOAD
    }, 300);
}, true);



    /* ===================== INIT ===================== */
    createPanel();
    waitForTable(tbody => {
        bindObserver(tbody);
        safeRender();
    });

})();
