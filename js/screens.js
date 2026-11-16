(function (global) {
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function safeUrl(u) {
    if (!u) return null;
    try {
      const x = new URL(u, location.href);
      if (x.protocol === "http:" || x.protocol === "https:") return x.href;
    } catch (_) { /* ignore */ }
    return null;
  }

  function formatUsd(n, digits) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    const d = digits == null ? 2 : digits;
    const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
    return (v < 0 ? "-$" : "$") + abs;
  }

  function formatPrice(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    if (Math.abs(v) >= 1) return formatUsd(v, v >= 100 ? 2 : 4);
    if (Math.abs(v) >= 0.01) return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
    return "$" + v.toPrecision(4);
  }

  function formatCompact(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    const sign = v < 0 ? "-" : "";
    const a = Math.abs(v);
    const body = a >= 1e9 ? (a / 1e9).toFixed(a >= 1e10 ? 1 : 2) + "B"
      : a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + "M"
      : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 1 : 1) + "K"
      : a.toLocaleString("en-US", { maximumFractionDigits: 0 });
    return sign + "$" + body;
  }

  function formatInt(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    return Math.round(v).toLocaleString("en-US");
  }

  function actTone(row) {
    const v = String(row.value || "");
    const kind = row.kind || "";
    if (kind === "rejected" || v === "Skipped") return "is-skip";
    if (kind === "stopped" || v.startsWith("-$") || v.startsWith("-")) return "is-down";
    if (kind === "sold" && v.startsWith("+")) return "is-up";
    if (kind === "bought" || kind === "passed") return "";
    if (v.startsWith("+")) return "is-up";
    return "";
  }

  function activityRow(row, { fomo = true } = {}) {
    const url = safeUrl(row.url);
    const dest = row.dest || (row.kind === "rejected" ? "audit" : "coin");
    const mint = row.mint || "";
    const fomoLink = fomo && url
      ? `<a class="fomo-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open on FOMO</a>`
      : "";
    return `<button type="button" class="act-row" data-dest="${esc(dest)}" data-mint="${esc(mint)}">
      <div class="act-title">${esc(row.title || "")}</div>
      <div class="act-sub">${esc(row.subtitle || "")}${fomoLink ? " · " + fomoLink : ""}</div>
      <div class="act-val ${actTone(row)}">${esc(row.value || "")}</div>
    </button>`;
  }

  function checksHtml(checks) {
    if (!checks) return "";
    const keys = [
      ["screen", "S"],
      ["api", "A"],
      ["chain", "C"],
    ];
    return keys.map(([k, letter]) => {
      const v = checks[k];
      const cls = v === true ? "is-ok" : v === false ? "is-bad" : "";
      const label = k;
      return `<span class="chk ${cls}" title="${esc(label)}">${letter}</span>`;
    }).join("");
  }

  function scoreRing(score) {
    const v = Number(score);
    const known = Number.isFinite(v);
    const pct = known ? Math.max(0, Math.min(100, v)) : 0;
    const color = known && pct >= 70 ? "#00d35a" : known ? "#ffd60a" : "rgba(235,235,245,0.3)";
    const r = 22;
    const c = 2 * Math.PI * r;
    const dash = (pct / 100) * c;
    return `<div class="score-ring" aria-label="Score ${known ? Math.round(v) : "—"}">
      <svg viewBox="0 0 56 56">
        <circle cx="28" cy="28" r="${r}" fill="none" stroke="#2c2c2e" stroke-width="4"></circle>
        <circle cx="28" cy="28" r="${r}" fill="none" stroke="${color}" stroke-width="4"
          stroke-linecap="round" stroke-dasharray="${dash} ${c}"></circle>
      </svg>
      <div class="val">${known ? Math.round(v) : "—"}</div>
    </div>`;
  }

  function layerStrips(layers) {
    const items = (layers || []).slice(0, 8);
    while (items.length < 8) items.push({ pass: null });
    return `<div class="layer-grid">${items.map((ly) => {
      const cls = ly.pass === true ? "is-pass" : ly.pass === false ? "is-fail" : "";
      return `<div class="layer-strip ${cls}"><i></i></div>`;
    }).join("")}</div>`;
  }

  function miniCard(bot) {
    const color = bot.color || "#fff";
    const alive = bot.alive ? "is-on" : "";
    let body = "";
    if (bot.key === "scanner") {
      body = `<div class="feed">${(bot.feed || []).slice(0, 4).map((row) => {
        const kill = row.verdict !== "pass";
        return `<div class="feed-row ${kill ? "is-kill" : "is-pass"}">
          <span class="sym">${esc(row.symbol || row.label || "")}</span>
          <span class="why">${esc(row.detail || "")}</span>
        </div>`;
      }).join("")}</div>`;
    } else if (bot.key === "analyst") {
      body = `<div class="analyst-row">${scoreRing(bot.score)}${layerStrips(bot.layers)}</div>
        <div class="social-line">${esc((bot.social && bot.social.label) || "Social: off")}</div>`;
    } else if (bot.key === "brain") {
      body = `${bot.size_line ? `<div class="brain-size">${esc(bot.size_line)}</div>` : ""}
        <div class="brain-rule">${esc(bot.rule_full || "")}<br>${esc(bot.rule_half || "")}</div>`;
    } else if (bot.key === "executor") {
      const bar = bot.bar || {};
      const cls = bar.state === "bought" || bar.state === "done" ? "is-go" : bar.state === "waiting" || bar.state === "clicking" ? "is-wait" : "";
      body = `<div class="exec-bar ${cls}">${esc(bar.label || "Idle")}</div>`;
    } else if (bot.key === "risk") {
      body = `<div class="pills">${(bot.pills || []).map((p) =>
        `<span class="pill is-${esc(p.tone || "stop")}">${esc(p.label)}</span>`
      ).join("")}</div>`;
    }
    return `<article class="bot-card" data-bot="${esc(bot.key || "")}">
      <header><span class="status-dot ${alive}"></span>
        <span class="bot-name" style="color:${esc(color)}">${esc(bot.name || "")}</span></header>
      <div class="bot-head">${esc(bot.headline || "")}</div>
      ${body}
    </article>`;
  }

  function fullCard(bot) {
    const color = bot.color || "#fff";
    const hint = bot.pause_locked
      ? "Locked while a position is open"
      : "Needs Telegram (Step 11)";
    const decisions = (bot.decisions || []).map((row) => activityRow(row, { fomo: true })).join("");
    return `<article class="bot-full" id="bot-full-${esc(bot.key || "")}" data-bot="${esc(bot.key || "")}">
      <div class="top">
        <span class="status-dot ${bot.alive ? "is-on" : ""}"></span>
        <span class="bot-name" style="color:${esc(color)}">${esc(bot.name || "")}</span>
        <span class="count">${esc(bot.headline || "")}</span>
      </div>
      <div class="switch-row">
        <div class="switch ${bot.paused ? "" : "is-on"}" aria-disabled="true" title="${esc(hint)}"><i></i></div>
        <span class="switch-hint">${esc(hint)}</span>
        <button class="settings-shortcut" type="button" data-settings="${esc(bot.name || "")}">Settings</button>
      </div>
      <div class="decisions">${decisions || `<div class="empty-copy" style="padding:12px 0;text-align:left;font-size:14px">No decisions yet</div>`}</div>
    </article>`;
  }

  function renderBots(el, data, { loading }) {
    const loadingEl = document.querySelector(".bots-loading");
    if (loading && !data) {
      if (loadingEl) loadingEl.style.display = "block";
      el.innerHTML = "";
      return;
    }
    if (loadingEl) loadingEl.style.display = "none";
    const bots = (data && data.bots) || [];
    el.innerHTML = bots.map(fullCard).join("");
  }

  function renderCarousel(el, data) {
    const bots = (data && data.bots) || [];
    el.innerHTML = bots.map(miniCard).join("");
  }

  function renderActivity(listEl, emptyEl, data, { loading, tonightOnly }) {
    const loadingBox = document.querySelector(".activity-loading");
    if (loading && !data) {
      if (loadingBox) loadingBox.style.display = "block";
      if (listEl) listEl.innerHTML = "";
      if (emptyEl) emptyEl.hidden = true;
      return;
    }
    if (loadingBox) loadingBox.style.display = "none";
    const rows = tonightOnly
      ? ((data && data.tonight) || [])
      : ((data && data.rows) || []);
    if (!rows.length) {
      if (listEl) listEl.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    if (listEl) listEl.innerHTML = rows.map((r) => activityRow(r)).join("");
  }

  function renderAudit(body, emptyEl, data, { loading }) {
    const loadingBox = document.querySelector(".audit-loading");
    if (loading && !data) {
      if (loadingBox) loadingBox.style.display = "block";
      body.innerHTML = "";
      if (emptyEl) emptyEl.hidden = true;
      return;
    }
    if (loadingBox) loadingBox.style.display = "none";
    if (!data || !(data.layers || []).some((ly) => ly.pass !== null && ly.value != null)) {
      body.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    const layers = data.layers || [];
    const discs = layers.map((ly) => {
      const cls = ly.pass === true ? "is-pass" : ly.pass === false ? "is-fail" : "";
      const mark = ly.pass === true ? "✓" : ly.pass === false ? "!" : "";
      return `<div class="disc ${cls}" title="${esc(ly.label)}">${mark}</div>`;
    }).join("");
    const rows = layers.map((ly) => `<div class="layer-row">
      <span class="lab">${esc(ly.label)}</span>
      <span class="val">${esc(ly.value == null ? "—" : ly.value)}</span>
    </div>`).join("");
    const social = (data.social && data.social.label) || "Social: off";
    body.innerHTML = `<div class="discs">${discs}<span class="beam"></span></div>
      <div class="layer-rows">${rows}</div>
      <div class="social-card">${esc(social)}</div>`;
  }

  function renderCoin(body, emptyEl, data, { loading, mode, onSell }) {
    const loadingBox = document.querySelector(".coin-loading");
    if (loading && !data) {
      if (loadingBox) loadingBox.style.display = "block";
      body.innerHTML = "";
      if (emptyEl) emptyEl.hidden = true;
      return;
    }
    if (loadingBox) loadingBox.style.display = "none";
    if (!data) {
      body.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    const url = safeUrl(data.url);
    const shield = data.shield || { label: "0/8", passed: 0, total: 8 };
    const pos = data.position;
    let chg = "";
    if (pos && pos.entry_price != null && data.price != null) {
      const entry = Number(pos.entry_price);
      const px = Number(data.price);
      if (entry && Number.isFinite(px)) {
        const pct = ((px - entry) / entry) * 100;
        const arrow = pct >= 0 ? "▲" : "▼";
        const cls = pct >= 0 ? "is-up" : "is-down";
        chg = `<div class="coin-chg ${cls}">${arrow} ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% since entry</div>`;
      }
    }
    let posLine = "";
    if (pos && (pos.entry_usd != null || pos.size_usd != null)) {
      const usd = pos.entry_usd != null ? pos.entry_usd : pos.size_usd;
      posLine = `<div class="pos-line">Your position · ${esc(formatUsd(usd))} in · Executor</div>`;
    }
    const sub = [data.symbol || "X", data.chain || "Solana", data.age].filter(Boolean).join(" · ");
    body.innerHTML = `
      <div class="coin-title">
        <h2>${esc(data.name || data.symbol || "Coin")}</h2>
        <span class="shield ${shield.passed === shield.total ? "is-max" : ""}">${esc(shield.label)}</span>
      </div>
      <div class="coin-sub">${esc(sub)}</div>
      <div class="coin-px">${esc(formatPrice(data.price))}</div>
      ${chg}
      <div class="candle-wrap"><canvas id="candleChart"></canvas></div>
      <div class="stats">
        <div class="stat"><div class="k">Market cap</div><div class="v">${esc(formatCompact(data.market_cap))}</div></div>
        <div class="stat"><div class="k">Liquidity</div><div class="v">${esc(formatCompact(data.liquidity))}</div></div>
        <div class="stat"><div class="k">Holders</div><div class="v">${esc(formatInt(data.holders))}</div></div>
      </div>
      ${posLine}
      <div class="coin-actions">
        ${url ? `<a class="btn is-blue" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open on FOMO</a>` : `<span class="btn is-disabled">Open on FOMO</span>`}
        <button class="btn is-disabled" type="button" id="sellNowBtn" ${pos ? "" : "disabled"}>Sell now</button>
      </div>
      <p class="hint">Needs Telegram (Step 11)</p>`;
    const canvas = body.querySelector("#candleChart");
    if (canvas && global.DeskCandles) {
      const chart = new global.DeskCandles(canvas);
      chart.setData({ candles: data.candles || [], exit: data.exit });
      requestAnimationFrame(() => chart.resize());
    }
    const sell = body.querySelector("#sellNowBtn");
    if (sell && onSell) sell.addEventListener("click", onSell);
  }

  function formatSettingValue(item) {
    const v = item.value;
    const key = item.key || "";
    if (item.kind === "bool") return v ? "On" : "Off";
    if (item.kind === "time" || item.kind === "enum" || item.kind === "str") return String(v ?? "—");
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v ?? "—");
    const compact = Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(6)));
    if (/_pct$/.test(key) || key === "fee_pct") return compact + "%";
    if (key.endsWith("_usd") || key.indexOf("cash") !== -1) return formatUsd(n);
    if (key.endsWith("_s")) return compact + "s";
    if (key.endsWith("_min")) return compact + "m";
    if (key.endsWith("_h")) return compact + "h";
    if (key === "tp_x") return compact + "×";
    return String(n);
  }

  function renderAccount(el, { account, settings, state, loading }) {
    const loadingBox = document.querySelector(".account-loading");
    if (loading && !account && !settings) {
      if (loadingBox) loadingBox.style.display = "block";
      el.innerHTML = "";
      return;
    }
    if (loadingBox) loadingBox.style.display = "none";
    const mode = (account && account.mode) || (state && state.mode) || "";
    const cash = (account && account.cash != null) ? account.cash
      : (account && account.paper_cash != null) ? account.paper_cash
      : (state && state.cash);
    const profile = safeUrl(account && account.links && account.links.profile);
    const signup = safeUrl(account && account.links && account.links.signup);
    const groups = (settings && settings.groups) || [];
    const modePaper = String(mode).toUpperCase() === "PAPER";

    let groupsHtml = groups.map((g) => {
      const rows = (g.settings || []).map((item) => {
        const min = item.min;
        const max = item.max;
        const hasRange = item.kind === "int" || item.kind === "float";
        const val = Number(item.value);
        const slider = hasRange && min != null && max != null && Number.isFinite(val)
          ? `<input type="range" min="${esc(min)}" max="${esc(max)}" value="${esc(val)}" disabled>
             <div class="set-range">${esc(min)} – ${esc(max)}</div>`
          : "";
        return `<div class="set-row">
          <div class="lab"><span>${esc(item.label)}</span><b>${esc(formatSettingValue(item))}</b></div>
          ${slider}
        </div>`;
      }).join("");
      return `<div class="set-group" id="settings-${esc(g.bot)}">
        <h3 style="color:${esc(g.color)}">${esc(g.bot)}</h3>
        ${rows}
      </div>`;
    }).join("");

    el.innerHTML = `
      <div class="acct-block">
        <div class="acct-label">Mode</div>
        <div class="seg" aria-disabled="true">
          <button type="button" class="${modePaper ? "is-on" : ""}" disabled>PAPER</button>
          <button type="button" class="${!modePaper ? "is-on" : ""}" disabled>LIVE</button>
        </div>
        <p class="hint">Needs Telegram (Step 11)</p>
      </div>
      <div class="acct-block">
        <div class="acct-label">Cash</div>
        <input class="field" value="${esc(Number.isFinite(Number(cash)) ? formatUsd(cash) : "")}" disabled>
      </div>
      <div class="acct-block">
        ${profile ? `<a class="row-link" href="${esc(profile)}" target="_blank" rel="noopener noreferrer">Your FOMO profile <span class="chev">›</span></a>` : `<div class="acct-row">Your FOMO profile <span class="chev">›</span></div>`}
        <button class="row-link" type="button" id="inviteBtn" ${signup ? "" : "disabled"}>Invite a friend <span class="chev">›</span></button>
      </div>
      <div class="acct-block">
        <div class="acct-label">Copy picks</div>
        <div class="acct-row">Off <span class="chev">›</span></div>
        <p class="hint">Needs Telegram (Step 11)</p>
      </div>
      <div class="acct-block">
        <div class="acct-label">Pushes</div>
        <div class="acct-row">${esc((account && account.pushes && account.pushes.label) || "Telegram only (plan B)")}</div>
        <button class="row-link" type="button" disabled>Send test push <span class="chev">›</span></button>
        <button class="row-link" type="button" id="watchBtn">Watch in Grok Bot <span class="chev">›</span></button>
      </div>
      <div class="acct-block">
        <div class="acct-label">Settings</div>
        ${groupsHtml || `<div class="empty-copy" style="padding:16px 0">No settings yet</div>`}
        <p class="hint">Read-only until Telegram (Step 11)</p>
      </div>`;
    return { signup };
  }

  global.Screens = {
    esc, safeUrl, formatUsd, formatPrice, formatCompact, formatInt,
    activityRow, checksHtml, miniCard, fullCard,
    renderBots, renderCarousel, renderActivity, renderAudit, renderCoin, renderAccount,
  };
})(window);
