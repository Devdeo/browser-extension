(function () {
    "use strict";

    if (window.__OI_HISTOGRAM_INIT__) return;
    window.__OI_HISTOGRAM_INIT__ = true;

    let chart = null;

    function waitForTable(callback) {
        const check = setInterval(() => {
            if (document.querySelector("table tbody")) {
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

            <div id="chartWrapper"
                style="margin-top:10px;height:70vh;overflow-y:auto;overflow-x:hidden;
                border:1px solid #ddd;border-radius:10px;padding:4px;">
                <div id="oiChartContainer"></div>
            </div>
        `;

        document.body.appendChild(panel);
        document.getElementById("closeOI").onclick = () => panel.remove();
    }

    createPanel();

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

    // ======================================================
    // FINAL PERFECT BAR LOGIC
    // 1 STRIKE = 5 ROWS (1 label + 4 bars)
    // ======================================================
    function renderHistogram() {
        const data = getOptionData();
        if (!data.length) return;

        data.sort((a, b) => a.strike - b.strike);

        const categories = [];
        const ceOI = [], peOI = [], ceChg = [], peChg = [];

        data.forEach(row => {

            // Strike visible row (no bar)
            categories.push(`${row.strike}`);
            ceOI.push(null);
            peOI.push(null);
            ceChg.push(null);
            peChg.push(null);

            // CE OI
            categories.push("CE OI");
            ceOI.push(row.ceOI);
            peOI.push(null);
            ceChg.push(null);
            peChg.push(null);

            // PE OI
            categories.push("PE OI");
            ceOI.push(null);
            peOI.push(row.peOI);
            ceChg.push(null);
            peChg.push(null);

            // CE Change
            categories.push("CE Chg");
            ceOI.push(null);
            peOI.push(null);
            ceChg.push(row.ceChg);
            peChg.push(null);

            // PE Change
            categories.push("PE Chg");
            ceOI.push(null);
            peOI.push(null);
            ceChg.push(null);
            peChg.push(row.peChg);

            // Separator blank row for spacing
            categories.push("");
            ceOI.push(null);
            peOI.push(null);
            ceChg.push(null);
            peChg.push(null);
        });

        document.querySelector("#oiChartContainer").innerHTML = "";

        const options = {
            series: [
                { name: "CE OI", data: ceOI },
                { name: "PE OI", data: peOI },
                { name: "CE Chg", data: ceChg },
                { name: "PE Chg", data: peChg }
            ],

            chart: {
                type: "bar",
                height: categories.length * 28,
                stacked: false,
                animations: { enabled: false },
                toolbar: { show: false }
            },

            plotOptions: {
                bar: {
                    horizontal: true,
                    barHeight: "70%",
                    borderRadius: 3
                }
            },

            colors: [
                "#ff3030",
                "#16c784",
                "#ffb300",
                "#0066ff"
            ],

            dataLabels: {
                enabled: true,
                formatter: v => (v ? v.toLocaleString() : ""),
                style: { fontSize: "12px", fontWeight: 700, colors: ["#000"] },
                offsetX: 8
            },

            xaxis: {
                categories,
                labels: {
                    style: { fontSize: "13px", fontWeight: 700 }
                }
            },

            yaxis: {
                labels: {
                    style: { fontSize: "14px", fontWeight: 700 }
                }
            },

            grid: {
                strokeDashArray: 4,
                borderColor: "#ccc"
            },

            legend: {
                position: "top",
                fontSize: "14px"
            }
        };

        chart = new ApexCharts(document.querySelector("#oiChartContainer"), options);
        chart.render();
    }

    waitForTable(() => {
        renderHistogram();
        setInterval(renderHistogram, 3000);
    });

})();
