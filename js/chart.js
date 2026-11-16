(function (global) {
  const GREEN = "#00d35a";
  const TONE_CLASS = {
    buy: "is-buy",
    profit: "is-profit",
    loss: "is-loss",
    stop: "is-stop",
    sell: "is-sell",
  };

  function reduced() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function parseTs(ts) {
    if (ts == null) return NaN;
    if (typeof ts === "number") return ts;
    const t = Date.parse(ts);
    return Number.isFinite(t) ? t : NaN;
  }

  function layoutMarks(marks, xOf, yOf, plot, rowH) {
    // Later marks move up a row when they would overlap.
    const placed = [];
    const boxed = [];
    for (const mark of marks) {
      const x = xOf(parseTs(mark.ts));
      const yLine = yOf(Number(mark.valueAt) || 0);
      if (!Number.isFinite(x)) continue;
      let row = 0;
      let w = Math.max(48, String(mark.label || "").length * 6.4 + 12);
      let left, top, tries = 0;
      do {
        const mid = x;
        left = mid - w / 2;
        top = yLine - 20 - row * rowH;
        // keep inside the plot horizontally a little
        if (left < plot.left) left = plot.left;
        if (left + w > plot.right) left = plot.right - w;
        const box = { left, right: left + w, top, bottom: top + 18 };
        const hit = boxed.some((b) => !(box.right < b.left || box.left > b.right || box.bottom < b.top || box.top > b.bottom));
        if (!hit) {
          boxed.push(box);
          placed.push({ mark, x: left + w / 2, y: top + 18, left, top });
          break;
        }
        row += 1;
        tries += 1;
      } while (tries < 6);
    }
    return placed;
  }

  class DeskChart {
    constructor(canvas, marksEl) {
      this.canvas = canvas;
      this.marksEl = marksEl;
      this.ctx = canvas.getContext("2d");
      this.points = [];
      this.marks = [];
      this.start = null;
      this._anim = null;
      this._from = null;
      this._to = null;
      this._raf = 0;
      this.resize();
      window.addEventListener("resize", () => this.resize());
    }

    resize() {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.cssW = rect.width;
      this.cssH = rect.height;
      this.draw(1);
    }

    setData({ points, marks, start }, { animate = true } = {}) {
      const next = (points || []).map((p) => ({
        t: parseTs(p.ts),
        v: Number(p.value),
      })).filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
      const prev = this.points;
      this.marks = marks || [];
      this.start = start == null || start === "" ? (next[0] ? next[0].v : null) : Number(start);

      const shouldAnim =
        animate &&
        !reduced() &&
        prev.length &&
        next.length &&
        next.length >= prev.length &&
        next[next.length - 1].t !== prev[prev.length - 1].t;

      if (shouldAnim) {
        this._from = prev;
        this._to = next;
        this._anim = { t0: performance.now(), dur: 250 };
        this._tick();
      } else {
        this.points = next;
        this._anim = null;
        this.draw(1);
      }
    }

    _tick() {
      if (this._raf) cancelAnimationFrame(this._raf);
      const step = (now) => {
        if (!this._anim) return;
        const p = Math.min(1, (now - this._anim.t0) / this._anim.dur);
        const ease = 1 - Math.pow(1 - p, 3);
        this.draw(ease);
        if (p < 1) this._raf = requestAnimationFrame(step);
        else {
          this.points = this._to;
          this._anim = null;
          this.draw(1);
        }
      };
      this._raf = requestAnimationFrame(step);
    }

    _currentPoints(progress) {
      if (!this._anim) return this.points;
      const from = this._from;
      const to = this._to;
      if (!to.length) return [];
      if (progress >= 1) return to;
      const last = to[to.length - 1];
      const prevLast = from[from.length - 1] || to[to.length - 2] || last;
      const mixed = {
        t: prevLast.t + (last.t - prevLast.t) * progress,
        v: prevLast.v + (last.v - prevLast.v) * progress,
      };
      return to.slice(0, -1).concat(mixed);
    }

    draw(progress) {
      const ctx = this.ctx;
      const w = this.cssW || this.canvas.getBoundingClientRect().width;
      const h = this.cssH || this.canvas.getBoundingClientRect().height;
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);

      const pts = this._currentPoints(progress == null ? 1 : progress);
      if (pts.length < 1) {
        this._renderMarks([], { left: 16, right: w - 16, top: 36, bottom: h - 16, width: w });
        return;
      }

      const padL = 16;
      const padR = 16;
      const padT = 36;
      const padB = 18;
      const plot = { left: padL, right: w - padR, top: padT, bottom: h - padB, width: w, height: h };

      let minV = Math.min(...pts.map((p) => p.v));
      let maxV = Math.max(...pts.map((p) => p.v));
      if (Number.isFinite(this.start)) {
        minV = Math.min(minV, this.start);
        maxV = Math.max(maxV, this.start);
      }
      if (minV === maxV) {
        minV -= 1;
        maxV += 1;
      }
      const minT = pts[0].t;
      const maxT = pts[pts.length - 1].t === pts[0].t ? pts[0].t + 1 : pts[pts.length - 1].t;

      const xOf = (t) => plot.left + ((t - minT) / (maxT - minT)) * (plot.right - plot.left);
      const yOf = (v) => plot.bottom - ((v - minV) / (maxV - minV)) * (plot.bottom - plot.top);

      // Dashed start line
      if (Number.isFinite(this.start)) {
        const y = yOf(this.start);
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = "rgba(235, 235, 245, 0.3)";
        ctx.lineWidth = 1;
        ctx.moveTo(plot.left, y);
        ctx.lineTo(plot.right, y);
        ctx.stroke();
        ctx.restore();
      }

      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = xOf(p.t);
        const y = yOf(p.v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      // Fill under the line (chart only — not a card gradient)
      const last = pts[pts.length - 1];
      const first = pts[0];
      ctx.save();
      ctx.lineTo(xOf(last.t), plot.bottom);
      ctx.lineTo(xOf(first.t), plot.bottom);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, plot.top, 0, plot.bottom);
      grad.addColorStop(0, "rgba(0, 211, 90, 0.28)");
      grad.addColorStop(1, "rgba(0, 211, 90, 0)");
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = xOf(p.t);
        const y = yOf(p.v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = GREEN;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();

      // End dot
      ctx.beginPath();
      ctx.arc(xOf(last.t), yOf(last.v), 3.2, 0, Math.PI * 2);
      ctx.fillStyle = GREEN;
      ctx.fill();

      // Marks sit on the line at their timestamp; value used for y if present
      const valueAt = (t) => {
        if (!pts.length) return this.start;
        if (t <= pts[0].t) return pts[0].v;
        for (let i = 1; i < pts.length; i++) {
          if (t <= pts[i].t) {
            const a = pts[i - 1];
            const b = pts[i];
            const p = (t - a.t) / Math.max(1, b.t - a.t);
            return a.v + (b.v - a.v) * p;
          }
        }
        return pts[pts.length - 1].v;
      };

      const prepared = this.marks
        .map((m) => ({ ...m, valueAt: valueAt(parseTs(m.ts)) }))
        .filter((m) => Number.isFinite(parseTs(m.ts)));
      const placed = layoutMarks(prepared, xOf, yOf, plot, 18);
      this._renderMarks(placed, plot);
    }

    _renderMarks(placed, plot) {
      if (!this.marksEl) return;
      this.marksEl.textContent = "";
      for (const item of placed) {
        const a = document.createElement(item.mark.url ? "a" : "span");
        a.className = "chart-mark " + (TONE_CLASS[item.mark.tone] || "is-sell");
        a.textContent = item.mark.label || "";
        if (item.mark.url) {
          a.href = item.mark.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
        }
        a.style.left = item.x + "px";
        a.style.top = item.top + "px";
        this.marksEl.appendChild(a);
      }
    }
  }

  global.DeskChart = DeskChart;
})(window);
