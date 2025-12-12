(function () {
    "use strict";

    if (window.__OI_HISTOGRAM_INIT__) return;
    window.__OI_HISTOGRAM_INIT__ = true;

    let chart = null;

    // Wait for NSE option chain table
    function waitForTable(callback) {
        const check = setInterval(() => {
            if (document.querySelector("table tbody")) {
                clearInterval(check);
                callback();
            }
        }, 400);
    }

    // Create floating panel
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

    // Extract table data (ALL STRIKES)
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

    // ============================
    // APPLY VERTICAL BAR OFFSETS
    // ============================
    function applyVerticalOffsets(chartCtx) {
        const offsets = [ -16, -4, 8, 20 ];  
        // CE OI, PE OI, CE Chg, PE Chg positions

        setTimeout(() => {
            const barGroups = chartCtx.el.querySelectorAll(".apexcharts-series");

            barGroups.forEach((series, i) => {
                const offset = offsets[i];
                series.querySelectorAll(".apexcharts-bar-area").forEach(bar => {
                    bar.setAttribute(
                        "transform",
                        `translate(0, ${offset})`
                    );
                });
            });
        }, 50);
    }

    // ============================
    // RENDER FINAL PERFECT CHART
    // ============================
    function renderHistogram() {
        const data = getOptionData();
        if (!data.length) return;

        // Sort strikes numerically (ascending)
        data.sort((a, b) => a.strike - b.strike);

        const strikes = data.map(x => x.strike);
        const ceOI = data.map(x => x.ceOI);
        const peOI = data.map(x => x.peOI);
        const ceChg = data.map(x => x.ceChg);
        const peChg = data.map(x => x.peChg);

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
                height: strikes.length * 55,
                stacked: false,
                animations: { enabled: false },
                toolbar: { show: false },

                events: {
                    mounted: applyVerticalOffsets,
                    updated: applyVerticalOffsets
                }
            },

            colors: [
                "#ff3030",  // CE OI red
                "#16c784",  // PE OI green
                "#ffb300",  // CE Chg yellow
                "#0066ff"   // PE Chg blue
            ],

            plotOptions: {
                bar: {
                    horizontal: true,
                    barHeight: "40%",  
                    borderRadius: 4
                }
            },

            dataLabels: {
                enabled: true,
                formatter: v => (v ? v.toLocaleString() : ""),
                style: { fontSize: "12px", fontWeight: "700", colors: ["#000"] },
                offsetX: 6
            },

            xaxis: {
                categories: strikes,
                labels: {
                    style: { fontSize: "14px", fontWeight: "700" }
                }
            },

            yaxis: {
                labels: {
                    style: { fontSize: "15px", fontWeight: "700" }
                }
            },

            grid: {
                strokeDashArray: 3,
                borderColor: "#ccc"
            },

            legend: {
                position: "top",
                fontSize: "14px",
                markers: { width: 14, height: 14, radius: 4 }
            }
        };

        chart = new ApexCharts(document.querySelector("#oiChartContainer"), options);
        chart.render();
    }

    // Auto refresh
    waitForTable(() => {
        renderHistogram();
        setInterval(renderHistogram, 3000);
    });

})();
