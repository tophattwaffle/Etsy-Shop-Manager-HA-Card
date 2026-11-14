// etsy-orders-card v4.1.0 — open Etsy orders as order cards, most urgent first.
//
// Reads the `open_orders` / `total_items_needed` attributes of the Etsy Shop
// Manager integration's open-order sensors. The card wears the app's "Warm
// night" look (dark warm greys, Figtree, each shop tinted in its own colour).
// Order colors are the app's job (Settings -> Order colors): each variation and
// personalization arrives already drawn, filled in the app's look
// (`paint_filled`, `personalization_paint_filled`, app versions from the Warm
// night refresh) or tinted (`paint`, `personalization_paint`, older apps), with
// the styles in the sensors' `color_config.css`, so the card colors exactly
// like the app's Orders page and has no color options of its own. Shop colours
// come from the app too (`color_config.shop_tints`, else `shop_accents`).
// Config:
//   shops:             list of { entity, name?, icon? (emoji or text, shown in
//                      the shop's avatar; default its initials),
//                      order_url? (desktop-only override of order_url),
//                      accent? ("#hex" colour for this shop's tint; default
//                      the shop's colour from the app, none if it has none) }
//   android_package:   on Android, open orders in this app (an intent link
//                      with the web order page as fallback) instead of the
//                      per-shop desktop links. Omit to use plain web links.
//   show_prices:       show order totals and the shop total (default false)
//   show_make_list:    show the per-shop "To make" row, less what is made (default true)
//   show_made:         a Made checkbox on each item, kept in sync with the app's Orders
//                      and To make pages (default true; needs integration 0.4.0 or later,
//                      hidden otherwise). An item of several units counts up one per tap
//                      ("1/3", "2/3", …) and clears after the last.
//   combine_shops:     one list of every shop's orders, most urgent first, with a
//                      shop picker at the top, like the app's Orders page: a pill
//                      showing the shop's icon (the app's storefront for All shops)
//                      that opens a menu of icons, full names and order counts;
//                      remembered per device. Under "All shops" each order names
//                      its shop. Give each shop an icon for the pill.
//                      (default false: a section per shop)
//   order_url:         link for each order; "{receipt_id}" is substituted
//                      (replaces_receipt_id on replacement orders; default
//                      Etsy's sold-orders page). Set false to disable.
//                      A non-http scheme (e.g. "microsoft-edge:https://…")
//                      hands the link to another browser via the OS.
// Ship-by pills count calendar days as the app does: overdue, today, soon (the
// next two days) and later, each in the app's colours. (green_hours and
// red_hours, which drove the old green-to-red scale, are no longer used.)
// Animations in the app's color styles (metal glints, random effects) pause
// while the window is unfocused or hidden, and don't run when the device asks
// for reduced motion.
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shortTitle = (t) => String(t || "").split("|")[0].trim();
// The app's brand mark (Material "storefront"), for "All shops" in the combined view's shop picker.
const STOREFRONT = `<svg class="storefront" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.9,8.89l-1.05-4.37c-0.22-0.9-1-1.52-1.91-1.52H5.05C4.15,3,3.36,3.63,3.15,4.52L2.1,8.89 c-0.24,1.02-0.02,2.06,0.62,2.88C2.8,11.88,2.91,11.96,3,12.06V19c0,1.1,0.9,2,2,2h14c1.1,0,2-0.9,2-2v-6.94 c0.09-0.09,0.2-0.18,0.28-0.28C21.92,10.96,22.15,9.91,21.9,8.89z M18.91,4.99l1.05,4.37c0.1,0.42,0.01,0.84-0.25,1.17 C19.57,10.71,19.27,11,18.77,11c-0.61,0-1.14-0.49-1.21-1.14L16.98,5L18.91,4.99z M13,5h1.96l0.54,4.52 c0.05,0.39-0.07,0.78-0.33,1.07C14.95,10.85,14.63,11,14.22,11C13.55,11,13,10.41,13,9.69V5z M8.49,9.52L9.04,5H11v4.69 C11,10.41,10.45,11,9.71,11c-0.34,0-0.65-0.15-0.89-0.41C8.57,10.3,8.45,9.91,8.49,9.52z M4.04,9.36L5.05,5h1.97L6.44,9.86 C6.36,10.51,5.84,11,5.23,11c-0.49,0-0.8-0.29-0.93-0.47C4.03,10.21,3.94,9.78,4.04,9.36z M5,19v-6.03C5.08,12.98,5.15,13,5.23,13 c0.87,0,1.66-0.36,2.24-0.95c0.6,0.6,1.4,0.95,2.31,0.95c0.87,0,1.65-0.36,2.23-0.93c0.59,0.57,1.39,0.93,2.29,0.93 c0.84,0,1.64-0.35,2.24-0.95c0.58,0.59,1.37,0.95,2.24,0.95c0.08,0,0.15-0.02,0.23-0.03V19H5z"/></svg>`;
const isAndroid = () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "");
const isDesktop = () =>
  !isAndroid() &&
  (typeof window === "undefined" || (window.matchMedia?.("(any-hover: hover) and (any-pointer: fine)").matches ?? true));
const hasFocus = () => {
  try {
    if (typeof window !== "undefined" && window.top && window.top !== window && window.top.document) {
      return window.top.document.hasFocus();
    }
  } catch (e) {
    // Cross-origin parent frame: fall back to this document.
  }
  return typeof document !== "undefined" ? document.hasFocus() : true;
};
// Figtree, the app's typeface. Fonts declared inside a shadow root don't load, so the stylesheet goes in the page once.
const FONT_URL = "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap";
// A shop's initials for its avatar: its capitals ("MakerHexWorks" → "MH"), else its first two letters.
const initials = (name) => {
  const caps = String(name || "").match(/[A-Z0-9]/g) || [];
  return (caps.length >= 2 ? caps.slice(0, 2).join("") : String(name || "?").slice(0, 2)).toUpperCase();
};
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

class EtsyOrdersCard extends HTMLElement {
  setConfig(config) {
    if (!Array.isArray(config.shops) || !config.shops.length) {
      throw new Error("etsy-orders-card: 'shops' must be a non-empty list");
    }
    this._config = {
      show_prices: false,
      show_make_list: true,
      show_made: true,
      combine_shops: false,
      order_url: "https://www.etsy.com/your/orders/sold?order_id={receipt_id}",
      ...config,
      shops: config.shops.map((s) => (typeof s === "string" ? { entity: s } : s)),
    };
    this._selectedShop = this._loadSelectedShop();
    this._signature = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const shared = this._sharedColors(hass);
    // The boxes come drawn with the orders; a new color list or look also changes the styles they need.
    const colorsSig = JSON.stringify(shared?.version ?? null);
    if (colorsSig !== this._colorsSig) {
      this._colorsSig = colorsSig;
      this._colorCss = typeof shared?.css === "string" ? shared.css : "";
      this._signature = null;
    }
    this._shopAccents = shared?.shop_accents || {};
    this._shopTints = shared?.shop_tints || {};
    const sig = this._config.shops.map((s) => hass.states[s.entity]?.last_updated).join("|");
    if (sig !== this._signature) {
      this._signature = sig;
      this._render();
    }
  }

  // The app's color settings (styles, shop accents and tints), from the first shop sensor that carries them.
  _sharedColors(hass) {
    for (const s of this._config.shops) {
      const cc = hass.states[s.entity]?.attributes?.color_config;
      if (cc && typeof cc === "object") return cc;
    }
    return null;
  }

  getCardSize() {
    return 8;
  }

  getGridOptions() {
    return { columns: 12, rows: "auto" };
  }

  connectedCallback() {
    if (typeof document !== "undefined" && !document.querySelector("link[data-etsy-orders-card-font]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = FONT_URL;
      link.dataset.etsyOrdersCardFont = "";
      document.head.appendChild(link);
    }
    // Countdowns are relative to now, so refresh them every minute.
    this._timer = setInterval(() => this._render(), 60000);
    // Animations (random and metal alike) only move while the window has focus; pausing (not stopping)
    // resumes them in place. The "paused" class on ha-card is the single switch the CSS uses for all of them.
    // document.hasFocus() reads false in the Companion app's WebView until something is tapped,
    // so it is only checked on mouse-driven (desktop) devices; touch devices start unpaused and
    // rely on blur/focus events and visibility.
    this._onWindowFocus = (e) => {
      this._blurred = e.type === "blur" || (isDesktop() && !hasFocus());
      this._updatePaused();
    };
    this._onVisibility = () => {
      // Coming back to the Companion app doesn't always send a focus event; on desktop, check actual window focus
      // so an unfocused window uncovered in the background stays paused.
      if (!document.hidden) this._blurred = isDesktop() ? !hasFocus() : false;
      this._updatePaused();
    };
    this._blurred = isDesktop() ? !hasFocus() : false;
    window.addEventListener("focus", this._onWindowFocus);
    window.addEventListener("blur", this._onWindowFocus);
    // A tap or click means the page is in use, even where the WebView sends no focus event.
    window.addEventListener("pointerdown", this._onWindowFocus);
    try {
      if (window.top && window.top !== window) {
        window.top.addEventListener("focus", this._onWindowFocus);
        window.top.addEventListener("blur", this._onWindowFocus);
        window.top.addEventListener("pointerdown", this._onWindowFocus);
      }
    } catch (e) {
      // Cross-origin parent frame.
    }
    // A tap anywhere outside the card closes its shop menu.
    this._onOutside = (e) => {
      if (this._menuOpen && !e.composedPath().includes(this)) {
        this._menuOpen = false;
        this._render();
      }
    };
    document.addEventListener("pointerdown", this._onOutside);
    document.addEventListener("visibilitychange", this._onVisibility);
    this._updatePaused();
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    window.removeEventListener("focus", this._onWindowFocus);
    window.removeEventListener("blur", this._onWindowFocus);
    window.removeEventListener("pointerdown", this._onWindowFocus);
    try {
      if (window.top && window.top !== window) {
        window.top.removeEventListener("focus", this._onWindowFocus);
        window.top.removeEventListener("blur", this._onWindowFocus);
        window.top.removeEventListener("pointerdown", this._onWindowFocus);
      }
    } catch (e) {
      // Cross-origin parent frame.
    }
    document.removeEventListener("pointerdown", this._onOutside);
    document.removeEventListener("visibilitychange", this._onVisibility);
  }

  _updatePaused() {
    if (typeof document !== "undefined" && isDesktop() && !hasFocus()) {
      this._blurred = true;
    } else if (this._blurred === undefined) {
      this._blurred = false;
    }
    const paused = Boolean((typeof document !== "undefined" && document.hidden) || this._blurred);
    if (paused && !this._pausedAt) this._pausedAt = Date.now();
    if (!paused && this._pausedAt) {
      this._pausedTotal = (this._pausedTotal || 0) + Date.now() - this._pausedAt;
      this._pausedAt = null;
    }
    this._paused = paused;
    this.shadowRoot?.querySelector("ha-card")?.classList.toggle("paused", paused);
  }

  // Animation clock: wall time minus time spent paused. Each re-render starts the animation at
  // this point, so it carries on where it was instead of jumping to wall-clock time.
  _animClock() {
    return (this._pausedAt ?? Date.now()) - (this._pausedTotal || 0);
  }

  // The ship-by pill: the time to go ("2d 5h", "5h 12m", "40m", "… late") and its kind by calendar day, as the app
  // counts it: overdue, today, soon (tomorrow or the day after) or later.
  _due(ts) {
    if (!ts) return { text: "—", kind: "none", late: false };
    const secs = ts - Date.now() / 1000;
    const abs = Math.abs(secs);
    const d = Math.floor(abs / 86400);
    const h = Math.floor((abs % 86400) / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const span = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
    if (secs < 0) return { text: `${span} late`, kind: "overdue", late: true };
    const days = Math.round((startOfDay(new Date(ts * 1000)) - startOfDay(new Date())) / 86400000);
    return { text: span, kind: days <= 0 ? "today" : days <= 2 ? "soon" : "later", late: false };
  }

  _money(amount, currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(amount);
    } catch (e) {
      return `${amount} ${currency || ""}`.trim();
    }
  }

  // A shop's sensor state, display name, avatar and tint.
  _shopInfo(shop) {
    const st = this._hass.states[shop.entity];
    const name = shop.name || st?.attributes.friendly_name || shop.entity;
    return {
      st,
      name,
      avatar: `<span class="avatar" aria-hidden="true">${esc(shop.icon || initials(name))}</span>`,
      tint: this._tint(shop, st),
    };
  }

  // The shop's colours, from the app (keyed by Etsy shop id) unless the card sets its own accent: the fill, the text
  // on it, and the colour readable as text on the dark card (the app works these out; an accent of the card's own
  // is used as it is). Older apps send only the accent.
  _tint(shop, st) {
    const id = String(st?.attributes?.shop_id ?? "");
    const app = this._shopTints?.[id];
    if (shop.accent) return { fill: shop.accent, ink: "#141312", text: shop.accent };
    if (app?.fill) return { fill: app.fill, ink: app.ink || "#141312", text: app.text || app.fill };
    const accent = this._shopAccents?.[id];
    return accent ? { fill: accent, ink: "#141312", text: accent } : null;
  }

  _tintStyle(tint) {
    return tint ? ` style="--shop: ${esc(tint.fill)}; --shop-ink: ${esc(tint.ink)}; --shop-text: ${esc(tint.text)}"` : "";
  }

  // A shop's open orders, each with what drawing it needs: the shop's order link, its tint and name.
  _entries(shop) {
    const { st, name, tint } = this._shopInfo(shop);
    if (!st) return [];
    const orderUrl = this._orderUrlTemplate(shop);
    return (st.attributes.open_orders || []).map((o) => ({ o, orderUrl, tint, shopName: name }));
  }

  // Soonest ship-by first, orders without one last (as the app's Orders page sorts).
  _byShipBy(entries) {
    return [...entries].sort((a, b) => (a.o.ship_by_ts || Infinity) - (b.o.ship_by_ts || Infinity));
  }

  // The header pills (orders, items and made, next ship-by, total) and the "To make" row for a set of orders.
  _summary(entries, items) {
    const c = this._config;
    const orders = entries.map((e) => e.o);
    const made = orders.reduce((n, o) => n + (o.items || []).reduce((k, i) => k + this._made(o, i), 0), 0);
    const pills = [
      `<span class="pill">${orders.length} order${orders.length === 1 ? "" : "s"}</span>`,
      `<span class="pill">${items} item${items === 1 ? "" : "s"}${made ? ` · ${made} made` : ""}</span>`,
    ];
    if (orders.length) {
      const next = this._due(orders[0].ship_by_ts);
      pills.push(`<span class="pill due k-${next.kind}" title="Next ship-by">Next ${esc(next.text)}</span>`);
    }
    if (c.show_prices && orders.length) {
      const total = orders.reduce((n, o) => n + (o.order_total || 0), 0);
      pills.push(`<span class="pill">${esc(this._money(total, orders[0].currency_code))}</span>`);
    }

    let makeList = "";
    if (c.show_make_list && orders.length) {
      const counts = new Map();
      // What is left: units marked made are taken off, and a title with nothing left drops out.
      for (const o of orders) for (const i of o.items || []) {
        const t = shortTitle(i.title);
        counts.set(t, (counts.get(t) || 0) + this._units(i) - this._made(o, i));
      }
      const left = [...counts].filter(([, n]) => n > 0);
      makeList = `<div class="make"><span class="make-label">To make</span>${left.length
        ? left.sort((a, b) => b[1] - a[1]).map(([t, n]) => `<span class="make-item">${esc(t)} <b>×${n}</b></span>`).join("")
        : `<span class="make-done">All made ✓</span>`}</div>`;
    }
    return { pills: `<span class="pills">${pills.join("")}</span>`, makeList };
  }

  _itemCount(st, orders) {
    return st.attributes.total_items_needed ?? orders.reduce((n, o) => n + (o.items || []).reduce((k, i) => k + (i.quantity || 1), 0), 0);
  }

  _orders(entries, showShop) {
    return entries.length
      ? `<div class="orders">${entries.map((e) => this._order(e.o, e.orderUrl, e.tint, showShop ? e.shopName : null)).join("")}</div>`
      : `<div class="empty">🎉 No open orders — nothing to ship.</div>`;
  }

  _addressAlertsBlurb(entries) {
    const troubled = entries.filter((e) => e.o?.address_alert);
    if (!troubled.length) return "";
    const names = troubled.map((e) => esc(e.o.buyer_name || `#${e.o.replaces_receipt_id || e.o.receipt_id}`));
    const text = troubled.length === 1
      ? `Address check issue on order for <b>${names[0]}</b>`
      : `Address check issues on ${troubled.length} orders: ${names.map((n) => `<b>${n}</b>`).join(", ")}`;
    return `<div class="address-alerts-blurb"><span class="blurb-icon">⚠️</span><span class="blurb-text">${text}</span></div>`;
  }

  // One section per shop (the default layout): a header strip in the shop's colour, the To make row, the orders.
  _shop(shop) {
    const { st, name, avatar, tint } = this._shopInfo(shop);
    if (!st) return `<section class="shop"><div class="shop-head">${avatar}<span class="shop-name">${esc(name)}</span></div><div class="empty">Entity not found: ${esc(shop.entity)}</div></section>`;
    const entries = this._byShipBy(this._entries(shop));
    const { pills, makeList } = this._summary(entries, this._itemCount(st, entries.map((e) => e.o)));
    const alertsBlurb = this._addressAlertsBlurb(entries);
    return `<section class="shop"${this._tintStyle(tint)}>
      <div class="shop-head${tint ? " tinted" : ""}">${avatar}<span class="shop-name">${esc(name)}</span>${pills}</div>
      ${alertsBlurb}${makeList}${this._orders(entries, false)}</section>`;
  }

  // combine_shops: every shop's orders in one list, most urgent first, with a shop picker on top (like the shop list on
  // the app's Orders page). The picker is a pill like the ones beside it, showing only the shop's icon (the app's
  // storefront mark for All shops); it opens a menu of icons and full names. "All shops" names each order's shop and
  // stays neutral; a picked shop tints the header. The choice is kept per device.
  _combined() {
    const shops = this._config.shops;
    const selected = shops.some((s) => s.entity === this._selectedShop) ? this._selectedShop : "";
    const perShop = shops.map((s) => ({ s, ...this._shopInfo(s), entries: this._entries(s) }));
    const shown = perShop.filter((p) => !selected || p.s.entity === selected);
    const entries = this._byShipBy(shown.flatMap((p) => p.entries));
    const items = shown.reduce((n, p) => n + (p.st ? this._itemCount(p.st, p.entries.map((e) => e.o)) : 0), 0);
    const { pills, makeList } = this._summary(entries, items);
    const alertsBlurb = this._addressAlertsBlurb(entries);
    const total = perShop.reduce((n, p) => n + p.entries.length, 0);
    const current = perShop.find((p) => p.s.entity === selected);
    const choices = [{ value: "", mark: STOREFRONT, name: "All shops", count: total, tint: null }].concat(
      perShop.map((p) => ({ value: p.s.entity, mark: p.s.icon ? esc(p.s.icon) : "", name: p.name, count: p.st ? p.entries.length : null, tint: p.tint })),
    );
    // A shop without an icon shows its name on the pill instead.
    const pillMark = current ? (current.s.icon ? esc(current.s.icon) : esc(current.name)) : STOREFRONT;
    const menu = this._menuOpen
      ? `<div class="shop-menu" role="listbox" aria-label="Shop">${choices.map((c) => `<button type="button" class="shop-option${c.value === selected ? " on" : ""}"
          role="option" aria-selected="${c.value === selected}" data-shop="${esc(c.value)}"${this._tintStyle(c.tint)}><span class="mark">${c.mark}</span><span class="name">${esc(c.name)}</span><span class="count">${c.count ?? "not found"}</span></button>`).join("")}</div>`
      : "";
    const missing = shown.filter((p) => !p.st).map((p) => `<div class="empty">Entity not found: ${esc(p.s.entity)}</div>`).join("");
    const tint = current?.tint || null;
    return `<section class="shop"${this._tintStyle(tint)}>
      <div class="shop-head${tint ? " tinted" : ""}"><span class="shop-pick-wrap"><button type="button" class="pill shop-pick${this._menuOpen ? " open" : ""}"
        aria-haspopup="listbox" aria-expanded="${this._menuOpen ? "true" : "false"}" aria-label="Shop: ${esc(current ? current.name : "All shops")}"
        title="${esc(current ? current.name : "All shops")}"><span class="mark">${pillMark}</span><svg class="caret" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg></button>${menu}</span>${current?.s.icon ? `<span class="shop-name">${esc(current.name)}</span>` : ""}${pills}</div>
      ${alertsBlurb}${makeList}${missing}${missing && !entries.length ? "" : this._orders(entries, !selected && shops.length > 1)}</section>`;
  }

  // The device's last shop choice in the combined view (per card, by its shop list); none if storage is off.
  _storageKey() {
    return `etsy-orders-card:shop:${this._config.shops.map((s) => s.entity).join(",")}`;
  }

  _loadSelectedShop() {
    try {
      return localStorage.getItem(this._storageKey()) || "";
    } catch (e) {
      return "";
    }
  }

  // The shop picker: the pill opens and closes the menu, a menu entry picks that shop.
  _onShopClick(path) {
    if (path.find((el) => el.classList?.contains("shop-pick"))) {
      this._setMenu(!this._menuOpen);
      return true;
    }
    const option = path.find((el) => el.classList?.contains("shop-option"));
    if (!option) return false;
    this._selectedShop = option.dataset.shop;
    try {
      localStorage.setItem(this._storageKey(), option.dataset.shop);
    } catch (err) {
      // Private mode or storage off: the choice lasts until the page reloads.
    }
    this._setMenu(false);
    return true;
  }

  // Opening focuses the chosen shop in the menu; closing puts focus back on the pill.
  _setMenu(open) {
    this._menuOpen = open;
    this._render();
    const target = open ? this.shadowRoot.querySelector(".shop-option.on") : this.shadowRoot.querySelector(".shop-pick");
    target?.focus({ preventScroll: true });
  }

  // Escape closes the menu; arrow keys move between its entries.
  _onKeyDown(e) {
    if (!this._menuOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      this._setMenu(false);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const options = [...this.shadowRoot.querySelectorAll(".shop-option")];
      const at = options.indexOf(this.shadowRoot.activeElement);
      options[(at + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length]?.focus();
    }
  }

  // Desktop: the shop's own override (e.g. a microsoft-edge: link), else the web link.
  // Android with android_package: an intent link naming the app, falling back to the web page.
  _orderUrlTemplate(shop) {
    const c = this._config;
    const web = c.order_url;
    if (web && c.android_package && isAndroid() && /^https?:\/\//i.test(web)) {
      const [scheme, rest] = web.split("://");
      return `intent://${rest}#Intent;scheme=${scheme};package=${c.android_package};S.browser_fallback_url=${encodeURIComponent(web)};end`;
    }
    return shop.order_url !== undefined ? shop.order_url : web;
  }

  _orderAlert(o) {
    const alert = o.address_alert;
    if (!alert || !alert.message) return "";
    const isSug = alert.is_suggestion || alert.severity === "warning";
    const icon = isSug ? "⚠️" : "🛑";
    const cls = isSug ? "suggestion" : "error";
    const suggested = alert.suggested_address ? `<div class="alert-suggested">USPS suggests: ${esc(alert.suggested_address.replace(/\n/g, ", "))}</div>` : "";
    return `<div class="address-alert ${cls}"><span class="alert-icon">${icon}</span><div class="alert-body"><div class="alert-msg">${esc(alert.message)}</div>${suggested}</div></div>`;
  }

  // One order: its ship-by pill and buyer, then each item (photo, title, colour chips, Made) with its personalization
  // across the row below. The row is washed in its shop's colour, with no outline (as on the app's Orders page).
  // shopName: shown on the order in the combined list's "All shops" view.
  _order(o, orderUrl, tint, shopName = null) {
    const c = this._config;
    const due = this._due(o.ship_by_ts);
    const displayReceiptId = o.replaces_receipt_id || o.receipt_id;
    const rawBuyer = (o.buyer_name || "").trim();
    const cleanBuyer = o.is_replacement ? rawBuyer.replace(/\s*\(Replacement\)$/i, "").trim() : rawBuyer;
    const buyer = cleanBuyer || `#${displayReceiptId}`;
    const replacement = o.is_replacement ? `<span class="tag replacement">Replacement</span>` : "";
    const price = c.show_prices && o.order_total != null ? `<span class="price">${esc(this._money(o.order_total, o.currency_code))}</span>` : "";
    // The placeholder also appears URL-encoded inside an Android intent's fallback URL.
    const url = orderUrl ? String(orderUrl).replace(/\{receipt_id\}|%7Breceipt_id%7D/g, encodeURIComponent(displayReceiptId)) : null;
    // A variation chip or personalization box, drawn as the app sent it (its filled look when the app sends it, else
    // the tinted one: extra classes, style and the markup before the text, such as lava blobs); null when uncoloured.
    const box = (tag, cls, text, paint, attrs = "") => {
      if (!paint?.style) return null;
      return `<${tag} class="${cls}${esc(paint.cls || "")}" style="${esc(paint.style)}"${attrs}>${paint.inner || ""}${esc(text)}</${tag}>`;
    };
    const items = (o.items || [])
      .map((i) => {
        const vars = (i.variations || [])
          .map((v) => box("span", "var", v.value, v.paint_filled || v.paint, ` title="${esc(v.property)}"`)
            ?? `<span class="var" title="${esc(v.property)}">${esc(v.value)}</span>`)
          .join("");
        const qty = (i.quantity || 1) > 1 ? `<span class="qty">×${i.quantity}</span>` : "";
        const note = i.personalization
          ? box("div", "note", i.personalization, i.personalization_paint_filled || i.personalization_paint)
            ?? `<div class="note plain"><span class="note-label">Personalization</span> · ${esc(i.personalization)}</div>`
          : "";
        const img = i.image_url ? `<img src="${esc(i.image_url)}" alt="" loading="lazy">` : `<div class="noimg"></div>`;
        const units = this._units(i);
        const made = this._made(o, i);
        const done = made >= units;
        return `<div class="item${done && this._canMark(i) ? " made" : ""}"><div class="item-row">${img}<div class="item-body"><div class="title">${qty}${esc(shortTitle(i.title))}</div>${vars ? `<div class="vars">${vars}</div>` : ""}</div>${this._madeButton(o, i, units, made)}</div>${note}</div>`;
      })
      .join("");
    // Only web links get a new tab; an OS handler link (another browser) would leave a blank one behind.
    const target = url && /^https?:/i.test(url) ? ` target="_blank" rel="noopener"` : "";
    const cls = `order${tint ? " tinted" : ""}`;
    const style = this._tintStyle(tint);
    const open = url ? `<a class="${cls}" href="${esc(url)}"${target}${style}>` : `<div class="${cls}"${style}>`;
    const shop = shopName ? `<span class="order-shop"><span class="dot" aria-hidden="true"></span>${esc(shopName)}</span>` : "";
    return `${open}<div class="order-head"><span class="due k-${due.kind}">${esc(due.text)}</span><span class="buyer-wrap"><span class="buyer">${esc(buyer)}</span>${replacement}</span>${shop}${price}</div>${this._orderAlert(o)}${items}${url ? "</a>" : "</div>"}`;
  }

  // Units to make of an item, as the app counts them (at least one).
  _units(i) {
    return Math.max(1, i.quantity || 1);
  }

  // Whether the item can be marked made here: the app sends made_quantity (integration 0.4.0 or later).
  _canMark(i) {
    return this._config.show_made && i.made_quantity !== undefined && i.transaction_id !== undefined;
  }

  // Units marked made: a tap still being saved wins over the sensor until the sensor shows it.
  _made(o, i) {
    const key = `${o.receipt_id}|${i.transaction_id}`;
    const pending = this._pending?.get(key);
    if (pending !== undefined && pending === (i.made_quantity || 0)) this._pending.delete(key);
    const made = this._pending?.get(key) ?? i.made_quantity ?? 0;
    return Math.min(this._units(i), Math.max(0, made));
  }

  // The Made checkbox: ticks one unit made per tap ("1/3", "2/3", "3/3"), and a tap on a fully made item clears it.
  _madeButton(o, i, units, made) {
    if (!this._canMark(i)) return "";
    const done = made >= units;
    const next = done ? 0 : made + 1;
    const title = done ? "Made. Tap to unmark" : units > 1 ? `${made} of ${units} made. Tap to mark one more` : "Tap to mark made";
    return `<button type="button" class="made-btn${done ? " on" : made ? " part" : ""}" aria-pressed="${done ? "true" : made ? "mixed" : "false"}"
      title="${esc(title)}" aria-label="${esc(`${shortTitle(i.title)}: ${title}`)}" data-receipt="${esc(o.receipt_id)}"
      data-transaction="${esc(i.transaction_id)}" data-next="${next}"><span class="box">${made ? "✓" : ""}</span>${units > 1 ? `<span class="count">${made}/${units}</span>` : ""}</button>`;
  }

  // A Made checkbox sits inside the order's link: the tap marks the item and doesn't open the order.
  _onClick(e) {
    if (this._onShopClick(e.composedPath())) return;
    const btn = e.composedPath().find((el) => el.classList?.contains("made-btn"));
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const receipt_id = btn.dataset.receipt;
    const transaction_id = btn.dataset.transaction;
    const made = Number(btn.dataset.next);
    const key = `${receipt_id}|${transaction_id}`;
    this._pending = this._pending || new Map();
    this._pending.set(key, made);
    this._render();
    this._hass.callService("etsy_shop_manager", "set_made", { receipt_id, transaction_id, made }).catch((err) => {
      this._pending.delete(key);
      this._render();
      this.dispatchEvent(new CustomEvent("hass-notification", {
        detail: { message: `Couldn't save the Made mark: ${err?.message || err}` }, bubbles: true, composed: true,
      }));
    });
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (e) => this._onClick(e));
      this.shadowRoot.addEventListener("keydown", (e) => this._onKeyDown(e));
    }
    this._updatePaused();
    this.shadowRoot.innerHTML = `
      <style>
        /* Warm night, the app's look: warm dark greys, Figtree, every border an even hairline. Its colours are the
           app's tokens (docs/DESIGN.md there); each shop's colour comes from the app as --shop / --shop-ink / --shop-text. */
        ha-card {
          --wn-page: #1b1a18; --wn-paper: #232220; --wn-raised: #2c2b28; --wn-line: #3a3835; --wn-line-soft: #34322f;
          --wn-ink: #f1efe9; --wn-secondary: #c4bfb5; --wn-muted: #a29d93; --wn-success: #5cc98d;
          --esm-color-base: var(--wn-paper);
          padding: 16px; display: flex; flex-direction: column; gap: 20px; background: var(--wn-page); color: var(--wn-ink);
          border: 1px solid var(--wn-line-soft); border-radius: 14px;
          font-family: Figtree, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
        }
        .shop { display: flex; flex-direction: column; gap: 10px; }
        /* The shop's header strip: a wash of its colour, its avatar, its name in its colour, the summary pills. */
        .shop-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding: 10px 12px; border-radius: 12px; background: var(--wn-raised); }
        .shop-head.tinted { background: color-mix(in srgb, var(--shop) 12%, var(--wn-page)); }
        .avatar { width: 30px; height: 30px; flex: none; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center;
                  background: var(--shop, var(--wn-line)); color: var(--shop-ink, var(--wn-ink)); font-size: 12px; font-weight: 700; }
        .shop-name { flex: 1 1 140px; min-width: 0; font-size: 17px; font-weight: 600; color: var(--shop-text, var(--wn-ink)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        /* The pills drop to their own line, right-aligned, when the name needs the room. */
        .pills { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; margin-left: auto; }
        .pill { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 12px; border: 0;
                background: var(--wn-raised); color: var(--wn-secondary); font: inherit; font-size: 12px; white-space: nowrap; }
        .shop-head.tinted .pill { background: color-mix(in srgb, var(--wn-page) 55%, transparent); color: var(--wn-ink); }
        /* Ship-by pills, the app's four fills. */
        .due { display: inline-flex; align-items: center; flex: none; height: 22px; padding: 0 9px; border-radius: 11px; font-size: 12px;
               font-weight: 600; white-space: nowrap; background: var(--wn-raised); color: var(--wn-secondary); }
        .pill.due { height: 24px; padding: 0 10px; }
        .k-overdue, .shop-head.tinted .pill.k-overdue { background: #5a1f1c; color: #ffb4a8; }
        .k-today, .shop-head.tinted .pill.k-today { background: #5a3a12; color: #ffcf8a; }
        .k-soon, .shop-head.tinted .pill.k-soon { background: #463f12; color: #f2e08a; }
        .k-later, .shop-head.tinted .pill.k-later { background: #173d2c; color: #97e3ba; }
        /* combine_shops: the shop picker is a pill holding only the shop's icon; its menu lists each shop. */
        .shop-pick-wrap { position: relative; flex: none; }
        .pill.shop-pick { gap: 2px; padding: 0 4px 0 10px; color: var(--wn-ink); cursor: pointer; font-size: 14px; }
        .shop-pick .mark { display: inline-flex; align-items: center; }
        .shop-pick .caret { width: 16px; height: 16px; flex: none; color: var(--wn-secondary); transition: transform 0.15s; }
        .shop-pick.open .caret { transform: rotate(180deg); }
        .shop-pick:focus-visible, .shop-option:focus-visible, .made-btn:focus-visible { outline: 2px solid var(--wn-ink); outline-offset: 1px; }
        .storefront { width: 16px; height: 16px; display: block; color: #f1823a; }
        .shop-menu { position: absolute; z-index: 2; top: calc(100% + 4px); left: 0; min-width: 200px; max-width: 80vw; padding: 4px;
                     display: flex; flex-direction: column; border-radius: 12px; border: 1px solid var(--wn-line);
                     background: var(--wn-paper); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45); }
        .shop-option { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border: 0; border-radius: 8px; background: none;
                       color: var(--wn-ink); font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
        .shop-option:hover { background: var(--wn-raised); }
        .shop-option.on { background: color-mix(in srgb, var(--shop, var(--wn-ink)) 18%, transparent); color: var(--shop-text, var(--wn-ink)); font-weight: 600; }
        .shop-option .mark { width: 20px; display: inline-flex; justify-content: center; flex: none; }
        .shop-option .name { flex: 1; white-space: nowrap; }
        .shop-option .count { font-size: 12px; color: var(--wn-muted); }
        /* The To make row. */
        .make { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 0 4px; font-size: 12px; }
        .make-label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--wn-muted); margin-right: 2px; }
        .make-item { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 10px; border-radius: 12px;
                     border: 1px solid color-mix(in srgb, var(--shop, var(--wn-line)) 40%, var(--wn-line)); color: var(--wn-ink); }
        .make-done { color: var(--wn-success); font-weight: 600; }
        /* Orders: each a rounded row washed in its shop's colour, no outline (as on the app's Orders page). */
        .orders { display: flex; flex-direction: column; gap: 8px; }
        .order { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 12px; text-decoration: none; color: inherit;
                 background: var(--wn-paper); transition: background 0.15s; }
        .order.tinted { background: color-mix(in srgb, var(--shop) 7%, var(--wn-paper)); }
        a.order:hover { background: var(--wn-raised); }
        a.order.tinted:hover { background: color-mix(in srgb, var(--shop) 12%, var(--wn-paper)); }
        .order-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .buyer-wrap { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; }
        .buyer { min-width: 0; font-size: 15px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tag { display: inline-flex; align-items: center; flex: none; height: 22px; padding: 0 9px; border-radius: 11px; font-size: 12px;
               font-weight: 600; white-space: nowrap; background: var(--wn-raised); color: var(--wn-secondary); }
        .tag.replacement { background: #16373b; color: #9ce0e6; }
        .order-shop { flex: none; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--wn-secondary); white-space: nowrap; }
        .order-shop .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--shop, var(--wn-muted)); }
        .price { flex: none; font-size: 13px; color: var(--wn-secondary); }
        .item { display: flex; flex-direction: column; gap: 8px; }
        .item-row { display: flex; gap: 12px; align-items: flex-start; }
        .item img, .noimg { flex: none; width: 52px; height: 52px; border-radius: 8px; object-fit: cover; background: var(--wn-raised); }
        .item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
        .title { font-size: 14px; line-height: 1.3; color: var(--wn-ink); }
        .qty { display: inline-block; margin-right: 6px; padding: 0 6px; border-radius: 8px; font-weight: 700; font-size: 12px;
               color: var(--shop-ink, var(--wn-page)); background: var(--shop, var(--wn-ink)); }
        .vars { display: flex; flex-wrap: wrap; gap: 6px; }
        /* Colour chips and personalization boxes: drawn by the app (filled); plain ones as raised hairline pills. */
        .var { display: inline-flex; align-items: center; min-height: 22px; padding: 0 9px; border-radius: 11px; font-size: 12px; font-weight: 600;
               color: var(--wn-ink); background: var(--wn-raised); border: 1px solid var(--wn-line); overflow-wrap: anywhere; }
        .note { display: block; font-size: 13px; font-weight: 600; line-height: 1.4; padding: 7px 11px; border-radius: 8px;
                border: 1px solid var(--wn-line); background: var(--wn-raised); color: var(--wn-ink); white-space: pre-wrap; }
        .note.plain { font-weight: 400; }
        .note-label { color: var(--wn-muted); }
        /* Made checkbox: a box that fills in the success colour; partly made items show the count beside it. */
        .made-btn { flex: none; display: inline-flex; align-items: center; gap: 4px; align-self: center; margin: -4px -4px -4px 0;
                    padding: 6px; border: 0; background: none; color: var(--wn-secondary); font: inherit; font-size: 12px;
                    cursor: pointer; border-radius: 8px; -webkit-tap-highlight-color: transparent; }
        .made-btn:hover { background: var(--wn-raised); }
        .made-btn .box { width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;
                         border: 2px solid var(--wn-muted); border-radius: 5px; font-size: 14px; font-weight: 700; line-height: 1; }
        .made-btn.part .box { border-color: var(--wn-success); color: var(--wn-success); }
        .made-btn.on .box { border-color: var(--wn-success); background: var(--wn-success); color: var(--wn-page); }
        .made-btn.on, .made-btn.part { color: var(--wn-ink); }
        .item.made img, .item.made .noimg, .item.made .item-body, .item.made .note { opacity: 0.55; }
        .item.made .title { text-decoration: line-through; }
        /* Address checks: tinted strips with an even hairline. */
        .address-alerts-blurb { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 10px;
          background: #3d2f14; border: 1px solid #6b5124; color: #f6cf86; font-size: 13px; line-height: 1.4; }
        .address-alerts-blurb .blurb-icon { font-size: 16px; flex: none; }
        .address-alerts-blurb .blurb-text { flex: 1; }
        .address-alert { padding: 7px 10px; border-radius: 8px; font-size: 12px; line-height: 1.4; display: flex; gap: 8px; align-items: flex-start; }
        .address-alert.error { background: #5a1f1c; border: 1px solid #8a332c; color: #ffb4a8; }
        .address-alert.suggestion { background: #3d2f14; border: 1px solid #6b5124; color: #f6cf86; }
        .address-alert .alert-icon { flex: none; font-size: 14px; }
        .address-alert .alert-body { flex: 1; min-width: 0; }
        .address-alert .alert-msg { font-weight: 600; }
        .address-alert .alert-suggested { margin-top: 2px; opacity: 0.9; }
        .empty { color: var(--wn-secondary); font-size: 14px; padding: 4px 0; }
        /* The app's color styles (color_config.css). */
        ${(this._colorCss || "").replace(/<\//g, "<\\/")}
        /* Even hairlines: the app's styles give notes a 4px left side for older cards; this card evens it out. */
        .note.colored { border-width: 1px; }
        .note.multi::before { inset: -1px; border-width: 1px; }
        .note.metal::after { inset: -1px; }
        /* One switch for every animation on the card (random, metal and any added later): while the card is
           paused (window unfocused or hidden, see _updatePaused) all of them hold their frame, and they resume
           in place. With reduced motion requested, none of them run. */
        ha-card.paused *, ha-card.paused *::before, ha-card.paused *::after { animation-play-state: paused !important; }
        @media (prefers-reduced-motion: reduce) { ha-card *, ha-card *::before, ha-card *::after { animation: none !important; } }
      </style>
      <ha-card class="${this._paused ? "paused" : ""}" style="--phase: -${this._animClock() % 240000}ms">${this._config.combine_shops ? this._combined() : this._config.shops.map((s) => this._shop(s)).join("")}</ha-card>`;
  }
}

customElements.define("etsy-orders-card", EtsyOrdersCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "etsy-orders-card",
  name: "Etsy Orders",
  description: "Open Etsy orders as order cards with thumbnails, variations, personalization and ship-by urgency.",
});
