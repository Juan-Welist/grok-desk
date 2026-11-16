(function () {
  const body = document.body;
  const statusRow = document.getElementById("statusRow");
  const balanceEl = document.getElementById("balance");
  const paperBadge = document.getElementById("paperBadge");
  const todayPct = document.getElementById("todayPct");
  const multPill = document.getElementById("multPill");
  const liveFrame = document.getElementById("liveFrame");
  const liveImg = document.getElementById("liveImg");
  const chartEmpty = document.getElementById("chartEmpty");
  const chartError = document.getElementById("chartError");
  const emptyMsg = document.getElementById("emptyMsg");
  const avatarInitial = document.getElementById("avatarInitial");
  const bellDot = document.getElementById("bellDot");
  const rangesEl = document.getElementById("ranges");

  const odometer = new Odometer(balanceEl);
  const chart = new DeskChart(document.getElementById("chart"), document.getElementById("chartMarks"));

  let range = "LIVE";
  let latest = { status: "loading", state: null, chart: null, fetchedAt: null, retryIn: 0, screenUrl: null };
  let lastScreenSrc = "";

  function setTab(name) {
    body.dataset.tab = name;
    body.classList.remove("is-searching");
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-on", t.dataset.tab === name));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-on", v.dataset.view === name));
  }

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });
  document.getElementById("avatarBtn").addEventListener("click", () => setTab("account"));
  document.getElementById("bellBtn").addEventListener("click", () => setTab("activity"));

  const searchBtn = document.getElementById("searchBtn");
  const searchField = document.getElementById("searchField");
  const searchCancel = document.getElementById("searchCancel");
  searchBtn.addEventListener("click", () => {
    body.classList.add("is-searching");
    searchField.focus();
  });
  searchCancel.addEventListener("click", () => {
    body.classList.remove("is-searching");
    searchField.value = "";
  });
  searchField.addEventListener("keydown", (e) => {
    if (e.key === "Escape") searchCancel.click();
  });

  rangesEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-range]");
    if (!btn) return;
    range = btn.dataset.range;
    rangesEl.querySelectorAll("button").forEach((b) => b.classList.toggle("is-on", b === btn));
    renderChart(latest);
  });

  function formatTime(d) {
    if (!d) return "";
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Europe/Rome",
    });
  }

  function formatMult(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "";
    const digits = v >= 100 ? 2 : v >= 10 ? 2 : 2;
    return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + "×";
  }

  function formatPct(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "";
    const sign = v > 0 ? "+" : v < 0 ? "" : "";
    return sign + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
  }

  function hasChartPoints(chartData) {
    if (!chartData) return false;
    const payload = chartData[range] || chartData.LIVE || chartData;
    const pts = payload && payload.points;
    return Array.isArray(pts) && pts.length > 0;
  }

  function isEmptyHome(state, chartData) {
    const bal = state && state.balance;
    const hasBal = Number.isFinite(Number(bal));
    // Loaded but nothing to show yet — no invented number, no points.
    return !hasBal && !hasChartPoints(chartData);
  }

  function renderStatus(evt) {
    if (evt.status === "error") {
      let text;
      if (evt.missing && !evt.state) {
        text = "Open this app from your desk link";
      } else {
        const bits = ["Desk offline", "retrying in " + Math.max(0, evt.retryIn || 0) + "s"];
        const when = formatTime(evt.fetchedAt);
        if (when) bits.push("last update " + when);
        text = bits.join(" · ");
      }
      statusRow.textContent = text;
      statusRow.classList.add("is-on");
    } else {
      statusRow.textContent = "";
      statusRow.classList.remove("is-on");
    }
  }

  function renderHero(state, { animate }) {
    if (!state || !Number.isFinite(Number(state.balance))) {
      balanceEl.textContent = "";
      paperBadge.hidden = true;
      todayPct.textContent = "";
      todayPct.className = "today-pct";
      multPill.hidden = true;
      return;
    }
    odometer.set(Number(state.balance), { animate });
    const mode = String(state.mode || "").toUpperCase();
    paperBadge.hidden = mode !== "PAPER";

    const pct = Number(state.today_pct);
    todayPct.textContent = formatPct(pct);
    todayPct.classList.toggle("is-up", pct > 0);
    todayPct.classList.toggle("is-down", pct < 0);

    const mult = Number(state.multiplier);
    if (Number.isFinite(mult)) {
      multPill.textContent = formatMult(mult);
      multPill.hidden = false;
    } else {
      multPill.hidden = true;
    }

    const handle = state.handle || "";
    const initial = (handle.replace(/^@/, "").trim()[0] || "G").toUpperCase();
    avatarInitial.textContent = initial;
  }

  function renderChart(evt) {
    const data = evt.chart;
    const loaded = evt.status === "ok" || (evt.status === "error" && data);
    if (!loaded || !data) {
      chartEmpty.classList.remove("is-on");
      chartError.classList.toggle("is-on", evt.status === "error" && !data && evt.state);
      return;
    }
    const payload = data[range] || data.LIVE || { points: [], marks: [], start: null };
    const points = payload.points || [];
    const marks = payload.marks || [];
    if (!points.length) {
      chart.setData({ points: [], marks: [], start: payload.start }, { animate: false });
      chartEmpty.classList.add("is-on");
      chartError.classList.remove("is-on");
      return;
    }
    chartEmpty.classList.remove("is-on");
    chartError.classList.remove("is-on");
    chart.setData({ points, marks, start: payload.start }, { animate: evt.status === "ok" });
  }

  function renderLive(state, screenUrl) {
    liveFrame.classList.remove("is-paused", "is-live", "is-empty");
    const paused = !!(state && state.screen && state.screen.paused);
    if (paused) {
      liveImg.removeAttribute("src");
      lastScreenSrc = "";
      liveFrame.classList.add("is-paused");
      return;
    }
    if (screenUrl) {
      if (liveImg.src !== screenUrl && lastScreenSrc !== screenUrl) {
        lastScreenSrc = screenUrl;
        liveImg.onload = () => {
          liveFrame.classList.remove("is-empty", "is-paused");
          liveFrame.classList.add("is-live");
        };
        liveImg.onerror = () => {
          liveFrame.classList.remove("is-live", "is-paused");
          liveFrame.classList.add("is-empty");
        };
        liveImg.src = screenUrl;
      } else if (liveImg.currentSrc || liveImg.src) {
        liveFrame.classList.add("is-live");
      }
      return;
    }
    liveFrame.classList.add("is-empty");
  }

  function apply(evt, { animate } = {}) {
    latest = evt;
    renderStatus(evt);

    const state = evt.state;
    const chartData = evt.chart;
    const hasLast = !!(state || chartData);

    body.classList.remove("is-loading", "is-loaded", "is-empty");
    if (evt.status === "loading" && !hasLast) {
      body.classList.add("is-loading");
      return;
    }
    if (evt.status === "error" && !hasLast) {
      // First-load error: keep the loading blocks, plus the error row. No invented numbers.
      body.classList.add("is-loading");
      return;
    }
    if (isEmptyHome(state, chartData) && evt.status === "ok") {
      body.classList.add("is-empty");
      return;
    }

    body.classList.add("is-loaded");
    renderHero(state, { animate: animate !== false });
    renderChart(evt);
    renderLive(state, evt.screenUrl);

    const activityHint = Array.isArray(state && state.open_positions) && state.open_positions.length;
    // Dot if we have recent marks in any range, or positions.
    let hasMarks = false;
    if (chartData) {
      for (const key of Object.keys(chartData)) {
        if (chartData[key] && Array.isArray(chartData[key].marks) && chartData[key].marks.length) {
          hasMarks = true;
          break;
        }
      }
    }
    bellDot.classList.toggle("is-on", !!(hasMarks || activityHint));
    requestAnimationFrame(() => chart.resize());
  }

  DeskData.subscribe((evt) => {
    if (evt.type === "tick") {
      renderStatus(evt);
      return;
    }
    apply(evt, { animate: evt.status === "ok" });
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => { /* optional */ });
    });
  }

  DeskData.start();
})();
