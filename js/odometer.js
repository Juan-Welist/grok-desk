(function (global) {
  function formatUsd(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "";
    const abs = Math.abs(v).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (v < 0 ? "-$" : "$") + abs;
  }

  function reduced() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function spanFor(ch) {
    if (ch >= "0" && ch <= "9") {
      const col = document.createElement("span");
      col.className = "od-d";
      const inner = document.createElement("span");
      inner.className = "od-col";
      inner.dataset.digit = ch;
      for (let i = 0; i <= 9; i++) {
        const s = document.createElement("span");
        s.textContent = String(i);
        inner.appendChild(s);
      }
      inner.style.transform = "translateY(" + -Number(ch) * 10 + "%)";
      col.appendChild(inner);
      return col;
    }
    const s = document.createElement("span");
    s.className = "od-s" + (ch === "$" || ch === "-" ? " is-sym" : " is-sep");
    s.textContent = ch;
    return s;
  }

  class Odometer {
    constructor(el) {
      this.el = el;
      this.text = "";
      this.value = null;
    }

    set(n, { animate = true } = {}) {
      const text = formatUsd(n);
      if (!text) {
        this.el.textContent = "";
        this.text = "";
        this.value = null;
        return;
      }
      const shouldRoll = animate && !reduced() && this.text !== "";
      if (!shouldRoll || text.length !== this.text.length) {
        this.render(text, false);
      } else {
        this.render(text, true);
      }
      this.text = text;
      this.value = n;
    }

    render(text, roll) {
      if (!this.el.childElementCount || this.el.textContent === "" || this.el.children.length !== text.length) {
        this.el.textContent = "";
        for (const ch of text) this.el.appendChild(spanFor(ch));
      }
      const kids = this.el.children;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const node = kids[i];
        if (ch >= "0" && ch <= "9") {
          const col = node && node.querySelector(".od-col");
          if (!col) {
            this.el.textContent = "";
            for (const c of text) this.el.appendChild(spanFor(c));
            return this.render(text, false);
          }
          if (roll) {
            col.classList.add("is-anim");
            col.style.transitionDelay = i * 30 + "ms";
          } else {
            col.classList.remove("is-anim");
            col.style.transitionDelay = "0ms";
          }
          col.style.transform = "translateY(" + -Number(ch) * 10 + "%)";
          col.dataset.digit = ch;
        } else if (node) {
          node.textContent = ch;
        }
      }
    }
  }

  Odometer.formatUsd = formatUsd;
  global.Odometer = Odometer;
})(window);
