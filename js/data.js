/* Data layer: read #d= once, persist, strip the hash, poll R2 every 15s, no-store.
   Never write the data path into the DOM or console. */
(function (global) {
  const R2 = "https://pub-e27f8a8bc1d642dc92a5e9ba7c48ec53.r2.dev";
  const LS = "desk.d";
  const INTERVAL = 15;

  let dp = null;
  let lastGood = { state: null, chart: null, fetchedAt: null };
  let retryLeft = 0;
  let pollTimer = 0;
  let tickTimer = 0;
  let started = false;
  const listeners = new Set();

  function emit(evt) {
    listeners.forEach((fn) => {
      try { fn(evt); } catch (_) { /* keep the loop alive */ }
    });
  }

  function readPath() {
    const hash = location.hash || "";
    let found = null;
    if (hash.startsWith("#d=")) {
      found = decodeURIComponent(hash.slice(3).split("&")[0] || "").trim();
    } else {
      const m = /(?:^|[?#&])d=([^&]*)/.exec(hash);
      if (m) found = decodeURIComponent(m[1] || "").trim();
    }
    if (found) {
      try { localStorage.setItem(LS, found); } catch (_) { /* private mode */ }
      try {
        history.replaceState(null, "", location.pathname + location.search);
      } catch (_) { /* ignore */ }
    }
    try { dp = localStorage.getItem(LS) || found; } catch (_) { dp = found; }
    return dp;
  }

  function fileUrl(name) {
    return R2 + "/d/" + dp + "/" + name + "?t=" + Date.now();
  }

  function normalizeChart(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (raw.LIVE || raw["1H"]) return raw;
    if (Array.isArray(raw.points) || raw.range) {
      const one = {
        range: raw.range || "LIVE",
        points: raw.points || [],
        marks: raw.marks || [],
        start: raw.start,
      };
      return { LIVE: one, "1H": one, "4H": one, "1D": one, "1W": one, ALL: one };
    }
    return raw;
  }

  function clearTimers() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = 0; }
    if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
  }

  function schedule(seconds, fromError) {
    clearTimers();
    retryLeft = seconds;
    if (fromError) {
      tickTimer = setInterval(() => {
        retryLeft = Math.max(0, retryLeft - 1);
        emit({
          type: "tick",
          status: "error",
          retryIn: retryLeft,
          state: lastGood.state,
          chart: lastGood.chart,
          fetchedAt: lastGood.fetchedAt,
          missing: !dp,
        });
      }, 1000);
    }
    pollTimer = setTimeout(pull, seconds * 1000);
  }

  async function pull() {
    if (!dp) {
      emit({
        type: "update",
        status: "error",
        missing: true,
        retryIn: INTERVAL,
        state: lastGood.state,
        chart: lastGood.chart,
        fetchedAt: lastGood.fetchedAt,
      });
      schedule(INTERVAL, true);
      return;
    }
    try {
      const [stateRes, chartRes] = await Promise.all([
        fetch(fileUrl("state.json"), { cache: "no-store" }),
        fetch(fileUrl("chart.json"), { cache: "no-store" }),
      ]);
      if (!stateRes.ok || !chartRes.ok) throw new Error("offline");
      const state = await stateRes.json();
      const chart = normalizeChart(await chartRes.json());
      lastGood = { state, chart, fetchedAt: new Date() };
      emit({
        type: "update",
        status: "ok",
        state,
        chart,
        fetchedAt: lastGood.fetchedAt,
        screenUrl: fileUrl("screen.jpg"),
      });
      schedule(INTERVAL, false);
    } catch (_) {
      emit({
        type: "update",
        status: "error",
        retryIn: INTERVAL,
        state: lastGood.state,
        chart: lastGood.chart,
        fetchedAt: lastGood.fetchedAt,
        screenUrl: lastGood.state ? fileUrl("screen.jpg") : null,
      });
      schedule(INTERVAL, true);
    }
  }

  const api = {
    INTERVAL,
    start() {
      if (started) return;
      started = true;
      readPath();
      emit({
        type: "update",
        status: lastGood.state ? "ok" : "loading",
        state: lastGood.state,
        chart: lastGood.chart,
        fetchedAt: lastGood.fetchedAt,
        missing: !dp,
      });
      pull();
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    fileUrl(name) { return dp ? fileUrl(name) : null; },
    last() { return lastGood; },
  };

  global.DeskData = api;
})(window);
