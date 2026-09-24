/* Aegis: product hotspots on the homepage photo (IKEA style). No dependencies.
   Markup and styles: .build/build_home_look.py writes the section into index.html and the
   "aegis-look" block into assets/aegis.css. Each dot sits on a point of the photo given as a
   fraction of its width and height (data-x, data-y), mapped with the same maths as
   object-fit: cover, so it stays on the product at every screen size. */
(function () {
  'use strict';
  var root = document.querySelector('.aegis_look');
  if (!root) return;
  var stage = root.querySelector('.aegis_look_stage');
  var scenes = Array.prototype.slice.call(root.querySelectorAll('.aegis_look_scene'));
  var count = root.querySelector('.aegis_look_count');
  var prev = root.querySelector('.aegis_look_prev');
  var next = root.querySelector('.aegis_look_next');
  var nav = root.querySelector('.aegis_look_nav');
  var intro = root.querySelector('.aegis_look_intro');
  var chips = Array.prototype.slice.call(root.querySelectorAll('.aegis_look_chip'));
  var canHover = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  var current = 0, open = null, opener = null, closeTimer = null;
  if (!stage || !scenes.length) return;
  if (canHover) root.classList.add('aegis_look_can_hover');   // the intro says "hover" or "tap"

  // the dot's spot for a dot, card or chip (a chip names its card in aria-controls)
  function spotOf(el) {
    if (!el) return null;
    if (el.classList.contains('aegis_look_chip')) {
      var card = document.getElementById(el.getAttribute('aria-controls'));
      return card && !card.parentNode.hidden ? card.parentNode : null;   // its dot may be cropped out
    }
    return el.closest('.aegis_look_spot');
  }

  // on desktops the intro panel sits over the photo: its box (in photo coordinates, with a margin)
  function block() {
    if (!intro || getComputedStyle(intro).position !== 'absolute') return null;
    var a = intro.getBoundingClientRect(), b = stage.getBoundingClientRect();
    return { l: a.left - b.left - 8, t: a.top - b.top - 8, r: a.right - b.left + 8, b: a.bottom - b.top + 8 };
  }

  function num(el, name, fallback) {
    var v = parseFloat(el.getAttribute(name));
    return isNaN(v) ? fallback : v;
  }

  function place(scene) {
    var W = stage.clientWidth, H = stage.clientHeight;
    if (!W || !H) return;
    root.classList.toggle('aegis_look_narrow', W < 560);
    var w = num(scene, 'data-w', 1), h = num(scene, 'data-h', 1);
    var fx = num(scene, 'data-fx', 0.5), fy = num(scene, 'data-fy', 0.5);
    var s = Math.max(W / w, H / h), dw = w * s, dh = h * s;
    var ox = (W - dw) * fx, oy = (H - dh) * fy, edge = 22, bk = block();
    var spots = scene.querySelectorAll('.aegis_look_spot');
    for (var i = 0; i < spots.length; i++) {
      var sp = spots[i];
      var x = ox + num(sp, 'data-x', 0.5) * dw, y = oy + num(sp, 'data-y', 0.5) * dh;
      sp.hidden = !(x >= edge && x <= W - edge && y >= edge && y <= H - edge) ||   // cropped out at this size
                  !!(bk && x > bk.l && x < bk.r && y > bk.t && y < bk.b);          // or under the intro panel
      sp.style.left = x.toFixed(1) + 'px';
      sp.style.top = y.toFixed(1) + 'px';
    }
    if (open) fit(open);
  }

  // Where the card goes: beside its dot on wide photos (the side with room), under or over it on
  // narrow ones, always inside the photo and clear of the photo controls and, on phones, the
  // floating WhatsApp button. Works from layout sizes, so the opening animation cannot throw it off.
  function fit(sp) {
    var card = sp.querySelector('.aegis_look_card'), dot = sp.querySelector('.aegis_look_dot');
    var W = stage.clientWidth, H = stage.clientHeight, narrow = W < 560, m = 12;
    var x = parseFloat(sp.style.left) || 0, y = parseFloat(sp.style.top) || 0;
    var cw = card.offsetWidth, ch = card.offsetHeight;
    var d = dot.offsetWidth * 0.56 + 12;                 // dot centre to card edge (the dot grows when open)
    var floor = H - (narrow ? 76 : m);
    if (nav && nav.offsetHeight) floor = Math.min(floor, nav.offsetTop - 8);
    var pref = sp.getAttribute('data-side') || (x < W * 0.6 ? 'right' : 'left');
    var order = narrow ? ['below', 'above'] : [pref, pref === 'right' ? 'left' : 'right', 'below', 'above'];
    var bk = block();
    function cx(v) { return Math.max(m, Math.min(v, W - m - cw)); }
    function cy(v) { return Math.max(m, Math.min(v, floor - ch)); }
    function hits(L, T) { return !!bk && L < bk.r && L + cw > bk.l && T < bk.b && T + ch > bk.t; }
    var best = null;
    for (var i = 0; i < order.length; i++) {
      var side = order[i], L, T;
      if (side === 'right') { L = x + d; T = cy(y - ch / 2); }
      else if (side === 'left') { L = x - d - cw; T = cy(y - ch / 2); }
      else if (side === 'below') { L = cx(x - cw / 2); T = y + d; }
      else { L = cx(x - cw / 2); T = y - d - ch; }
      // keep clear of the intro panel: slide down (beside the dot) or across (under or over it)
      if (hits(L, T)) {
        var vert = side === 'below' || side === 'above';
        var L2 = vert ? cx(bk.r) : L, T2 = vert ? T : cy(bk.b);
        if (!hits(L2, T2) && (vert ? (x > L2 + 18 && x < L2 + cw - 18) : (y > T2 + 18 && y < T2 + ch - 18))) { L = L2; T = T2; }
      }
      var over = Math.max(0, m - L) + Math.max(0, L + cw - W + m) + Math.max(0, m - T) + Math.max(0, T + ch - floor)
               + (hits(L, T) ? 400 : 0);
      if (!best || over < best.over) best = { side: side, L: L, T: T, over: over };
      if (!over) break;
    }
    var vertical = best.side === 'below' || best.side === 'above';
    var left = cx(best.L), top = cy(best.T);             // nothing fits (a tiny photo): pull it inside
    // the pointer on the card's edge lines up with the dot
    var caret = Math.max(18, Math.min(vertical ? x - left : y - top, (vertical ? cw : ch) - 18));
    card.setAttribute('data-side', best.side);
    card.style.left = Math.round(left - x) + 'px';
    card.style.top = Math.round(top - y) + 'px';
    card.style.setProperty('--caret', Math.round(caret) + 'px');
    // the card opens out of its pointer, so it seems to come from the dot
    card.style.transformOrigin = vertical ? Math.round(caret) + 'px ' + (best.side === 'below' ? '0' : '100%')
                                          : (best.side === 'right' ? '0 ' : '100% ') + Math.round(caret) + 'px';
  }

  // the dot and its chip show whether the card is open
  function mark(sp, on) {
    sp.querySelector('.aegis_look_dot').setAttribute('aria-expanded', on ? 'true' : 'false');
    var id = sp.querySelector('.aegis_look_card').id;
    for (var i = 0; i < chips.length; i++) {
      if (chips[i].getAttribute('aria-controls') !== id) continue;
      chips[i].setAttribute('aria-expanded', on ? 'true' : 'false');
      chips[i].classList.toggle('is-active', on);
    }
  }

  // how: 'hover' = a peek that closes when the pointer leaves, 'click' = stays until closed,
  // 'start' = the card open when the page loads (stays until the visitor uses the photo)
  // from: the dot or chip that opened it (focus goes back there on Escape)
  function show(sp, how, from) {
    clearTimeout(closeTimer);
    if (open && open !== sp) hide(open);
    sp.setAttribute('data-how', how);
    fit(sp);                                             // place it before it becomes visible
    sp.classList.add('is-open');
    mark(sp, true);
    open = sp;
    opener = from || sp.querySelector('.aegis_look_dot');
  }

  function hide(sp) {
    sp = sp || open;
    if (!sp) return;
    sp.classList.remove('is-open');
    mark(sp, false);
    if (open === sp) open = null;
  }

  // a click on a dot or chip: open and keep it open, pin a hover peek, or close
  function toggle(sp, from) {
    if (!sp.classList.contains('is-open')) show(sp, 'click', from);
    else if (sp.getAttribute('data-how') === 'hover') { sp.setAttribute('data-how', 'click'); opener = from; }
    else hide(sp);
  }

  function go(i) {
    hide();
    var hadFocus = scenes[current].contains(document.activeElement);
    current = (i + scenes.length) % scenes.length;
    for (var k = 0; k < scenes.length; k++) scenes[k].hidden = k !== current;
    // fetch the following photo in the background so the next click shows it straight away
    var upcoming = scenes[(current + 1) % scenes.length].querySelector('img');
    if (upcoming && upcoming.loading === 'lazy') upcoming.loading = 'eager';
    if (count) count.textContent = (current + 1) + ' / ' + scenes.length;
    place(scenes[current]);
    // keyboard users stay in the carousel: focus moves to the new photo's dot
    if (hadFocus) {
      var dot = scenes[current].querySelector('.aegis_look_spot:not([hidden]) .aegis_look_dot');
      (dot || next || root).focus();
    }
  }

  root.addEventListener('click', function (e) {
    var hot = e.target.closest('.aegis_look_dot, .aegis_look_chip');
    if (hot) {
      var sp = spotOf(hot);
      if (sp) toggle(sp, hot);
      return;
    }
    if (!e.target.closest('.aegis_look_card')) hide();
  });
  document.addEventListener('click', function (e) {
    // a click elsewhere on the page closes a card the visitor opened, not the one shown at the start
    if (open && !root.contains(e.target) && open.getAttribute('data-how') !== 'start') hide();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !open) return;
    var inside = root.contains(document.activeElement);
    if (!inside && open.getAttribute('data-how') === 'start') return;   // Escape somewhere else on the page
    var back = opener;
    hide();
    if (back && inside) back.focus();                  // keyboard users land back on their dot or tag
  });
  root.addEventListener('keydown', function (e) {
    if (scenes.length < 2) return;                          // one photo: arrows do nothing
    if (e.key === 'ArrowRight') go(current + 1);
    else if (e.key === 'ArrowLeft') go(current - 1);
  });
  if (canHover) {
    // hovering a dot or its chip peeks at the card; leaving both closes it again
    root.addEventListener('mouseover', function (e) {
      var hot = e.target.closest('.aegis_look_spot, .aegis_look_chip'), sp = spotOf(hot);
      if (!sp) return;
      if (!sp.classList.contains('is-open')) show(sp, 'hover', hot.classList.contains('aegis_look_chip') ? hot : null);
      else clearTimeout(closeTimer);
    });
    root.addEventListener('mouseout', function (e) {
      var hot = e.target.closest('.aegis_look_spot, .aegis_look_chip'), sp = spotOf(hot);
      if (!sp || hot.contains(e.relatedTarget) || sp.getAttribute('data-how') !== 'hover') return;
      var to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('.aegis_look_spot, .aegis_look_chip') : null;
      if (to && spotOf(to) === sp) return;                 // between a chip and its own dot or card
      clearTimeout(closeTimer);
      closeTimer = setTimeout(function () { hide(sp); }, 200);
    });
  }
  if (prev) prev.addEventListener('click', function () { go(current - 1); });
  if (next) next.addEventListener('click', function () { go(current + 1); });
  window.addEventListener('resize', function () { place(scenes[current]); });
  if ('ResizeObserver' in window) {
    var ro = new ResizeObserver(function () { place(scenes[current]); });
    ro.observe(stage);
    if (intro) ro.observe(intro);
    // cards change size when the web font arrives: keep the open one placed
    var cards = root.querySelectorAll('.aegis_look_card');
    for (var c = 0; c < cards.length; c++) ro.observe(cards[c]);
  }
  // the first time most of the photo is on screen, the dots ripple twice to show they do something
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      root.classList.add('is-hinting');
      setTimeout(function () { root.classList.remove('is-hinting'); }, 3400);
    }, { threshold: 0.5 });
    io.observe(stage);
  }

  root.classList.add('is-ready');
  go(0);
  // one card starts open, so visitors see straight away what the dots do
  var first = scenes[current].querySelector('.aegis_look_spot[data-open]');
  if (first && !first.hidden) { show(first, 'start'); opener = null; }
})();
