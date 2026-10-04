/* Aegis: behaviour shared by every page (added by .build/build_chrome.py). No dependencies.
   1. Header: turns solid green once the page is scrolled (it stays pinned to the top on every screen).
      The Products menu on laptops closes with Escape and opens with a first tap on touch screens.
   2. Enquiry forms (form.contact_form on the homepage and the Contact page): sent to /api/contact, which
      emails enquiry@ with a copy to the owner. If sending fails, the visitor gets a WhatsApp link with
      their details already filled in, so no enquiry is lost.
   3. Videos marked data-aegis-autoplay (by .build/build_speed.py) load and play only once they are nearly on
      screen, and the homepage's top video (also data-aegis-after-load) only once the page has finished
      loading, so its 2 MB never holds up the first view: until then its still picture shows. With
      "reduce motion" on, they keep their still picture. A video's play / pause button (the Contact
      page's, written by .build/build_a11y.py) follows the video: nothing shows while it plays, a play
      button while it is stopped. The homepage's top video takes its still picture as its poster, so that
      starting to play is not counted as a new, later "largest picture" (see below).
   4. Once the page has loaded and its first screen has really been drawn: pictures marked data-aegis-src get
      their picture, the homepage's sections below the first screen, left undrawn on a first visit
      (html.aegis-quick), are drawn, and then scripts marked type="aegis/late" run (in their order).
      build_speed.py marks all of these on the homepage, so the first screen gets the phone's whole connection.
   Nothing here measures the page before it has been drawn (see drawn below). */
(function () {
  'use strict';
  var WA = 'https://wa.me/60126088268';

  // Run fn once the page has been drawn. Reading a size or the scroll position before the first paint makes the
  // browser lay the whole page out there and then: a long pause before anything shows (PageSpeed: "forced reflow").
  var drawn = function (fn) {
    if (window.requestAnimationFrame) window.requestAnimationFrame(function () { setTimeout(fn, 0); });
    else setTimeout(fn, 0);
  };

  var nav = document.querySelector('.navbar');
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('aegis-scrolled', (window.scrollY || document.documentElement.scrollTop) > 60);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    drawn(onScroll);                              // a page opened part-way down (a reload, a link to a section)
  }

  // Products menu on laptops (the panel itself opens with CSS on hover and keyboard focus):
  // Escape closes it, and on touch screens the first tap on Products opens it instead of leaving the page
  var sub = document.querySelector('.aegis_has_sub');
  var mq = function (q) { return window.matchMedia ? window.matchMedia(q).matches : false; };
  if (sub) {
    var top = sub.querySelector('.nav_link');
    var shut = function () { sub.classList.remove('is-open'); };
    sub.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && mq('(min-width: 992px)')) {
        shut();
        sub.classList.add('is-closed');
        if (top && document.activeElement !== top) top.focus();
      }
    });
    sub.addEventListener('mouseleave', function () { sub.classList.remove('is-closed'); });
    sub.addEventListener('focusout', function (e) {
      if (!e.relatedTarget || !sub.contains(e.relatedTarget)) { sub.classList.remove('is-closed'); shut(); }
    });
    if (top) top.addEventListener('click', function (e) {
      if (mq('(min-width: 992px)') && mq('(hover: none)') && !sub.classList.contains('is-open')) {
        e.preventDefault();
        sub.classList.remove('is-closed');
        sub.classList.add('is-open');
      }
    });
    document.addEventListener('click', function (e) { if (!sub.contains(e.target)) shut(); });
  }

  var opened = Date.now();

  function field(form, sel) {
    var el = form.querySelector(sel);
    if (!el) return '';
    if (el.tagName === 'SELECT') {                      // the option's words, not its value
      var o = el.options[el.selectedIndex];
      return el.value === '' || !o ? '' : o.text.trim();
    }
    return (el.value || '').trim();
  }

  function collect(form) {
    var hp = form.querySelector('input.aegis_hp');
    return {
      product: field(form, '#Service-Type'), quantity: field(form, '#Budget'),
      name: field(form, '#name-2'), email: field(form, '#Email'), phone: field(form, '#Phone'),
      details: field(form, '#field'), page: location.pathname, hp: hp ? hp.value : '',
      t: Date.now() - opened
    };
  }

  function waLink(d) {
    var lines = ['Hi Aegis Marketing, I would like a quotation.'];
    if (d.product) lines.push('Product: ' + d.product);
    if (d.quantity) lines.push('Quantity: ' + d.quantity);
    if (d.name) lines.push('Name: ' + d.name);
    if (d.phone) lines.push('Phone: ' + d.phone);
    if (d.email) lines.push('Email: ' + d.email);
    if (d.details) lines.push('Details: ' + d.details);
    return WA + '?text=' + encodeURIComponent(lines.join('\n'));
  }

  function setButton(form, label) {
    var texts = form.querySelectorAll('.secondary_button .button_text');
    for (var i = 0; i < texts.length; i++) texts[i].textContent = label;
  }

  function send(form) {
    if (form.getAttribute('aria-busy') === 'true') return;
    if (form.reportValidity && !form.reportValidity()) return;
    var block = form.closest('.w-form');
    var done = block && block.querySelector('.w-form-done');
    var fail = block && block.querySelector('.w-form-fail');
    var d = collect(form);
    form.setAttribute('aria-busy', 'true');
    setButton(form, 'Sending…');
    if (fail) fail.style.display = 'none';

    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    fetch('/api/contact', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d), signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (!r.ok || !b.ok) throw new Error(r.status === 400 ? 'invalid' : 'send failed');
      });
    }).then(function () {
      form.style.display = 'none';
      if (done) {
        done.innerHTML = '<div>Thank you! We have received your enquiry and will reply within one working day.</div>';
        done.setAttribute('role', 'status');
        done.setAttribute('tabindex', '-1');
        done.style.display = 'block';
        done.focus({ preventScroll: true });
      }
    }).catch(function (err) {
      if (fail) {
        fail.innerHTML = err && err.message === 'invalid'
          ? '<div>Please check your name and email address, then send again.</div>'
          : '<div>Sorry, your enquiry could not be sent. Please try again, or '
            + '<a href="' + waLink(d) + '" target="_blank" rel="noopener">send it on WhatsApp</a> instead.</div>';
        fail.setAttribute('role', 'alert');
        fail.style.display = 'block';
      }
    }).then(function () {
      clearTimeout(timer);
      form.removeAttribute('aria-busy');
      setButton(form, 'Send Enquiry');
    });
  }

  var forms = document.querySelectorAll('form.contact_form');
  for (var i = 0; i < forms.length; i++) {
    (function (form) {
      if (!form.querySelector('input.aegis_hp')) {   // hidden from people, filled in by spam bots
        var hp = document.createElement('input');     // (a name browsers do not autofill, so real visitors leave it empty)
        hp.type = 'text'; hp.name = 'aegis_hp'; hp.tabIndex = -1; hp.autocomplete = 'off';
        hp.className = 'aegis_hp'; hp.setAttribute('aria-hidden', 'true');
        form.appendChild(hp);
      }
      var btn = form.querySelector('.secondary_button');
      if (btn) btn.addEventListener('click', function (e) { e.preventDefault(); send(form); });
    })(forms[i]);
  }
  // catch the submit (Enter key) before Webflow's own form handler, which cannot send from this host
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form.matches || !form.matches('form.contact_form')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    send(form);
  }, true);

  // 3. videos: further down a page, or the homepage's top one once the page has loaded
  // The homepage's top video lies over its still picture (an <img>, so a phone can take a small file). Browsers
  // and Google time a page by when its largest picture shows. The video's first frame, a hair larger than the
  // still, counted as a new largest picture, seconds late. As the video's own poster the still shows in the video
  // from the start (the same file, already loaded), so the first frame adds nothing new.
  var pic = document.querySelector('.aegis_hero_still');
  var over = pic && pic.parentNode.querySelector('video');
  if (over) {
    var poster = function () {
      if (!over.getAttribute('poster') && pic.currentSrc) over.setAttribute('poster', pic.currentSrc);
    };
    if (pic.complete && pic.naturalWidth) poster(); else pic.addEventListener('load', poster);
  }
  var vids = document.querySelectorAll('video[data-aegis-autoplay]');
  var still = function () { return mq('(prefers-reduced-motion: reduce)'); };
  var sync = function (v) {                     // the video's button, if it has one, says what the video is doing
    var btn = v.id && document.querySelector('.aegis_video_toggle[aria-controls="' + v.id + '"]');
    if (!btn) return;
    btn.classList.toggle('is-paused', v.paused);
    btn.setAttribute('aria-label', v.paused ? 'Play video' : 'Pause video');
  };
  var play = function (v) {
    var p = v.play();
    if (p && p.catch) p.catch(function () { sync(v); });   // refused (a phone saving power): the play button shows
  };
  var start = function (v) {
    if (still()) return;
    v.autoplay = true;                          // Webflow's own "reduce motion" switch plays only autoplay videos
    play(v);
  };
  // the whole video is its button. It follows the video's own play and pause events, so it is right whoever
  // starts or stops the video: this script, a click, the browser, or Webflow's "reduce motion" switch
  Array.prototype.forEach.call(document.querySelectorAll('.aegis_video_toggle'), function (btn) {
    var v = document.getElementById(btn.getAttribute('aria-controls'));
    if (!v) return;
    var follow = function () { sync(v); };
    v.addEventListener('play', follow);
    v.addEventListener('pause', follow);
    btn.addEventListener('click', function () { if (v.paused) play(v); else v.pause(); });
    if (still()) sync(v);                       // it will not start by itself, so its play button shows from the start
  });
  var go = function (v) {
    if (!v.hasAttribute('data-aegis-after-load') || document.readyState === 'complete') { start(v); return; }
    window.addEventListener('load', function () { setTimeout(function () { start(v); }, 200); });
  };
  if (vids.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { io.unobserve(en.target); go(en.target); }
      });
    }, { rootMargin: '300px 0px' });
    Array.prototype.forEach.call(vids, function (v) { io.observe(v); });
  } else {
    Array.prototype.forEach.call(vids, go);
  }

  // 4. what waits until the first screen has been drawn
  // On a first visit the homepage's sections below the first screen start undrawn (build_speed.py: "quick"), so
  // the first screen shows sooner. They are drawn here one at a time, in the browser's idle moments, straight
  // after it. A visitor who is already using the page gets all of them at once, so a link to a section further
  // down lands in the right place.
  var quick = document.documentElement.classList.contains('aegis-quick');
  var rest = null;
  var undrawn = function () {                     // whichever sections the styles left undrawn, top to bottom
    if (!rest) {                                  // (looked up when first needed, which is after the first paint)
      rest = !quick ? [] : Array.prototype.filter.call(document.querySelectorAll('section'), function (el) {
        return window.getComputedStyle(el).contentVisibility === 'auto';
      });
    }
    return rest;
  };
  var showAll = function () {
    var list = undrawn();
    while (list.length) list.shift().classList.add('aegis_shown');
  };
  var scripts = function () {                     // the template's scripts, once the whole page is drawn
    Array.prototype.forEach.call(document.querySelectorAll('script[type="aegis/late"]'), function (old) {
      var js = document.createElement('script');
      js.src = old.src;
      js.async = false;                             // in their order: jQuery first
      old.parentNode.replaceChild(js, old);
    });
  };
  var showNext = function () {
    var list = undrawn();
    if (!list.length) { scripts(); return; }
    list.shift().classList.add('aegis_shown');
    if (window.requestIdleCallback) window.requestIdleCallback(showNext, { timeout: 300 });
    else setTimeout(showNext, 50);
  };
  var ran = false;
  var later = function () {
    if (ran) return;
    ran = true;
    Array.prototype.forEach.call(document.querySelectorAll('img[data-aegis-src]'), function (img) {
      var set = img.getAttribute('data-aegis-srcset');
      if (set) img.setAttribute('srcset', set);
      img.setAttribute('src', img.getAttribute('data-aegis-src'));
      img.removeAttribute('data-aegis-srcset');
      img.removeAttribute('data-aegis-src');
    });
    showNext();                                   // the sections one by one, then the scripts
  };
  if (quick || document.querySelector('script[type="aegis/late"], img[data-aegis-src]')) {
    // Loaded is not always drawn: Google's test (PageSpeed) sometimes shows the first screen a second or two after
    // the page has loaded, and counts everything fetched before that against it. So wait until the browser reports
    // the first paint, then one more frame for the top picture.
    var loaded = function () {
      var next = function () { drawn(function () { setTimeout(later, 60); }); };
      var seen = true, po;
      try {
        if (window.PerformanceObserver && (PerformanceObserver.supportedEntryTypes || []).indexOf('paint') >= 0) {
          seen = performance.getEntriesByName('first-contentful-paint').length > 0;
          if (!seen) {
            po = new PerformanceObserver(function (list) {
              if (!list.getEntriesByName('first-contentful-paint').length) return;
              po.disconnect();
              next();
            });
            po.observe({ type: 'paint', buffered: true });
          }
        }
      } catch (e) { seen = true; }
      if (seen) next();
      // whatever happens (a tab opened in the background is never drawn, and a search engine reading the page may
      // not report a paint at all); Google's test, when it shows the page late, does so within about two seconds
      setTimeout(later, 3000);
    };
    if (document.readyState === 'complete') loaded(); else window.addEventListener('load', loaded);
    // A visitor who is already using the page gets everything straight away. If the page has been moved before the
    // sections above were drawn (a jump to a section, a search hit), what is on screen stays where it is while they
    // take their full height.
    var now = function () {
      if (undrawn().length) {
        var id = location.hash.slice(1), target = null;
        try { target = id ? document.getElementById(decodeURIComponent(id)) : null; } catch (e) {}
        var mark = target ? null : document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        var was = mark ? mark.getBoundingClientRect().top : 0;
        showAll();
        if (target) target.scrollIntoView();          // a jump to a section: go there again, now that all is drawn
        else if (mark) {
          // (rounded up: the browser then keeps holding on to the same thing at the top of the screen as before)
          var moved = Math.ceil(mark.getBoundingClientRect().top - was);
          if (moved) window.scrollBy(0, moved);
        }
      }
      later();
      scripts();
    };
    ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (type) {
      window.addEventListener(type, now, { capture: true, passive: true, once: true });
    });
    window.addEventListener('scroll', now, { passive: true, once: true });
    window.addEventListener('hashchange', now, { once: true });
    if (quick && location.hash) now();              // a jump made before this script ran
  }
})();
