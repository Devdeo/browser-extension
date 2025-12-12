(function () {
    "use strict";

    // Run only after the page is fully ready
    function waitForTable(callback) {
        const check = setInterval(() => {
            const table = document.querySelector(".opttbldata, table");
            if (table) {
                clearInterval(check);
                callback(table);
            }
        }, 400);
    }

    // UI Already Exists? Avoid duplicate panels
    if (window.__OI_HISTOGRAM_INIT__) return;
    window.__OI_HISTOGRAM_INIT__ = true;

    // --- CONFIG ---
    let strikeCount = 5;
    let keepATM = true;

    // Create floating panel
    function createPanel() {
        const panel = document.createElement("div");
        panel.id = "oiHistogramPanel";
        panel.style.cssText = `
            position: fixed;
            top: 80px;
            left: 10px;
            width: 92%;
            max-width: 420px;
            background: #fff;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.25);
            z-index: 999999;
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

            <div style="margin-top:10px;display:flex;align-items:center;gap:12px;">
                <button id="minusStrike" style="font-size:22px;">−</button>
                <span id="strikeCountTxt" style="font-size:18px;">${strikeCount}</span>
                <button id="plusStrike" style="font-size:22px;">+</button>

                <label style="margin-left:10px;">
                    <input type="checkbox" id="keepATMChk" checked>
                    ATM center
                </label>
            </div>

            <div id="oiContent" style="margin-top:10px;max-height:70vh;overflow:auto;">
                Loading...
            </div>
        `;

        document.body.appendChild(panel);

        // Close button
        document.getElementById("closeOI").onclick = () =>
            panel.remove();

        // Strike buttons
        document.getElementById("minusStrike").onclick = () => {
            if (strikeCount > 1) strikeCount--;
            document.getElementById("strikeCountTxt").innerText = strikeCount;
            renderHistogram();
        };

        document.getElementById("plusStrike").onclick = () => {
            strikeCount++;
            document.getElementById("strikeCountTxt").innerText = strikeCount;
            renderHistogram();
        };

        // ATM checkbox
        document.getElementById("keepATMChk").onchange = (e) => {
            keepATM = e.target.checked;
            renderHistogram();
        };

        return panel;
    }

    let panel = createPanel();

    // Extract data from NSE table safely
    function getOptionData() {
        const rows = [...document.querySelectorAll("table tbody tr")];
        const data = [];

        rows.forEach(r => {
            const cells = r.querySelectorAll("td");
            if (cells.length < 15) return;

            const ceOI = parseInt(cells[1].innerText.replace(/,/g, "")) || 0;
            const ceChg = parseInt(cells[2].innerText.replace(/,/g, "")) || 0;
            const strike = parseFloat(cells[11].innerText.replace(/,/g, "")) || 0;
            const peChg = parseInt(cells[12].innerText.replace(/,/g, "")) || 0;
            const peOI = parseInt(cells[13].innerText.replace(/,/g, "")) || 0;

            data.push({
                strike,
                ceOI, ceChg,
                peOI, peChg
            });
        });

        return data.filter(x => x.strike > 0);
    }

    // Histogram drawer
    function renderHistogram() {
        const box = document.getElementById("oiContent");
        const data = getOptionData();
        if (!data.length) {
            box.innerHTML = "Waiting for table...";
            return;
        }

        // Find ATM
        const spotText = document.querySelector("#underlyingValue, .underlying")?.innerText || "";
        const spot = parseFloat(spotText.replace(/[^\d.]/g, "")) || data[Math.floor(data.length / 2)].strike;

        // Closest strike
        const atmStrike = data.reduce((a, b) =>
            Math.abs(a.strike - spot) < Math.abs(b.strike - spot) ? a : b
        );

        let finalData = [...data];

        if (keepATM) {
            const mid = finalData.indexOf(atmStrike);
            const start = Math.max(0, mid - strikeCount);
            const end = Math.min(finalData.length, mid + strikeCount + 1);
            finalData = finalData.slice(start, end);
        } else {
            finalData = finalData.slice(0, strikeCount * 2);
        }

        box.innerHTML = finalData.map(row => `
            <div style="margin:10px 0;padding:6px;border-bottom:1px solid #ddd;">
                <div><b>${row.strike}</b></div>

                <div style="display:flex;gap:10px;align-items:center;">
                    <span style="color:red">${row.ceOI}</span>
                    <span style="color:orange">${row.ceChg}</span>
                    <div style="flex:1;height:8px;background:blue;border-radius:4px;"></div>
                    <span style="color:green">${row.peOI}</span>
                    <span style="color:blue">${row.peChg}</span>
                </div>
            </div>
        `).join("");
    }

    // Wait until NSE table actually loads
    waitForTable(() => {
        renderHistogram();

        // Auto-update every 3 seconds
        setInterval(() => {
            renderHistogram();
        }, 3000);
    });

})();
