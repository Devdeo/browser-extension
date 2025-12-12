(function () {
    "use strict";

    if (window.__OI_HISTOGRAM_INIT__) return;
    window.__OI_HISTOGRAM_INIT__ = true;

    function waitForTable(callback) {
        const check = setInterval(() => {
            if (document.querySelector("table tbody tr td")) {
                clearInterval(check);
                callback();
            }
        }, 400);
    }

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
            padding: 12px;
            font-family: sans-serif;
        `;

        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;
                font-size:20px;font-weight:700;padding:8px;
                background:#0a73eb;color:white;border-radius:12px;">
                <span>OI Histogram</span>
                <span id="closeOI" style="cursor:pointer;">✖</span>
            </div>

            <div id="oiContainer"
                style="margin-top:10px;height:70vh;overflow-y:auto;overflow-x:hidden;
                border:1px solid #ddd;border-radius:10px;padding:10px;">
                Loading...
            </div>
        `;

        document.body.appendChild(panel);
        document.getElementById("closeOI").onclick = () => panel.remove();
    }

    createPanel();

    function parseNumber(v) {
        return parseInt(v.replace(/,/g, "")) || 0;
    }

    // ================================================
    // CORRECT COLUMN MAPPING FOR NSE OPTION CHAIN TABLE
    // ================================================
    function getOptionData() {
        const rows = [...document.querySelectorAll("table tbody tr")];
        const data = [];

        rows.forEach(r => {
            const c = r.querySelectorAll("td");
            if (c.length < 21) return;  // ensure row fully exists

            data.push({
                ceOI:  parseNumber(c[1].innerText),   // Calls OI
                ceChg: parseNumber(c[2].innerText),   // Calls Chng in OI
                strike: parseNumber(c[11].innerText), // Strike price
                peChg: parseNumber(c[20].innerText),  // Puts Chng in OI
                peOI:  parseNumber(c[21].innerText)   // Puts OI
            });
        });

        return data.filter(x => x.strike > 0);
    }

    // Convert value → proportional pixel width
    function barWidth(value, max) {
        if (max === 0) return 0;
        return Math.max(8, (value / max) * 250); // max bar = 250px
    }

    function renderHTMLBars() {
        const box = document.getElementById("oiContainer");
        const data = getOptionData();

        if (!data.length) {
            box.innerHTML = "Waiting for NSE data…";
            return;
        }

        data.sort((a, b) => a.strike - b.strike);

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

                    <!-- CE OI -->
                    <div style="display:flex;align-items:center;margin:4px 0;">
                        <div style="width:${barWidth(row.ceOI,maxVal)}px;height:12px;background:#ff3030;border-radius:6px;"></div>
                        <span style="margin-left:6px;font-size:13px;">${row.ceOI.toLocaleString()}</span>
                    </div>

                    <!-- PE OI -->
                    <div style="display:flex;align-items:center;margin:4px 0;">
                        <div style="width:${barWidth(row.peOI,maxVal)}px;height:12px;background:#16c784;border-radius:6px;"></div>
                        <span style="margin-left:6px;font-size:13px;">${row.peOI.toLocaleString()}</span>
                    </div>

                    <!-- CE Chg OI -->
                    <div style="display:flex;align-items:center;margin:4px 0;">
                        <div style="width:${barWidth(row.ceChg,maxVal)}px;height:12px;background:#ffb300;border-radius:6px;"></div>
                        <span style="margin-left:6px;font-size:13px;">${row.ceChg.toLocaleString()}</span>
                    </div>

                    <!-- PE Chg OI -->
                    <div style="display:flex;align-items:center;margin:4px 0;">
                        <div style="width:${barWidth(row.peChg,maxVal)}px;height:12px;background:#0066ff;border-radius:6px;"></div>
                        <span style="margin-left:6px;font-size:13px;">${row.peChg.toLocaleString()}</span>
                    </div>

                </div>
            `;
        });

        box.innerHTML = html;
    }

    waitForTable(() => {
        renderHTMLBars();
        setInterval(renderHTMLBars, 3000);
    });

})();
