(function () {

console.log("OI Histogram Final Version Loaded");

// -----------------------------------------------------
// GLOBAL VARIABLES
// -----------------------------------------------------
let lastSnapshot = {};
let lastSnapshotTime = 0;
let strikesToShow = 5;
let keepATM = true;
let renderTimeout = null;

// -----------------------------------------------------
// CREATE FLOATING HISTOGRAM PANEL
// -----------------------------------------------------
const box = document.createElement("div");
box.id = "oi-box";
box.innerHTML = `
  <div id="oi-header">
    <span>OI Histogram</span>
    <div>
      <button id="detachBtn" style="color:white;background:none;border:none;">Detach</button>
      <button id="closeBtn" style="color:white;background:none;border:none;">✕</button>
    </div>
  </div>

  <div style="display:flex;align-items:center;margin-top:6px;">
    <button id="minusBtn">−</button>
    <span id="strikeCount" style="margin:0 10px;">${strikesToShow}</span>
    <button id="plusBtn">+</button>

    <label style="margin-left:10px;">
      <input type="checkbox" id="atmCheck" checked /> ATM center
    </label>
  </div>

  <small style="opacity:0.8;">
    ATM centered • CE red • PE green • ΔCE orange • ΔPE blue
  </small>

  <div id="histContainer" style="margin-top:10px;"></div>
`;
document.body.appendChild(box);

// -----------------------------------------------------
// DRAGGABLE PANEL
// -----------------------------------------------------
(function dragElement(elmnt) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    document.getElementById("oi-header").onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDrag;
        document.onmousemove = dragMove;
    }

    function dragMove(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;

        elmnt.style.top = elmnt.offsetTop - pos2 + "px";
        elmnt.style.left = elmnt.offsetLeft - pos1 + "px";
    }

    function closeDrag() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
})(box);

// -----------------------------------------------------
// BUTTON EVENTS
// -----------------------------------------------------
document.getElementById("closeBtn").onclick = () => box.remove();

document.getElementById("minusBtn").onclick = () => {
    strikesToShow = Math.max(1, strikesToShow - 1);
    document.getElementById("strikeCount").innerText = strikesToShow;
    render();
};

document.getElementById("plusBtn").onclick = () => {
    strikesToShow += 1;
    document.getElementById("strikeCount").innerText = strikesToShow;
    render();
};

document.getElementById("atmCheck").onchange = (e) => {
    keepATM = e.target.checked;
    render();
};

// -----------------------------------------------------
// WAIT FOR TABLE TO FINISH LOADING
// -----------------------------------------------------
function waitForTableReady(cb) {
    let tries = 0;

    const timer = setInterval(() => {
        const rows = Array.from(document.querySelectorAll("table tbody tr"));
        const validRows = rows.filter(r => r.children.length >= 21);

        if (validRows.length > 5) {
            clearInterval(timer);
            cb();
        }

        tries++;
        if (tries > 50) clearInterval(timer); // stop after 10s
    }, 200);
}

// -----------------------------------------------------
// SAFE NUMBER PARSER
// -----------------------------------------------------
function num(cell) {
    if (!cell) return 0;
    return Number(cell.innerText.replace(/,/g, "")) || 0;
}

// -----------------------------------------------------
// PARSE NSE TABLE ROWS
// -----------------------------------------------------
function parseTable() {
    let rows = Array.from(document.querySelectorAll("table tbody tr"));
    if (!rows.length) return [];

    let parsed = [];

    rows.forEach(r => {
        const c = r.children;
        if (!c || c.length < 21) return;

        const strike = num(c[10]);
        if (!strike) return;

        parsed.push({
            ceOI:  num(c[0]),
            ceChg: num(c[1]),
            strike: strike,
            peChg: num(c[19]),
            peOI:  num(c[20])
        });
    });

    return parsed;
}

// -----------------------------------------------------
// FIND ATM STRIKE
// -----------------------------------------------------
function findATM(rows) {
    const el = document.querySelector(".underlying-value, .niftyFifty .highlight");
    if (!el) return rows[0].strike;

    let underlying = Number(el.innerText.replace(/,/g, "")) || 0;
    let closest = rows[0].strike;

    rows.forEach(r => {
        if (Math.abs(r.strike - underlying) < Math.abs(closest - underlying)) {
            closest = r.strike;
        }
    });

    return closest;
}

// -----------------------------------------------------
// 5-MIN PERCENTAGE CHANGE
// -----------------------------------------------------
function pct(newVal, oldVal) {
    if (!oldVal || oldVal === 0) return "";
    const diff = ((newVal - oldVal) / oldVal) * 100;
    const col = diff >= 0 ? "green" : "red";
    return ` <span style="color:${col};font-size:11px">${diff.toFixed(1)}%</span>`;
}

// -----------------------------------------------------
// RENDER HISTOGRAM
// -----------------------------------------------------
function render() {
    let data = parseTable();
    if (!data.length) return;

    // 5-min snapshot
    const now = Date.now();
    if (now - lastSnapshotTime > 5 * 60 * 1000) {
        lastSnapshot = {};
        data.forEach(d => lastSnapshot[d.strike] = d);
        lastSnapshotTime = now;
    }

    data.sort((a, b) => b.strike - a.strike);

    let atm = findATM(data);
    let centerIndex = data.findIndex(d => d.strike === atm);
    if (centerIndex === -1) centerIndex = Math.floor(data.length / 2);

    let start = keepATM ? Math.max(0, centerIndex - strikesToShow) : 0;
    let view = data.slice(start, start + strikesToShow * 2);

    let html = "";

    view.forEach(d => {
        const old = lastSnapshot[d.strike] || {};

        html += `
        <div class="hist-row">
          <div class="strike">${d.strike}</div>

          <div class="bar ce" style="width:${d.ceOI / 40}px"></div>
          <div class="val">${d.ceOI}${pct(d.ceOI, old.ceOI)}</div>

          <div class="bar pe" style="width:${d.peOI / 40}px"></div>
          <div class="val">${d.peOI}${pct(d.peOI, old.peOI)}</div>

          <div class="bar ce-chg" style="width:${Math.abs(d.ceChg) / 30}px"></div>
          <div class="val">${d.ceChg}${pct(d.ceChg, old.ceChg)}</div>

          <div class="bar pe-chg" style="width:${Math.abs(d.peChg) / 30}px"></div>
          <div class="val">${d.peChg}${pct(d.peChg, old.peChg)}</div>
        </div>`;
    });

    document.getElementById("histContainer").innerHTML = html;
}

// -----------------------------------------------------
// MUTATION OBSERVER WITH 300ms DEBOUNCE
// -----------------------------------------------------
const observer = new MutationObserver(() => {
    clearTimeout(renderTimeout);
    renderTimeout = setTimeout(render, 300);
});

observer.observe(document.body, { childList: true, subtree: true });

// -----------------------------------------------------
// INITIAL LOAD AFTER TABLE READY
// -----------------------------------------------------
waitForTableReady(render);

})();
