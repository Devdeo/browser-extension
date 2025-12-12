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
            padding: 0;
            font-family: sans-serif;
            overflow: hidden;
            transition: height 0.25s ease, opacity 0.25s ease;
        `;

        panel.innerHTML = `
            <div id="oiHeader" 
                style="display:flex;justify-content:space-between;align-items:center;
                font-size:20px;font-weight:700;padding:8px 12px;
                background:#0a73eb;color:white;border-radius:12px;">
                
                <span>OI Histogram</span>

                <div style="display:flex;gap:12px;align-items:center;">
                    <span id="toggleMin" style="cursor:pointer;font-size:18px;">—</span>
                    <span id="closeOI" style="cursor:pointer;font-size:18px;">✖</span>
                </div>
            </div>

            <div id="oiContainer"
                style="margin-top:10px;height:70vh;overflow-y:auto;overflow-x:hidden;
                border:1px solid #ddd;border-radius:10px;padding:10px;">
                Loading...
            </div>
        `;

        document.body.appendChild(panel);

        const container = document.getElementById("oiContainer");
        const header = document.getElementById("oiHeader");
        const toggleBtn = document.getElementById("toggleMin");
        const closeBtn = document.getElementById("closeOI");

        let minimized = false;
        let fullHeight = 500;

        // Save full height after render
        setTimeout(() => {
            fullHeight = panel.offsetHeight;
        }, 300);

        toggleBtn.onclick = () => {
            minimized = !minimized;

            if (minimized) {
                container.style.display = "none";
                panel.style.height = "48px";
                toggleBtn.innerText = "+";
            } else {
                container.style.display = "block";
                panel.style.height = fullHeight + "px";
                toggleBtn.innerText = "—";
            }
        };

        closeBtn.onclick = () => panel.remove();
    }

    createPanel();

    function parseNumber(v) {
        return parseInt(v.replace(/,/g, "")) || 0;
    }

    function getOptionData() {
        const rows = [...document.querySelectorAll("table tbody tr")];
        const data = [];

        rows.forEach(r => {
            const c = r.querySelectorAll("td");
            if (c.length < 21) return;

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

    function barWidth(value, max) {
        if (max === 0) return 0;
        return Math.max(8, (value / max) * 250);
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

                    <div style="display:flex;align-items:center;margin:4px 0;">
                        <div style="width:${barWidth(row.ceOI,maxVal)}px;height:12px;background:#ff3030;border-radius:6px;"></div>
                        <span style="margin-left:6px;font-size:13px;">${row.ceOI.toLocaleString()}</span>
                    </div>

                    <div style="display:flex;align-items:center;margin:4px 0;">
                        <div style="width:${barWidth(row.peOI,maxVal)}px;height:12px;background:#16c784;border-radius:6px;"></div>
                        <span style="margin-left:6px;font-size:13px;">${row.peOI.toLocaleString()}</span>
                    </div>

                    <div style="display:flex;align-items:center;margin:4px 0;">
                        <div style="width:${barWidth(row.ceChg,maxVal)}px;height:12px;background:#ffb300;border-radius:6px;"></div>
                        <span style="margin-left:6px;font-size:13px;">${row.ceChg.toLocaleString()}</span>
                    </div>

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
