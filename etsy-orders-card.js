// etsy-orders-card v3.1.0 — open Etsy orders as order cards, most urgent first.
//
// Reads the `open_orders` / `total_items_needed` attributes of the Etsy Shop
// Manager integration's open-order sensors. Order colors are the app's job
// (Settings -> Order colors): each variation and personalization arrives
// already drawn (`paint`, `personalization_paint`), with the styles in the
// sensors' `color_config.css`, so the card colors exactly like the app's
// Orders page and has no color options of its own. Config:
//   shops:             list of { entity, name?, icon? (emoji or text),
//                      order_url? (desktop-only override of order_url),
//                      accent? ("#hex" outline for this shop's orders; default
//                      the shop's color from the app, none if it has none) }
//   android_package:   on Android, open orders in this app (an intent link
//                      with the web order page as fallback) instead of the
//                      per-shop desktop links. Omit to use plain web links.
//   show_prices:       show order totals and the shop total (default false)
//   show_make_list:    show the per-shop "To make" summary, less what is made (default true)
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
//   green_hours:       ship-by pills and the header's next ship-by chip are fully
//                      green at this many hours or more to ship (default 72)
//   red_hours:         ...and fully red at this many hours or fewer, blending
//                      green → yellow → red in between; below it the whole
//                      order card is tinted red (default 12)
//   order_url:         link for each order; "{receipt_id}" is substituted
//                      (default Etsy's sold-orders page). Set false to disable.
//                      A non-http scheme (e.g. "microsoft-edge:https://…")
//                      hands the link to another browser via the OS.
// Animations in the app's color styles (metal glints, random effects) pause
// while the window is unfocused or hidden, and don't run when the device asks
// for reduced motion.
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shortTitle = (t) => String(t || "").split("|")[0].trim();
// The app's brand mark (Material "storefront", as in its top bar), for "All shops" in the combined view's shop picker.
const STOREFRONT = `<svg class="storefront" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.9,8.89l-1.05-4.37c-0.22-0.9-1-1.52-1.91-1.52H5.05C4.15,3,3.36,3.63,3.15,4.52L2.1,8.89 c-0.24,1.02-0.02,2.06,0.62,2.88C2.8,11.88,2.91,11.96,3,12.06V19c0,1.1,0.9,2,2,2h14c1.1,0,2-0.9,2-2v-6.94 c0.09-0.09,0.2-0.18,0.28-0.28C21.92,10.96,22.15,9.91,21.9,8.89z M18.91,4.99l1.05,4.37c0.1,0.42,0.01,0.84-0.25,1.17 C19.57,10.71,19.27,11,18.77,11c-0.61,0-1.14-0.49-1.21-1.14L16.98,5L18.91,4.99z M13,5h1.96l0.54,4.52 c0.05,0.39-0.07,0.78-0.33,1.07C14.95,10.85,14.63,11,14.22,11C13.55,11,13,10.41,13,9.69V5z M8.49,9.52L9.04,5H11v4.69 C11,10.41,10.45,11,9.71,11c-0.34,0-0.65-0.15-0.89-0.41C8.57,10.3,8.45,9.91,8.49,9.52z M4.04,9.36L5.05,5h1.97L6.44,9.86 C6.36,10.51,5.84,11,5.23,11c-0.49,0-0.8-0.29-0.93-0.47C4.03,10.21,3.94,9.78,4.04,9.36z M5,19v-6.03C5.08,12.98,5.15,13,5.23,13 c0.87,0,1.66-0.36,2.24-0.95c0.6,0.6,1.4,0.95,2.31,0.95c0.87,0,1.65-0.36,2.23-0.93c0.59,0.57,1.39,0.93,2.29,0.93 c0.84,0,1.64-0.35,2.24-0.95c0.58,0.59,1.37,0.95,2.24,0.95c0.08,0,0.15-0.02,0.23-0.03V19H5z"/></svg>`;
const isAndroid = () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "");

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
      green_hours: 72,
      red_hours: 12,
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
    const sig = this._config.shops.map((s) => hass.states[s.entity]?.last_updated).join("|");
    if (sig !== this._signature) {
      this._signature = sig;
      this._render();
    }
  }

  // The app's color settings (styles and shop accents), from the first shop sensor that carries them.
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
    // Countdowns are relative to now, so refresh them every minute.
    this._timer = setInterval(() => this._render(), 60000);
    // Animations (random and metal alike) only move while the window has focus; pausing (not stopping)
    // resumes them in place. The "paused" class on ha-card is the single switch the CSS uses for all of them.
    // document.hasFocus() reads false in the Companion app's WebView until something is tapped,
    // so it only decides the starting state on mouse-driven (desktop) devices; touch devices
    // start unpaused and rely on blur/focus events and visibility.
    this._onWindowFocus = (e) => {
      this._blurred = e.type === "blur";
      this._updatePaused();
    };
    this._onVisibility = () => {
      // Coming back to the app or tab doesn't always send a focus event, so visible counts as focused.
      if (!document.hidden) this._blurred = false;
      this._updatePaused();
    };
    const desktop = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
    this._blurred = desktop ? !document.hasFocus() : false;
    window.addEventListener("focus", this._onWindowFocus);
    window.addEventListener("blur", this._onWindowFocus);
    // A tap or click means the page is in use, even where the WebView sends no focus event.
    window.addEventListener("pointerdown", this._onWindowFocus);
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
    document.removeEventListener("pointerdown", this._onOutside);
    document.removeEventListener("visibilitychange", this._onVisibility);
  }

  _updatePaused() {
    const paused = document.hidden || this._blurred;
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
    return Date.now() - (this._pausedTotal || 0) - (this._pausedAt ? Date.now() - this._pausedAt : 0);
  }

  _due(ts) {
    if (!ts) return { text: "—", cls: "", style: "", urgent: false };
    const c = this._config;
    const secs = ts - Date.now() / 1000;
    const abs = Math.abs(secs);
    const d = Math.floor(abs / 86400);
    const h = Math.floor((abs % 86400) / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const span = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
    // Hue 120 (green) at green_hours or more, 0 (red) at red_hours or fewer, linear in between.
    const hrs = secs / 3600;
    const f = Math.min(1, Math.max(0, (hrs - c.red_hours) / Math.max(0.01, c.green_hours - c.red_hours)));
    const hue = Math.round(120 * f);
    const style = `background: hsla(${hue}, 75%, 48%, 0.3); border-color: hsla(${hue}, 75%, 42%, 0.8);`;
    const urgent = hrs < c.red_hours;
    if (secs < 0) return { text: `${span} late`, cls: "late", style, urgent };
    return { text: span, cls: "", style, urgent };
  }

  _money(amount, currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(amount);
    } catch (e) {
      return `${amount} ${currency || ""}`.trim();
    }
  }

  // A shop's sensor state, display name and icon.
  _shopInfo(shop) {
    const st = this._hass.states[shop.entity];
    return {
      st,
      name: shop.name || st?.attributes.friendly_name || shop.entity,
      icon: shop.icon ? `<span class="shop-icon">${esc(shop.icon)}</span>` : "",
    };
  }

  // A shop's open orders, each with what drawing it needs: the shop's order link, its accent color and name.
  _entries(shop) {
    const { st, name } = this._shopInfo(shop);
    if (!st) return [];
    const orderUrl = this._orderUrlTemplate(shop);
    // The shop's color from the app (keyed by Etsy shop id), unless the card sets its own.
    const accent = shop.accent || this._shopAccents?.[String(st.attributes.shop_id)];
    return (st.attributes.open_orders || []).map((o) => ({ o, orderUrl, accent, shopName: name }));
  }

  // Soonest ship-by first, orders without one last (as the app's Orders page sorts).
  _byShipBy(entries) {
    return [...entries].sort((a, b) => (a.o.ship_by_ts || Infinity) - (b.o.ship_by_ts || Infinity));
  }

  // The header chips (orders, items and made, next ship-by, total) and the "To make" line for a set of orders.
  _summary(entries, items) {
    const c = this._config;
    const orders = entries.map((e) => e.o);
    const made = orders.reduce((n, o) => n + (o.items || []).reduce((k, i) => k + this._made(o, i), 0), 0);
    const chips = [
      `<span class="chip">${orders.length} order${orders.length === 1 ? "" : "s"}</span>`,
      `<span class="chip">${items} item${items === 1 ? "" : "s"}${made ? ` · ${made} made` : ""}</span>`,
    ];
    if (orders.length) {
      const next = this._due(orders[0].ship_by_ts);
      // Just the time to the soonest ship-by, coloured like the order pills (the title says what it is).
      chips.push(`<span class="chip next ${next.cls}" style="${next.style}" title="Next ship-by">${esc(next.text)}</span>`);
    }
    if (c.show_prices && orders.length) {
      const total = orders.reduce((n, o) => n + (o.order_total || 0), 0);
      chips.push(`<span class="chip">${esc(this._money(total, orders[0].currency_code))}</span>`);
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
    return { chips: `<span class="chips">${chips.join("")}</span>`, makeList };
  }

  _itemCount(st, orders) {
    return st.attributes.total_items_needed ?? orders.reduce((n, o) => n + (o.items || []).reduce((k, i) => k + (i.quantity || 1), 0), 0);
  }

  _orders(entries, showShop) {
    return entries.length
      ? entries.map((e) => this._order(e.o, e.orderUrl, e.accent, showShop ? e.shopName : null)).join("")
      : `<div class="empty">🎉 No open orders — nothing to ship.</div>`;
  }

  _addressAlertsBlurb(entries) {
    const troubled = entries.filter((e) => e.o?.address_alert);
    if (!troubled.length) return "";
    const names = troubled.map((e) => esc(e.o.buyer_name || `#${e.o.receipt_id}`));
    const text = troubled.length === 1
      ? `Address check issue on order for <b>${names[0]}</b>`
      : `Address check issues on ${troubled.length} orders: ${names.map((n) => `<b>${n}</b>`).join(", ")}`;
    return `<div class="address-alerts-blurb"><span class="blurb-icon">⚠️</span><span class="blurb-text">${text}</span></div>`;
  }

  // One section per shop (the default layout).
  _shop(shop) {
    const { st, name, icon } = this._shopInfo(shop);
    if (!st) return `<section class="shop"><div class="shop-head">${icon}<span class="shop-name">${esc(name)}</span></div><div class="empty">Entity not found: ${esc(shop.entity)}</div></section>`;
    const entries = this._byShipBy(this._entries(shop));
    const { chips, makeList } = this._summary(entries, this._itemCount(st, entries.map((e) => e.o)));
    const alertsBlurb = this._addressAlertsBlurb(entries);
    return `<section class="shop">
      <div class="shop-head">${icon}<span class="shop-name">${esc(name)}</span>${chips}</div>
      ${alertsBlurb}${makeList}${this._orders(entries, false)}</section>`;
  }

  // combine_shops: every shop's orders in one list, most urgent first, with a shop picker on top (like the shop list on
  // the app's Orders page). The picker is a pill like the chips beside it, showing only the shop's icon (the app's
  // storefront mark for All shops); it opens a menu of icons and full names. "All shops" names each order's shop; the
  // choice is kept per device.
  _combined() {
    const shops = this._config.shops;
    const selected = shops.some((s) => s.entity === this._selectedShop) ? this._selectedShop : "";
    const perShop = shops.map((s) => ({ s, ...this._shopInfo(s), entries: this._entries(s) }));
    const shown = perShop.filter((p) => !selected || p.s.entity === selected);
    const entries = this._byShipBy(shown.flatMap((p) => p.entries));
    const items = shown.reduce((n, p) => n + (p.st ? this._itemCount(p.st, p.entries.map((e) => e.o)) : 0), 0);
    const { chips, makeList } = this._summary(entries, items);
    const alertsBlurb = this._addressAlertsBlurb(entries);
    const total = perShop.reduce((n, p) => n + p.entries.length, 0);
    const current = perShop.find((p) => p.s.entity === selected);
    const choices = [{ value: "", mark: STOREFRONT, name: "All shops", count: total }].concat(
      perShop.map((p) => ({ value: p.s.entity, mark: p.s.icon ? esc(p.s.icon) : "", name: p.name, count: p.st ? p.entries.length : null })),
    );
    // A shop without an icon shows its name on the pill instead.
    const pillMark = current ? (current.s.icon ? esc(current.s.icon) : esc(current.name)) : STOREFRONT;
    const menu = this._menuOpen
      ? `<div class="shop-menu" role="listbox" aria-label="Shop">${choices.map((c) => `<button type="button" class="shop-option${c.value === selected ? " on" : ""}"
          role="option" aria-selected="${c.value === selected}" data-shop="${esc(c.value)}"><span class="mark">${c.mark}</span><span class="name">${esc(c.name)}</span><span class="count">${c.count ?? "not found"}</span></button>`).join("")}</div>`
      : "";
    const missing = shown.filter((p) => !p.st).map((p) => `<div class="empty">Entity not found: ${esc(p.s.entity)}</div>`).join("");
    return `<section class="shop">
      <div class="shop-head"><span class="shop-pick-wrap"><button type="button" class="chip shop-pick${this._menuOpen ? " open" : ""}"
        aria-haspopup="listbox" aria-expanded="${this._menuOpen ? "true" : "false"}" aria-label="Shop: ${esc(current ? current.name : "All shops")}"
        title="${esc(current ? current.name : "All shops")}"><span class="mark">${pillMark}</span><svg class="caret" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg></button>${menu}</span>${chips}</div>
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

  // shopName: shown on the order in the combined list's "All shops" view.
  _order(o, orderUrl, accent, shopName = null) {
    const c = this._config;
    const due = this._due(o.ship_by_ts);
    const buyer = (o.buyer_name || "").trim() || `#${o.receipt_id}`;
    const price = c.show_prices && o.order_total != null ? `<span class="price">${esc(this._money(o.order_total, o.currency_code))}</span>` : "";
    // The placeholder also appears URL-encoded inside an Android intent's fallback URL.
    const url = orderUrl ? String(orderUrl).replace(/\{receipt_id\}|%7Breceipt_id%7D/g, encodeURIComponent(o.receipt_id)) : null;
    // A variation pill or personalization note, drawn as the app sent it (`paint`: extra classes, style and the
    // markup before the text, such as lava blobs); plain when the app didn't color it.
    const box = (tag, cls, text, paint, attrs = "") => {
      if (!paint?.style) return `<${tag} class="${cls}"${attrs}>${esc(text)}</${tag}>`;
      return `<${tag} class="${cls}${esc(paint.cls || "")}" style="${esc(paint.style)}"${attrs}>${paint.inner || ""}${esc(text)}</${tag}>`;
    };
    const items = (o.items || [])
      .map((i) => {
        const vars = (i.variations || []).map((v) => box("span", "var", v.value, v.paint, ` title="${esc(v.property)}"`)).join("");
        const qty = (i.quantity || 1) > 1 ? `<span class="qty">×${i.quantity}</span>` : "";
        const note = i.personalization ? box("div", "note", i.personalization, i.personalization_paint) : "";
        const img = i.image_url ? `<img src="${esc(i.image_url)}" alt="" loading="lazy">` : `<div class="noimg"></div>`;
        const units = this._units(i);
        const made = this._made(o, i);
        const done = made >= units;
        return `<div class="item${done && this._canMark(i) ? " made" : ""}">${img}<div class="item-body"><div class="title">${qty}${esc(shortTitle(i.title))}</div>${vars ? `<div class="vars">${vars}</div>` : ""}${note}</div>${this._madeButton(o, i, units, made)}</div>`;
      })
      .join("");
    // Only web links get a new tab; an OS handler link (another browser) would leave a blank one behind.
    const target = url && /^https?:/i.test(url) ? ` target="_blank" rel="noopener"` : "";
    // An urgent order keeps its red background; the shop's outline shows either way.
    const cls = `order${due.urgent ? " urgent" : ""}${accent ? " accent" : ""}`;
    const style = accent ? ` style="--shop: ${esc(accent)}"` : "";
    const open = url ? `<a class="${cls}" href="${esc(url)}"${target}${style}>` : `<div class="${cls}"${style}>`;
    return `${open}<div class="order-head"><span class="due ${due.cls}" style="${due.style}">${esc(due.text)}</span><span class="buyer">${esc(buyer)}</span>${shopName ? `<span class="order-shop">${esc(shopName)}</span>` : ""}${price}</div>${this._orderAlert(o)}${items}${url ? "</a>" : "</div>"}`;
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
    this.shadowRoot.innerHTML = `
      <style>
        ha-card { padding: 12px; display: flex; flex-direction: column; gap: 16px; }
        .shop { display: flex; flex-direction: column; gap: 8px; }
        .shop-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
        .shop-icon { font-size: 20px; }
        .shop-name { font-size: 18px; font-weight: 500; color: var(--primary-text-color); }
        .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-left: auto; }
        /* combine_shops: the shop picker is a chip (same pill as the counts beside it) holding only the shop's icon; its
           menu lists each shop's icon and full name. */
        .shop-pick-wrap { position: relative; flex: none; }
        .chip.shop-pick { display: inline-flex; align-items: center; justify-content: center; gap: 2px; padding-right: 4px; min-height: 20px; font: inherit; font-size: 14px;
                          line-height: 1; color: var(--primary-text-color); cursor: pointer; }
        /* The down arrow beside the icon says the pill is a dropdown; it turns up while the menu is open. */
        .shop-pick .mark { display: inline-flex; align-items: center; }
        .shop-pick .caret { width: 16px; height: 16px; flex: none; color: var(--secondary-text-color); transition: transform 0.15s; }
        .shop-pick.open .caret { transform: rotate(180deg); }
        .chip.shop-pick:hover, .chip.shop-pick.open { border-color: var(--divider-color, rgba(127, 127, 127, 0.4)); }
        .shop-pick:focus-visible, .shop-option:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
        .storefront { width: 16px; height: 16px; display: block; color: #f1823a; }
        .shop-menu { position: absolute; z-index: 2; top: calc(100% + 4px); left: 0; min-width: 200px; max-width: 80vw; padding: 4px;
                     display: flex; flex-direction: column; border-radius: 12px; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3));
                     background: var(--card-background-color, var(--ha-card-background, #1c1c1c)); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35); }
        .shop-option { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border: 0; border-radius: 8px; background: none;
                       color: var(--primary-text-color); font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
        .shop-option:hover { background: rgba(127, 127, 127, 0.15); }
        .shop-option.on { background: var(--secondary-background-color, rgba(127, 127, 127, 0.2)); font-weight: 500; }
        .shop-option .mark { width: 20px; display: inline-flex; justify-content: center; flex: none; }
        .shop-option .name { flex: 1; white-space: nowrap; }
        .shop-option .count { font-size: 12px; color: var(--secondary-text-color); }
        .order-shop { flex: none; font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; }
        .chip { font-size: 12px; padding: 1px 8px; border-radius: 10px; color: var(--secondary-text-color); border: 1px solid transparent;
                background: var(--secondary-background-color, rgba(127, 127, 127, 0.15)); }
        .chip.next { color: var(--primary-text-color); font-weight: 500; }
        .chip.late, .due.late { font-weight: 700; }
        .make { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; font-size: 12px; color: var(--secondary-text-color); }
        .make-label { text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px; margin-right: 2px; }
        .make-item { padding: 2px 8px; border-radius: 10px; border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3)); color: var(--primary-text-color); }
        .order { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 12px; text-decoration: none; color: inherit;
                 background: var(--secondary-background-color, rgba(127, 127, 127, 0.08)); transition: background 0.15s; }
        a.order:hover { background: rgba(127, 127, 127, 0.18); }
        .order.urgent { background: rgba(219, 68, 55, 0.16); box-shadow: inset 0 0 0 1px rgba(219, 68, 55, 0.5); }
        a.order.urgent:hover { background: rgba(219, 68, 55, 0.26); }
        /* The shop's color as a tab on the left and a thin outline, like personalization notes and the app's listing cards. */
        .order.accent, .order.urgent.accent { box-shadow: inset 4px 0 0 var(--shop), inset 0 0 0 1px var(--shop); }
        .order-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .due { flex: none; font-size: 12px; font-weight: 500; padding: 1px 8px; border-radius: 10px; color: var(--primary-text-color);
               background: rgba(127, 127, 127, 0.18); border: 1px solid transparent; }
        .buyer { flex: 1; min-width: 0; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .price { flex: none; font-size: 13px; color: var(--secondary-text-color); }
        .item { display: flex; gap: 10px; align-items: flex-start; }
        .item img, .noimg { flex: none; width: 56px; height: 44px; border-radius: 8px; object-fit: cover; background: rgba(127, 127, 127, 0.2); }
        .item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .title { font-size: 14px; line-height: 1.3; color: var(--primary-text-color); }
        .qty { display: inline-block; margin-right: 6px; padding: 0 6px; border-radius: 8px; font-weight: 600; font-size: 12px;
               color: var(--text-primary-color, #fff); background: var(--primary-color); }
        .vars { display: flex; flex-wrap: wrap; gap: 4px; }
        /* Made checkbox: a box that fills in the success color; partly made items show the count beside it. */
        .made-btn { flex: none; display: inline-flex; align-items: center; gap: 4px; align-self: center; margin: -4px -4px -4px 0;
                    padding: 6px; border: 0; background: none; color: var(--secondary-text-color); font: inherit; font-size: 12px;
                    cursor: pointer; border-radius: 8px; -webkit-tap-highlight-color: transparent; }
        .made-btn:hover { background: rgba(127, 127, 127, 0.15); }
        .made-btn:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
        .made-btn .box { width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;
                         border: 2px solid var(--secondary-text-color); border-radius: 5px; font-size: 14px; font-weight: 700; line-height: 1; }
        .made-btn.part .box { border-color: var(--success-color, #43a047); color: var(--success-color, #43a047); }
        .made-btn.on .box { border-color: var(--success-color, #43a047); background: var(--success-color, #43a047); color: #fff; }
        .made-btn.on, .made-btn.part { color: var(--primary-text-color); }
        .item.made img, .item.made .noimg, .item.made .item-body { opacity: 0.55; }
        .item.made .title { text-decoration: line-through; }
        .make-done { color: var(--success-color, #43a047); font-weight: 500; }
        .var { font-size: 11px; padding: 1px 6px; border-radius: 8px; color: var(--secondary-text-color);
               border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3)); }
        .note { font-size: 13px; padding: 4px 8px; border-left: 3px solid var(--accent-color, var(--primary-color));
                border-radius: 4px; background: rgba(127, 127, 127, 0.1); color: var(--primary-text-color); white-space: pre-wrap; }
        .address-alerts-blurb {
          display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 10px;
          background: rgba(219, 68, 55, 0.15); border: 1px solid rgba(219, 68, 55, 0.4);
          color: var(--primary-text-color, inherit); font-size: 13px; line-height: 1.4; margin-bottom: 8px;
        }
        .address-alerts-blurb .blurb-icon { font-size: 16px; flex: none; }
        .address-alerts-blurb .blurb-text { flex: 1; }
        .address-alert {
          margin: 4px 0 6px 0; padding: 6px 10px; border-radius: 8px; font-size: 12px; line-height: 1.4;
          display: flex; gap: 8px; align-items: flex-start;
        }
        .address-alert.error {
          background: rgba(219, 68, 55, 0.12); border-left: 3px solid #db4437; color: var(--primary-text-color, inherit);
        }
        .address-alert.suggestion {
          background: rgba(255, 167, 38, 0.12); border-left: 3px solid #ffa726; color: var(--primary-text-color, inherit);
        }
        .address-alert .alert-icon { flex: none; font-size: 14px; }
        .address-alert .alert-body { flex: 1; min-width: 0; }
        .address-alert .alert-msg { font-weight: 500; }
        .address-alert .alert-suggested { margin-top: 2px; opacity: 0.9; }
        /* The app's color styles (color_config.css); its tints are mixed with the card's background. */
        ha-card { --esm-color-base: var(--ha-card-background, var(--card-background-color, #fff)); }
        ${(this._colorCss || "").replace(/<\//g, "<\\/")}
        /* One switch for every animation on the card (random, metal and any added later): while the card is
           paused (window unfocused or hidden, see _updatePaused) all of them hold their frame, and they resume
           in place. With reduced motion requested, none of them run. */
        ha-card.paused *, ha-card.paused *::before, ha-card.paused *::after { animation-play-state: paused !important; }
        @media (prefers-reduced-motion: reduce) { ha-card *, ha-card *::before, ha-card *::after { animation: none !important; } }
        .empty { color: var(--secondary-text-color); font-size: 14px; padding: 4px 0; }
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
