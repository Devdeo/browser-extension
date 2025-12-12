(function () {

console.log("OI Histogram Extension Loaded");

// -------------------------
// VARIABLES
// -------------------------
let lastSnapshot = {};
let lastSnapshotTime = 0;
let strikesToShow = 5;
let keepATM = true;

// -------------------------
// CREATE FLOATING PANEL
// -------------------------
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

  <div style="display:flex;align-items:center;margin-top:5px;">
    <button id="minusBtn">−</button>
    <span id="strikeCount" style="margin:0 10px;">${strikesToShow}</span>
    <button id="plusBtn">+</button>
    <label style="margin-left:10px;">
      <input type="checkbox" id="atmCheck" checked /> ATM center
    </label>
  </div>

  <small id="legendText">
    ATM centered • CE red • PE green • ΔCE orange • ΔPE blue
  </small>

  <div id="histContainer" style="margin-top:10px;"></div>
`;
document.body.appendChild(box);

// -------------------------
// DRAGGABLE PANEL
// -------------------------
(function dragElement(elmnt) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    document.getElementById("oi-header").onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e.preventDefault();
        pos3 = e.clientX; pos4 = e.clientY;
        document.onmouseup = closeDrag;
        document.onmousemove = drag;
    }

    function drag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
        pos3 = e.clientX; pos4 = e.clientY;

        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
    }

    function closeDrag() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
})(box);

// -------------------------
// BUTTON HANDLERS
// -------------------------
document.getElementById("minusBtn").onclick = () => {
    strikesToShow = Math.max(1, strikesToShow - 1);
    document.getElementById("strikeCount").innerText = strikesToShow;
    render();
};

document.getElementById("plusBtn").onclick = () => {
    strikesToShow = strikesToShow + 1;
    document.getElementById("strikeCount").innerText = strikesToShow;
    render();
};

document.getElementById("atmCheck").onchange = (e) => {
    keepATM = e.target.checked;
    render();
};

document.getElementById("closeBtn").onclick = () => box.remove();

// -------------------------
// PARSE TABLE
// -------------------------
function parseTable() {
    let rows = Array.from(document.querySelectorAll("table tbody tr"));
    if (!rows.length) return [];

    let parsed = [];

    rows.forEach(r => {
        let c = r.children;
        if (c.length < 21) return;

        parsed.push({
            ceOI:  num(c[0]),
            ceChg: num(c[1]),
            strike: num(c[10]),
            peChg: num(c[19]),
            peOI:  num(c[20])
        });
    });

    return parsed.filter(x => x.strike > 0);
}

function num(cell) {
    if (!cell) return 0;
    return Number(cell.innerText.replace(/,/g,"")) || 0;
}

// -------------------------
// ATM STRIKE
// -------------------------
function findATM(strikes) {
    let underlyingSpan = document.querySelector(".underlying-value,.underlying-index,.niftyFifty .val span.highlight");
    if (!underlyingSpan) return strikes[0].strike;

    let underlying = Number(underlyingSpan.innerText.replace(/,/g,""));
    let closest = strikes[0].strike;

    strikes.forEach(s => {
        if (Math.abs(s.strike - underlying) < Math.abs(closest - underlying))
            closest = s.strike;
    });

    return closest;
}

// -------------------------
// 5-MIN % CHANGE
// -------------------------
function pct(newVal, oldVal) {
    if (!oldVal || oldVal === 0) return "";
    let diff = ((newVal - oldVal) / oldVal) * 100;
    let color = diff >= 0 ? "green" : "red";
    return ` <span style="color:${color};font-size:11px">${diff.toFixed(1)}%</span>`;
}

// -------------------------
// RENDER HISTOGRAM
// -------------------------
function render() {
    let data = parseTable();
    if (!data.length) return;

    let atm = findATM(data);

    // 5-min snapshot
    const now = Date.now();
    if (now - lastSnapshotTime > 5 * 60 * 1000) {
        lastSnapshot = {};
        data.forEach(d => lastSnapshot[d.strike] = d);
        lastSnapshotTime = now;
    }

    // Sort strikes
    data.sort((a,b) => b.strike - a.strike);

    let centerIndex = data.findIndex(s => s.strike === atm);
    if (centerIndex === -1) centerIndex = Math.floor(data.length / 2);

    let start = keepATM ? Math.max(0, centerIndex - strikesToShow + 1) : 0;
    let end = start + strikesToShow * 2;
    let view = data.slice(start, end);

    let html = "";

    view.forEach(d => {
        let old = lastSnapshot[d.strike] || {};

        html += `
        <div class="hist-row">
          <div class="strike">${d.strike}</div>

          <div class="bar ce" style="width:${d.ceOI/40}px;"></div>
          <div class="val">${d.ceOI}${pct(d.ceOI, old.ceOI)}</div>

          <div class="bar pe" style="width:${d.peOI/40}px;"></div>
          <div class="val">${d.peOI}${pct(d.peOI, old.peOI)}</div>

          <div class="bar ce-chg" style="width:${Math.abs(d.ceChg)/30}px;"></div>
          <div class="val">${d.ceChg}${pct(d.ceChg, old.ceChg)}</div>

          <div class="bar pe-chg" style="width:${Math.abs(d.peChg)/30}px;"></div>
          <div class="val">${d.peChg}${pct(d.peChg, old.peChg)}</div>
        </div>`;
    });

    document.getElementById("histContainer").innerHTML = html;
}

// -------------------------
// AUTO REFRESH USING MUTATION OBSERVER
// -------------------------
const observer = new MutationObserver(() => {
    try { render(); } catch(e){}
});
observer.observe(document.body, { childList: true, subtree: true });

// First render
setInterval(render, 1500);
render();

})();
