(function () {
    "use strict";

    if (window.__OI_HISTOGRAM_INIT__) return;
    window.__OI_HISTOGRAM_INIT__ = true;

    let strikeCount = 5;
    let keepATM = true;
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

        panel.innerHTML = `
            <div id="oiPanelHeader">
                <span>OI Histogram</span>
                <span id="closeOI" style="cursor:pointer;">✖</span>
            </div>

            <div id="oiControls">
                <button class="oi-btn" id="minusStrike">−</button>
                <span id="strikeCountTxt">${strikeCount}</span>
                <button class="oi-btn" id="plusStrike">+</button>

                <label style="margin-left:10px;">
                    <input type="checkbox" id="keepATMChk" checked>
                    ATM center
                </label>
            </div>

            <div id="chartWrapper">
                 <div id="oiChartContainer"></div>
            </div>
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

    function renderHistogram() {
        const data = getOptionData();
        if (!data.length) return;

        const spotText = document.querySelector("#underlyingValue, .underlying")?.innerText || "";
        const spot = parseFloat(spotText.replace(/[^\d.]/g, "")) || data[Math.floor(data.length / 2)].strike;

        const atmStrike = data.reduce((a, b) =>
            Math.abs(a.strike - spot) < Math.abs(b.strike - spot) ? a : b
        );

        let finalData = [...data];
        if (keepATM) {
            const mid = finalData.indexOf(atmStrike);
            finalData = finalData.slice(Math.max(0, mid - strikeCount), Math.min(finalData.length, mid + strikeCount + 1));
        } else {
            finalData = finalData.slice(0, strikeCount * 2);
        }

        const categories = [];
        const ceOI = [], peOI = [], ceChg = [], peChg = [];

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

        // Reset old chart before rendering new
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
                height: categories.length * 30,
                animations: { enabled: false },
                toolbar: { show: false }
            },
            colors: ["#ff3b30", "#34c759", "#ff9500", "#007aff"],
            plotOptions: {
                bar: { horizontal: true, barHeight: "60%" }
            },
            dataLabels: {
                enabled: true,
                style: { fontSize: "12px", colors: ["#fff"] }
            },
            xaxis: { categories },
            yaxis: { labels: { style: { fontSize: "12px" } } }
        };

        chart = new ApexCharts(document.querySelector("#oiChartContainer"), options);
        chart.render();
    }

    waitForTable(() => {
        renderHistogram();
        setInterval(renderHistogram, 3000);
    });

})();
