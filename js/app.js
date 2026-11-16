(function () {
  const body = document.body;
  const statusRow = document.getElementById("statusRow");
  const balanceEl = document.getElementById("balance");
  const paperBadge = document.getElementById("paperBadge");
  const todayPct = document.getElementById("todayPct");
  const multPill = document.getElementById("multPill");
  const liveFrame = document.getElementById("liveFrame");
  const liveImgA = document.getElementById("liveImgA");
  const liveImgB = document.getElementById("liveImgB");
  const chartEmpty = document.getElementById("chartEmpty");
  const chartError = document.getElementById("chartError");
  const avatarInitial = document.getElementById("avatarInitial");
  const bellDot = document.getElementById("bellDot");
  const rangesEl = document.getElementById("ranges");
  const toastEl = document.getElementById("toast");

  const odometer = new Odometer(balanceEl);
  const chart = new DeskChart(document.getElementById("chart"), document.getElementById("chartMarks"));

  let range = "LIVE";
  let latest = { status: "loading" };
  let route = { tab: "home", mint: null };
  let liveFront = liveImgA;
  let liveBack = liveImgB;
  let lastScreenSrc = "";
  let ageTimer = 0;
  let toastTimer = 0;

  function setTab(name, mint, { hash = true } = {}) {
    route = { tab: name, mint: mint || null };
    body.dataset.tab = name;
    body.classList.remove("is-searching");
    document.getElementById("searchField").value = "";
    document.getElementById("searchResults").innerHTML = "";
    document.querySelectorAll(".tab").forEach((t) => {
      const tab = t.dataset.tab;
      t.classList.toggle("is-on", tab === name || (name === "audit" || name === "coin" ? false : false) && tab === name);
    });
    // Highlight parent tab for pushed screens
    const parent = name === "audit" || name === "coin" ? "activity" : name;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-on", t.dataset.tab === parent && (name === "home" || name === "bots" || name === "activity" || name === "account" ? name === t.dataset.tab : t.dataset.tab === "activity")));
    if (name === "home" || name === "bots" || name === "activity" || name === "account") {
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-on", t.dataset.tab === name));
    }
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-on", v.dataset.view === name));
    if (hash) {
      let h = "";
      if (name === "coin" && mint) h = "#/coin/" + mint;
      else if (name === "audit" && mint) h = "#/audit/" + mint;
      else if (name !== "home") h = "#/" + name;
      try { history.replaceState(null, "", location.pathname + location.search + h); } catch (_) { /* ignore */ }
    }
    renderCurrent();
  }

  function parseHashRoute() {
    const h = location.hash || "";
    if (h.startsWith("#d=")) return;
    const m = /^#\/(coin|audit)\/([^/?#]+)/.exec(h);
    if (m) return setTab(m[1], decodeURIComponent(m[2]), { hash: false });
    const t = /^#\/(home|bots|activity|account)$/.exec(h);
    if (t) return setTab(t[1], null, { hash: false });
  }

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });
  document.getElementById("avatarBtn").addEventListener("click", () => setTab("account"));
  document.getElementById("bellBtn").addEventListener("click", () => setTab("activity"));
  document.getElementById("activitySeeAll").addEventListener("click", () => setTab("activity"));
  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => setTab("activity"));
  });

  const searchBtn = document.getElementById("searchBtn");
  const searchField = document.getElementById("searchField");
  const searchCancel = document.getElementById("searchCancel");
  const searchResults = document.getElementById("searchResults");
  searchBtn.addEventListener("click", () => {
    body.classList.add("is-searching");
    searchField.focus();
  });
  searchCancel.addEventListener("click", () => {
    body.classList.remove("is-searching");
    searchField.value = "";
    searchResults.innerHTML = "";
  });
  searchField.addEventListener("keydown", (e) => {
    if (e.key === "Escape") searchCancel.click();
  });
  searchField.addEventListener("input", () => renderSearch(searchField.value));

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
    return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "×";
  }

  function formatPct(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "";
    const sign = v > 0 ? "+" : "";
    return sign + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
  }

  function hasChartPoints(chartData) {
    if (!chartData) return false;
    const payload = chartData[range] || chartData.LIVE || chartData;
    const pts = payload && payload.points;
    return Array.isArray(pts) && pts.length > 0;
  }

  function isEmptyHome(state, chartData) {
    const hasBal = state && Number.isFinite(Number(state.balance));
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
    avatarInitial.textContent = (handle.replace(/^@/, "").trim()[0] || "G").toUpperCase();
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

  function ageInfo(ts) {
    if (!ts) return { live: false, text: "Last frame" };
    const t = Date.parse(ts);
    if (!Number.isFinite(t)) return { live: false, text: "Last frame" };
    const s = (Date.now() - t) / 1000;
    if (s < 5) return { live: true, text: "Live · Bot's computer" };
    return { live: false, text: "Last frame " + formatTime(new Date(t)) };
  }

  function tickAge(state) {
    const info = ageInfo(state && state.screen && state.screen.ts);
    const dot = document.getElementById("liveDot");
    const text = document.getElementById("liveAgeText");
    if (dot) dot.classList.toggle("is-live", info.live);
    if (text) text.textContent = info.text;
  }

  function renderLane(state) {
    const lane = (state && state.lane) || {};
    const el = document.getElementById("liveLane");
    const colorMap = { Scanner: "#64d2ff", Analyst: "#ffd60a", Brain: "#bf5af2", Executor: "#00d35a", Risk: "#ff6b9a" };
    const label = lane.label || "Idle";
    el.textContent = label;
    el.style.color = (label !== "Idle" && colorMap[lane.bot]) ? colorMap[lane.bot] : "#fff";
  }

  function renderLastOrder(state) {
    const row = document.getElementById("liveOrder");
    const label = document.getElementById("liveOrderLabel");
    const checks = document.getElementById("liveChecks");
    const order = state && state.last_order;
    if (!order) {
      row.classList.remove("is-on");
      return;
    }
    label.textContent = order.label || "";
    checks.innerHTML = Screens.checksHtml(order.checks);
    row.classList.add("is-on");
  }

  function swapLive(url) {
    if (!url || url === lastScreenSrc) return;
    const img = liveBack;
    img.onload = () => {
      img.classList.add("is-on");
      liveFront.classList.remove("is-on");
      const tmp = liveFront;
      liveFront = liveBack;
      liveBack = tmp;
      liveFrame.classList.remove("is-empty", "is-paused");
      liveFrame.classList.add("is-live");
      document.getElementById("liveFullImg").src = img.src;
    };
    img.onerror = () => {
      if (!liveFront.classList.contains("is-on")) {
        liveFrame.classList.remove("is-live", "is-paused");
        liveFrame.classList.add("is-empty");
      }
    };
    lastScreenSrc = url;
    img.src = url;
  }

  function renderLive(state, screenUrl) {
    renderLane(state);
    renderLastOrder(state);
    tickAge(state);
    liveFrame.classList.remove("is-paused", "is-live", "is-empty");
    const paused = !!(state && state.screen && state.screen.paused);
    if (paused) {
      lastScreenSrc = "";
      liveImgA.classList.remove("is-on");
      liveImgB.classList.remove("is-on");
      liveImgA.removeAttribute("src");
      liveImgB.removeAttribute("src");
      liveFrame.classList.add("is-paused");
      return;
    }
    if (screenUrl) {
      swapLive(screenUrl);
      if (liveFront.classList.contains("is-on") || liveFront.src) {
        liveFrame.classList.add("is-live");
      }
      return;
    }
    liveFrame.classList.add("is-empty");
  }

  function openLiveFull() {
    const src = liveFront.getAttribute("src") || liveBack.getAttribute("src");
    if (!src || liveFrame.classList.contains("is-paused")) return;
    const full = document.getElementById("liveFull");
    const img = document.getElementById("liveFullImg");
    img.src = src;
    img.style.transform = "translate(0px, 0px) scale(1)";
    const screen = latest.state && latest.state.screen;
    const fomo = document.getElementById("liveFullFomo");
    const url = Screens.safeUrl(screen && screen.url);
    if (url) {
      fomo.href = url;
      fomo.hidden = false;
    } else {
      fomo.hidden = true;
    }
    full.classList.add("is-on");
    body.classList.add("is-full");
  }

  function closeLiveFull() {
    document.getElementById("liveFull").classList.remove("is-on");
    body.classList.remove("is-full");
  }

  liveFrame.addEventListener("click", openLiveFull);
  document.getElementById("liveFullClose").addEventListener("click", closeLiveFull);

  (function pinch() {
    const img = document.getElementById("liveFullImg");
    let scale = 1, tx = 0, ty = 0, start = null;
    function apply() {
      img.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
    }
    function dist(a, b) {
      const dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
      return Math.hypot(dx, dy);
    }
    img.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        start = { d: dist(e.touches[0], e.touches[1]), scale, tx, ty };
      } else if (e.touches.length === 1 && scale > 1) {
        start = { x: e.touches[0].clientX - tx, y: e.touches[0].clientY - ty, pan: true, scale };
      }
    }, { passive: true });
    img.addEventListener("touchmove", (e) => {
      if (!start) return;
      if (e.touches.length === 2 && start.d) {
        scale = Math.max(1, Math.min(6, start.scale * (dist(e.touches[0], e.touches[1]) / start.d)));
        if (scale === 1) { tx = 0; ty = 0; }
        apply();
      } else if (start.pan && e.touches.length === 1) {
        tx = e.touches[0].clientX - start.x;
        ty = e.touches[0].clientY - start.y;
        apply();
      }
    }, { passive: true });
    img.addEventListener("touchend", () => { start = null; if (scale <= 1) { scale = 1; tx = 0; ty = 0; apply(); } }, { passive: true });
  })();

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-on"), 1800);
  }

  function renderSearch(q) {
    const query = (q || "").trim().toLowerCase();
    if (!query) { searchResults.innerHTML = ""; return; }
    const coins = ((latest.coins && latest.coins.coins) || []);
    const hits = coins.filter((c) => {
      const blob = ((c.name || "") + " " + (c.symbol || "") + " " + (c.mint || "")).toLowerCase();
      return blob.indexOf(query) !== -1;
    }).slice(0, 12);
    if (!hits.length) {
      searchResults.innerHTML = `<div class="search-empty">No coins match</div>`;
      return;
    }
    searchResults.innerHTML = hits.map((c) => {
      const label = c.symbol || c.name || (c.mint || "").slice(0, 6);
      const name = c.name && c.symbol && c.name !== c.symbol ? c.name : (c.mint || "").slice(0, 8) + "…";
      const dest = c.has_audit && !c.has_position ? "coin" : "coin";
      return `<button type="button" class="search-hit" data-dest="${dest}" data-mint="${Screens.esc(c.mint)}">
        <span class="sym">${Screens.esc(label)}</span>
        <span class="meta">${Screens.esc(name)}</span>
      </button>`;
    }).join("");
  }

  function onOpenRow(e) {
    const hit = e.target.closest("[data-dest][data-mint]");
    if (!hit) return;
    if (e.target.closest("a")) return;
    const dest = hit.getAttribute("data-dest");
    const mint = hit.getAttribute("data-mint");
    if ((dest === "coin" || dest === "audit") && mint) {
      e.preventDefault();
      setTab(dest, mint);
    }
  }
  document.getElementById("app").addEventListener("click", onOpenRow);

  document.getElementById("sellSheet").addEventListener("click", (e) => {
    if (e.target.id === "sellSheet") e.currentTarget.classList.remove("is-on");
  });
  document.getElementById("sellSizes").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-pct]");
    if (!btn) return;
    document.querySelectorAll("#sellSizes button").forEach((b) => b.classList.toggle("is-on", b === btn));
  });

  function openSell() {
    const sheet = document.getElementById("sellSheet");
    sheet.hidden = false;
    sheet.classList.add("is-on");
  }

  function renderHomeExtras(evt) {
    const running = (evt.bots && evt.bots.running != null)
      ? evt.bots.running
      : (evt.state && evt.state.bots_running) || 0;
    document.getElementById("botsRunningLabel").textContent = running + " running";
    Screens.renderCarousel(document.getElementById("botCarousel"), evt.bots);
    const preview = (evt.activity && (evt.activity.preview || evt.activity.rows || [])).slice(0, 5);
    document.getElementById("activityPreview").innerHTML = preview.map((r) => Screens.activityRow(r)).join("");
  }

  async function renderMintView() {
    const { tab, mint } = route;
    if ((tab !== "coin" && tab !== "audit") || !mint) return;
    const title = tab === "audit" ? document.getElementById("auditTitle") : document.getElementById("coinHead");
    const cached = DeskData.cachedMint(tab, mint);
    if (tab === "audit") {
      document.getElementById("auditPaper") && (document.getElementById("auditPaper").hidden = true);
      Screens.renderAudit(document.getElementById("auditBody"), document.getElementById("auditEmpty"), cached, { loading: !cached });
    } else {
      const mode = latest.state && latest.state.mode;
      document.getElementById("coinPaper").hidden = String(mode || "").toUpperCase() !== "PAPER";
      Screens.renderCoin(document.getElementById("coinBody"), document.getElementById("coinEmpty"), cached, { loading: !cached, mode, onSell: openSell });
    }
    try {
      const data = await DeskData.pullMint(tab, mint);
      if (route.tab !== tab || route.mint !== mint) return;
      if (title) title.textContent = data.name || data.symbol || (tab === "audit" ? "Audit" : "Coin");
      if (tab === "audit") {
        const a = document.getElementById("auditFomo");
        const url = Screens.safeUrl(data.url);
        if (url) { a.href = url; a.style.display = ""; }
        else a.style.display = "none";
        Screens.renderAudit(document.getElementById("auditBody"), document.getElementById("auditEmpty"), data, { loading: false });
      } else {
        Screens.renderCoin(document.getElementById("coinBody"), document.getElementById("coinEmpty"), data, {
          loading: false,
          mode: latest.state && latest.state.mode,
          onSell: openSell,
        });
      }
    } catch (_) {
      if (!cached) {
        if (tab === "audit") Screens.renderAudit(document.getElementById("auditBody"), document.getElementById("auditEmpty"), null, { loading: false });
        else Screens.renderCoin(document.getElementById("coinBody"), document.getElementById("coinEmpty"), null, { loading: false });
      }
    }
  }

  function renderCurrent() {
    const evt = latest;
    const loading = evt.status === "loading" || (evt.status === "error" && !evt.state);
    if (route.tab === "bots") {
      Screens.renderBots(document.getElementById("botsStack"), evt.bots, { loading: loading && !evt.bots });
    }
    if (route.tab === "activity") {
      Screens.renderActivity(
        document.getElementById("activityList"),
        document.getElementById("activityEmpty"),
        evt.activity,
        { loading: loading && !evt.activity, tonightOnly: true }
      );
    }
    if (route.tab === "account") {
      const ret = Screens.renderAccount(document.getElementById("accountBody"), {
        account: evt.account, settings: evt.settings, state: evt.state, loading: loading && !evt.account && !evt.settings,
      });
      const invite = document.getElementById("inviteBtn");
      if (invite) {
        invite.addEventListener("click", async () => {
          const url = ret && ret.signup;
          if (!url) return;
          try {
            if (navigator.share) await navigator.share({ title: "FOMO", url });
            else {
              await navigator.clipboard.writeText(url);
              toast("Link copied");
            }
          } catch (err) {
            if (err && err.name === "AbortError") return;
            try {
              await navigator.clipboard.writeText(url);
              toast("Link copied");
            } catch (_) { /* ignore */ }
          }
        });
      }
      const watch = document.getElementById("watchBtn");
      if (watch) watch.addEventListener("click", () => { setTab("home"); openLiveFull(); });
      if (route._settings) {
        const el = document.getElementById("settings-" + route._settings);
        if (el) el.scrollIntoView({ block: "start" });
        route._settings = null;
      }
    }
    if (route.tab === "coin" || route.tab === "audit") renderMintView();
  }

  document.getElementById("botsStack").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-settings]");
    if (!btn) return;
    route._settings = btn.getAttribute("data-settings");
    setTab("account");
  });

  function apply(evt, { animate } = {}) {
    latest = evt;
    renderStatus(evt);
    const state = evt.state;
    const chartData = evt.chart;
    const hasLast = !!(state || chartData);

    body.classList.remove("is-loading", "is-loaded", "is-empty");
    if (evt.status === "loading" && !hasLast) {
      body.classList.add("is-loading");
      renderCurrent();
      return;
    }
    if (evt.status === "error" && !hasLast) {
      body.classList.add("is-loading");
      renderCurrent();
      return;
    }
    if (isEmptyHome(state, chartData) && evt.status === "ok") {
      body.classList.add("is-empty");
      renderCurrent();
      return;
    }

    body.classList.add("is-loaded");
    renderHero(state, { animate: animate !== false });
    renderChart(evt);
    renderLive(state, evt.screenUrl);
    renderHomeExtras(evt);
    const marks = evt.activity && ((evt.activity.tonight || evt.activity.rows || []).length);
    bellDot.classList.toggle("is-on", !!marks);
    renderCurrent();
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

  parseHashRoute();
  DeskData.start();
  ageTimer = setInterval(() => tickAge(latest.state), 1000);
})();
