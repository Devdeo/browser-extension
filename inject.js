(function () {
    "use strict";

    if (window.__OI_HISTOGRAM_INIT__) return;
    window.__OI_HISTOGRAM_INIT__ = true;

    let chart = null;

    function waitForTable(callback) {
        const check = setInterval(() => {
            if (document.querySelector(".opttbldata, table tbody")) {
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
            background: #ffffff;
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


    // ===================================================================
    // READ ALL STRIKES (not only 5)
    // ===================================================================
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





    // ===================================================================
    // FINAL FIXED VISUAL CHART (perfect width + spacing + all strikes)
    // ===================================================================
    function renderHistogram() {

        const data = getOptionData();
        if (!data.length) return;

        // Sort strikes (low → high)
        data.sort((a, b) => a.strike - b.strike);

        // 4 rows per strike → best visual separation
        const categories = [];
        const ceOI = [], peOI = [], ceChg = [], peChg = [];

        data.forEach(row => {
            categories.push(String(row.strike));   // strike label row
            categories.push("");                  // blank row
            categories.push("");
            categories.push("");

            ceOI.push(row.ceOI);
            peOI.push(row.peOI);
            ceChg.push(row.ceChg);
            peChg.push(row.peChg);
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
                height: categories.length * 38,   // spacing fixed
                stacked: false,
                animations: { enabled: false },
                toolbar: { show: false }
            },

            // ⭐ PERFECT BAR LOOK
            plotOptions: {
                bar: {
                    horizontal: true,
                    barHeight: "60%",   // wider bars
                    borderRadius: 4,
                    distributed: false
                }
            },

            // ⭐ HIGH-VISIBILITY COLORS (NO BLUR)
            colors: [
                "#ff3030",  // CE OI
                "#16c784",  // PE OI
                "#ffb300",  // CE Chg
                "#0066ff"   // PE Chg
            ],

            // ⭐ LABELS
            dataLabels: {
                enabled: true,
                formatter: val => (val ? val.toLocaleString() : ""),
                style: {
                    fontSize: "12px",
                    fontWeight: 700,
                    colors: ["#000"]
                },
                offsetX: 6
            },

            xaxis: {
                categories,
                labels: {
                    style: { fontSize: "14px", fontWeight: 700 }
                },
                decimalsInFloat: 0
            },

            yaxis: {
                labels: {
                    style: { fontSize: "15px", fontWeight: 700 }
                }
            },

            legend: {
                position: "top",
                fontSize: "14px",
                markers: {
                    width: 14,
                    height: 14,
                    radius: 4
                }
            },

            grid: {
                strokeDashArray: 4,
                borderColor: "#ccc"
            }
        };


        chart = new ApexCharts(document.querySelector("#oiChartContainer"), options);
        chart.render();
    }



    // auto refresh
    waitForTable(() => {
        renderHistogram();
        setInterval(renderHistogram, 3000);
    });

})();
