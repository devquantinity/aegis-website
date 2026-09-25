/* Aegis: behaviour shared by every page (added by .build/build_chrome.py). No dependencies.
   1. Header: turns solid green once the page is scrolled (it stays pinned to the top on every screen).
      The Products menu on laptops closes with Escape and opens with a first tap on touch screens.
   2. Enquiry forms (form.contact_form on the homepage and the Contact page): sent to /api/contact, which
      emails enquiry@ with a copy to the owner. If sending fails, the visitor gets a WhatsApp link with
      their details already filled in, so no enquiry is lost. */
(function () {
  'use strict';
  var WA = 'https://wa.me/60126088268';

  var nav = document.querySelector('.navbar');
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('aegis-scrolled', (window.scrollY || document.documentElement.scrollTop) > 60);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
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
})();
