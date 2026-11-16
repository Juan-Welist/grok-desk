/* Data layer: read #d= once, persist, strip the hash, poll R2 every 15s, no-store.
   Never write the data path into the DOM or console. */
(function (global) {
  const R2 = "https://pub-e27f8a8bc1d642dc92a5e9ba7c48ec53.r2.dev";
  const LS = "desk.d";
  const INTERVAL = 15;
  const REQUIRED = ["state.json", "chart.json"];
  const OPTIONAL = ["activity.json", "bots.json", "orders.json", "account.json", "settings.json", "coins.json"];

  let dp = null;
  let lastGood = {
    state: null, chart: null, activity: null, bots: null, orders: null,
    account: null, settings: null, coins: null, fetchedAt: null,
  };
  const mintCache = { coin: {}, audit: {} };
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

  function snapshot() {
    return {
      state: lastGood.state,
      chart: lastGood.chart,
      activity: lastGood.activity,
      bots: lastGood.bots,
      orders: lastGood.orders,
      account: lastGood.account,
      settings: lastGood.settings,
      coins: lastGood.coins,
      fetchedAt: lastGood.fetchedAt,
      screenUrl: dp && lastGood.state ? fileUrl("screen.jpg") : null,
    };
  }

  function schedule(seconds, fromError) {
    clearTimers();
    retryLeft = seconds;
    if (fromError) {
      tickTimer = setInterval(() => {
        retryLeft = Math.max(0, retryLeft - 1);
        emit({ type: "tick", status: "error", retryIn: retryLeft, missing: !dp, ...snapshot() });
      }, 1000);
    }
    pollTimer = setTimeout(pull, seconds * 1000);
  }

  async function getJson(name) {
    const res = await fetch(fileUrl(name), { cache: "no-store" });
    if (!res.ok) throw new Error("offline");
    return res.json();
  }

  async function pull() {
    if (!dp) {
      emit({ type: "update", status: "error", missing: true, retryIn: INTERVAL, ...snapshot() });
      schedule(INTERVAL, true);
      return;
    }
    try {
      const [state, chartRaw] = await Promise.all([getJson("state.json"), getJson("chart.json")]);
      const chart = normalizeChart(chartRaw);
      const extras = {};
      await Promise.all(OPTIONAL.map(async (name) => {
        try {
          extras[name.replace(/\.json$/, "")] = await getJson(name);
        } catch (_) { /* keep last good for this file */ }
      }));
      lastGood = {
        ...lastGood,
        state,
        chart,
        ...extras,
        fetchedAt: new Date(),
      };
      emit({ type: "update", status: "ok", ...snapshot() });
      schedule(INTERVAL, false);
    } catch (_) {
      emit({ type: "update", status: "error", retryIn: INTERVAL, ...snapshot() });
      schedule(INTERVAL, true);
    }
  }

  async function pullMint(kind, mint) {
    if (!dp || !mint || (kind !== "coin" && kind !== "audit")) {
      throw new Error("offline");
    }
    const data = await getJson(kind + "/" + mint + ".json");
    mintCache[kind][mint] = data;
    return data;
  }

  const api = {
    INTERVAL,
    start() {
      if (started) return;
      started = true;
      readPath();
      emit({ type: "update", status: lastGood.state ? "ok" : "loading", missing: !dp, ...snapshot() });
      pull();
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    fileUrl(name) { return dp ? fileUrl(name) : null; },
    last() { return lastGood; },
    cachedMint(kind, mint) { return (mintCache[kind] || {})[mint] || null; },
    pullMint,
    refresh: pull,
  };

  global.DeskData = api;
})(window);
