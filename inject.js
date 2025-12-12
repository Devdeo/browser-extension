(function () {
    "use strict";

    // Prevent double initialization
    if (window.__OI_HISTOGRAM_INIT__) return;
    window.__OI_HISTOGRAM_INIT__ = true;

    let strikeCount = 5;
    let keepATM = true;
    let chart = null;

    // Wait for NSE Option Chain table
    function waitForTable(callback) {
        const check = setInterval(() => {
            const table = document.querySelector(".opttbldata, table");
            if (table) {
                clearInterval(check);
                callback();
            }
        }, 500);
    }

    // Create floating UI panel
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

            <div id="chart" style="margin-top:10px; height: 430px;"></div>
        `;

        document.body.appendChild(panel);

        document.getElementById("closeOI").onclick = () => panel.remove();

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

        document.getElementById("keepATMChk").onchange = (e) => {
            keepATM = e.target.checked;
            renderHistogram();
        };
    }

    createPanel();

    // Extract table data
    function getOptionData() {
        const rows = [...document.querySelectorAll("table tbody tr")];
        const data = [];

        rows.forEach(r => {
            const c = r.querySelectorAll("td");
            if (c.length < 15) return;

            data.push({
                ceOI: parseInt(c[1].innerText.replace(/,/g, "")) || 0,
                ceChg: parseInt(c[2].innerText.replace(/,/g, "")) || 0,
                strike: parseFloat(c[11].innerText.replace(/,/g, "")) || 0,
                peChg: parseInt(c[12].innerText.replace(/,/g, "")) || 0,
                peOI: parseInt(c[13].innerText.replace(/,/g, "")) || 0
            });
        });

        return data.filter(x => x.strike > 0);
    }

    // Build ApexCharts OI Histogram
    function renderHistogram() {
        const data = getOptionData();
        if (!data.length) return;

        // Find ATM strike
        const spotText = document.querySelector("#underlyingValue, .underlying")?.innerText || "";
        const spot = parseFloat(spotText.replace(/[^\d.]/g, "")) || data[Math.floor(data.length / 2)].strike;

        const atmStrike = data.reduce((a, b) =>
            Math.abs(a.strike - spot) < Math.abs(b.strike - spot) ? a : b
        );

        let finalData = [...data];

        if (keepATM) {
            const mid = finalData.indexOf(atmStrike);
            finalData = finalData.slice(
                Math.max(0, mid - strikeCount),
                Math.min(finalData.length, mid + strikeCount + 1)
            );
        } else {
            finalData = finalData.slice(0, strikeCount * 2);
        }

        // Build 4 rows per strike
        const categories = [];
        const ceOI = [];
        const peOI = [];
        const ceChg = [];
        const peChg = [];

        finalData.forEach(row => {
            categories.push(`${row.strike} CE OI`);
            categories.push(`${row.strike} PE OI`);
            categories.push(`${row.strike} CE Chg`);
            categories.push(`${row.strike} PE Chg`);

            ceOI.push(row.ceOI);
            peOI.push(row.peOI);
            ceChg.push(row.ceChg);
            peChg.push(row.peChg);
        });

        const options = {
            series: [
                { name: "CE OI", data: ceOI },
                { name: "PE OI", data: peOI },
                { name: "CE Chg", data: ceChg },
                { name: "PE Chg", data: peChg }
            ],
            chart: {
                type: "bar",
                height: categories.length * 40,
                animations: { enabled: false }
            },
            colors: ["#ff3b30", "#34c759", "#ff9500", "#007aff"],
            plotOptions: {
                bar: { horizontal: true, barHeight: "70%" }
            },
            dataLabels: {
                enabled: true,
                style: { fontSize: "12px", colors: ["#fff"] }
            },
            xaxis: { categories },
            stroke: { show: true, width: 1, colors: ["#fff"] },
            tooltip: { shared: false },
            legend: { position: "top" }
        };

        if (chart) chart.updateOptions(options);
        else {
            chart = new ApexCharts(document.querySelector("#chart"), options);
            chart.render();
        }
    }

    waitForTable(() => {
        renderHistogram();
        setInterval(renderHistogram, 3000);
    });

})();
