/* Aegis: product hotspots on the homepage pictures (IKEA style). No dependencies.
   Markup and styles: .build/build_home_look.py writes the section into index.html and the
   "aegis-look" block into assets/aegis.css. Each dot sits on a point of the picture given as a
   fraction of its width and height (data-x, data-y). On laptops the picture fills the frame (the
   same maths as object-fit: cover), so a dot stays on its product at every screen size. When the
   frame is narrower than the picture (phones, tablets), the picture keeps its full width and can be
   swiped sideways instead of being cut off, so every dot stays and none of them crowd. */
(function () {
  'use strict';
  var root = document.querySelector('.aegis_look');
  if (!root) return;
  var stage = root.querySelector('.aegis_look_stage');
  var scroller = root.querySelector('.aegis_look_scroller') || stage;
  var scenes = Array.prototype.slice.call(root.querySelectorAll('.aegis_look_scene'));
  var tabs = Array.prototype.slice.call(root.querySelectorAll('.aegis_look_tab'));
  var intro = root.querySelector('.aegis_look_intro');
  var chips = Array.prototype.slice.call(root.querySelectorAll('.aegis_look_chip'));
  var canHover = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  var current = 0, open = null, opener = null, closeTimer = null, pan = false, seen = false;
  var hinted = [];
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

  function num(el, name, fallback) {
    var v = parseFloat(el.getAttribute(name));
    return isNaN(v) ? fallback : v;
  }

  // what part of the picture is on screen (in the picture's own coordinates when it can be swiped)
  function view() {
    return { left: pan ? scroller.scrollLeft : 0, W: stage.clientWidth, H: stage.clientHeight };
  }

  function place(scene) {
    var W = stage.clientWidth, H = stage.clientHeight;
    if (!W || !H) return;
    root.classList.toggle('aegis_look_narrow', W < 560);
    var w = num(scene, 'data-w', 1), h = num(scene, 'data-h', 1);
    var fx = num(scene, 'data-fx', 0.5), fy = num(scene, 'data-fy', 0.5);
    var wide = H * w / h;                                  // the picture's width at the frame's height
    var was = pan;
    pan = wide > W * 1.02;
    root.classList.toggle('aegis_look_pan', pan);
    var dw, dh, ox, oy, sw;
    if (pan) {                                             // the whole picture, swiped sideways
      dw = wide; dh = H; ox = 0; oy = 0; sw = dw;
      scene.style.width = Math.round(dw) + 'px';
    } else {                                               // cover: fills the frame, cut where it overflows
      var s = Math.max(W / w, H / h);
      dw = w * s; dh = h * s; ox = (W - dw) * fx; oy = (H - dh) * fy; sw = W;
      scene.style.width = '';
      scroller.scrollLeft = 0;
    }
    var edge = 20;
    var spots = scene.querySelectorAll('.aegis_look_spot');
    for (var i = 0; i < spots.length; i++) {
      var sp = spots[i];
      var x = ox + num(sp, 'data-x', 0.5) * dw, y = oy + num(sp, 'data-y', 0.5) * dh;
      sp.hidden = !(x >= edge && x <= sw - edge && y >= edge && y <= H - edge);   // cut off at this size
      sp.style.left = x.toFixed(1) + 'px';
      sp.style.top = y.toFixed(1) + 'px';
    }
    if (pan && !was) centre(scene);
    if (open) fit(open);
  }

  // swipeable picture: show the part with the open card's dot, or else the middle
  function centre(scene) {
    if (!pan) return;
    var W = stage.clientWidth, sw = scene.offsetWidth;
    var target = scene.querySelector('.aegis_look_spot.is-open') || scene.querySelector('.aegis_look_spot[data-open]');
    var x = target ? parseFloat(target.style.left) : sw / 2;
    scroller.scrollLeft = Math.max(0, Math.min(sw - W, x - W / 2));
  }

  // Where the card goes: beside its dot on wide pictures (the side with room), under or over it on
  // narrow ones, always inside the part of the picture on screen and, on phones, clear of the floating
  // WhatsApp button. Works from layout sizes, so the opening animation cannot throw it off.
  function fit(sp) {
    var card = sp.querySelector('.aegis_look_card'), dot = sp.querySelector('.aegis_look_dot');
    var v = view(), W = v.W, H = v.H, narrow = W < 560, m = 12;
    var x = parseFloat(sp.style.left) || 0, y = parseFloat(sp.style.top) || 0;
    var cw = card.offsetWidth, ch = card.offsetHeight;
    var d = dot.offsetWidth * 0.56 + 12;                 // dot centre to card edge (the dot grows when open)
    var floor = H - (narrow ? 64 : m);
    var lo = v.left + m, hi = v.left + W - m;            // left and right edges of what is on screen
    var pref = sp.getAttribute('data-side') || (x - v.left < W * 0.6 ? 'right' : 'left');
    var order = narrow ? ['below', 'above'] : [pref, pref === 'right' ? 'left' : 'right', 'below', 'above'];
    function cx(val) { return Math.max(lo, Math.min(val, hi - cw)); }
    function cy(val) { return Math.max(m, Math.min(val, floor - ch)); }
    var best = null;
    for (var i = 0; i < order.length; i++) {
      var side = order[i], L, T;
      if (side === 'right') { L = x + d; T = cy(y - ch / 2); }
      else if (side === 'left') { L = x - d - cw; T = cy(y - ch / 2); }
      else if (side === 'below') { L = cx(x - cw / 2); T = y + d; }
      else { L = cx(x - cw / 2); T = y - d - ch; }
      var over = Math.max(0, lo - L) + Math.max(0, L + cw - hi) + Math.max(0, m - T) + Math.max(0, T + ch - floor);
      if (!best || over < best.over) best = { side: side, L: L, T: T, over: over };
      if (!over) break;
    }
    var vertical = best.side === 'below' || best.side === 'above';
    var left = cx(best.L), top = cy(best.T);             // nothing fits (a tiny picture): pull it inside
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
  // 'start' = the card open when the page loads (stays until the visitor uses the picture)
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

  // the dots ripple the first time each picture is on screen
  function hint() {
    if (!seen || hinted[current]) return;
    hinted[current] = true;
    root.classList.remove('is-hinting');
    void root.offsetWidth;                               // restart the animation
    root.classList.add('is-hinting');
    clearTimeout(hint.t);
    hint.t = setTimeout(function () { root.classList.remove('is-hinting'); }, 3600);
  }

  function go(i) {
    hide();
    current = (i + scenes.length) % scenes.length;
    for (var k = 0; k < scenes.length; k++) scenes[k].hidden = k !== current;
    for (var t = 0; t < tabs.length; t++) {
      tabs[t].setAttribute('aria-selected', t === current ? 'true' : 'false');
      tabs[t].tabIndex = t === current ? 0 : -1;
    }
    // fetch the other picture in the background so switching shows it straight away
    for (var n = 0; n < scenes.length; n++) {
      var im = scenes[n].querySelector('img');
      if (im && n !== current && im.loading === 'lazy') im.loading = 'eager';
    }
    pan = false;                                         // work it out again for this picture
    place(scenes[current]);
    centre(scenes[current]);
    hint();
  }

  root.addEventListener('click', function (e) {
    var tab = e.target.closest('.aegis_look_tab');
    if (tab) { go(tabs.indexOf(tab)); return; }
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
    if (back && inside) back.focus();                  // keyboard users land back on their dot or chip
  });
  // tabs: arrow keys move between them (and show that picture), Home and End jump to the ends
  if (tabs.length) {
    tabs[0].parentNode.addEventListener('keydown', function (e) {
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0
             : e.key === 'End' ? tabs.length - 1 : null;
      if (to === null) return;
      e.preventDefault();
      to = (to + tabs.length) % tabs.length;
      go(to);
      tabs[to].focus();
    });
  }
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
  // swiping the picture: the open card follows, and closes once its dot has left the screen
  var ticking = false;
  scroller.addEventListener('scroll', function () {
    if (!pan || !open || ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      if (!open) return;
      var v = view(), x = parseFloat(open.style.left) || 0;
      if (x < v.left + 8 || x > v.left + v.W - 8) hide();
      else fit(open);
    });
  }, { passive: true });
  window.addEventListener('resize', function () { place(scenes[current]); });
  if ('ResizeObserver' in window) {
    var ro = new ResizeObserver(function () { place(scenes[current]); });
    ro.observe(stage);
    // cards change size when the web font arrives: keep the open one placed
    var cards = root.querySelectorAll('.aegis_look_card');
    for (var c = 0; c < cards.length; c++) ro.observe(cards[c]);
  }
  // the first time most of the picture is on screen, the dots ripple twice to show they do something
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      seen = true;
      hint();
    }, { threshold: 0.5 });
    io.observe(stage);
  }

  root.classList.add('is-ready');
  go(0);
  // one card starts open, so visitors see straight away what the dots do. Not on phones: there the open card
  // covered the dots beside it, too close to tap; the dots' ripple shows what they do instead
  var phone = !!(window.matchMedia && window.matchMedia('(max-width: 767px)').matches);
  var first = phone ? null : scenes[current].querySelector('.aegis_look_spot[data-open]');
  if (first && !first.hidden) { show(first, 'start'); opener = null; centre(scenes[current]); }
})();
