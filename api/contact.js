// Website enquiries. The forms on the homepage and the Contact page post here (assets/aegis-site.js).
// Each enquiry becomes one email to enquiry@aegismarketing.com.my with a copy to the owner, sent through
// Aegis's own mail server from the web@aegismarketing.com.my mailbox, so it arrives like a normal email and
// "Reply" goes straight to the customer.
//
// One setting is needed in Vercel (Project > Settings > Environment Variables):
//   SMTP_PASS  the password of web@aegismarketing.com.my
// Optional overrides: SMTP_HOST, SMTP_PORT, SMTP_USER, MAIL_TO, MAIL_CC.
// No packages: the mail is sent with Node's own TLS socket.
import tls from 'node:tls';
import crypto from 'node:crypto';

const CFG = {
  host: process.env.SMTP_HOST || 'mail.aegismarketing.com.my',
  port: Number(process.env.SMTP_PORT || 465),
  user: process.env.SMTP_USER || 'web@aegismarketing.com.my',
  pass: process.env.SMTP_PASS || '',
  to: process.env.MAIL_TO || 'enquiry@aegismarketing.com.my',
  cc: process.env.MAIL_CC === undefined ? 'mh_koo@yahoo.com' : process.env.MAIL_CC,
};
// pages allowed to send: the site itself, this project's Vercel previews, and a local preview
const SITES = /^https?:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|(www\.)?aegismarketing\.com\.my|aegis\.gotka\.com|aegis-website[a-z0-9-]*\.vercel\.app)$/i;
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

const clean = (v, max) => String(v == null ? '' : v)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const oneLine = (v, max) => clean(v, max).replace(/\s+/g, ' ');
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');

// a header value that may hold any language: RFC 2047 encoded words, split so no word breaks a character
function headerText(s) {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const words = []; let chunk = '';
  for (const ch of s) {
    if (Buffer.byteLength(chunk + ch, 'utf8') > 45) { words.push(chunk); chunk = ''; }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ');
}

function message(f, sentAt) {
  const rows = [['Name', f.name], ['Email', f.email], ['Phone', f.phone], ['Product', f.product],
    ['Quantity', f.quantity], ['Details', f.details], ['Sent from', f.page]].filter(([, v]) => v);
  const when = sentAt.toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' });
  const text = `New enquiry from the website (${when}, Malaysia time)\n\n`
    + rows.map(([k, v]) => `${k}: ${v}`).join('\n')
    + `\n\nReply to this email to answer ${f.name} directly.\n`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111">`
    + `<p style="margin:0 0 14px">New enquiry from the website <span style="color:#666">(${esc(when)}, Malaysia time)</span></p>`
    + `<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #ddd">`
    + rows.map(([k, v]) => `<tr><td style="background:#f4f7ee;border:1px solid #ddd;font-weight:bold;vertical-align:top;white-space:nowrap">${esc(k)}</td>`
      + `<td style="border:1px solid #ddd;white-space:pre-wrap">${esc(v)}</td></tr>`).join('')
    + `</table><p style="margin:14px 0 0;color:#666">Reply to this email to answer ${esc(f.name)} directly.</p></div>`;
  const boundary = 'aegis-' + crypto.randomBytes(12).toString('hex');
  const subject = `Website enquiry: ${f.product || 'General'} from ${f.name}`;
  const headers = [
    'From: Aegis Marketing Website <' + CFG.user + '>',
    'To: ' + CFG.to,
    ...(CFG.cc ? ['Cc: ' + CFG.cc] : []),
    'Reply-To: ' + f.email,
    'Subject: ' + headerText(subject),
    'Date: ' + sentAt.toUTCString().replace('GMT', '+0000'),
    'Message-ID: <' + crypto.randomUUID() + '@aegismarketing.com.my>',
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  return headers.join('\r\n') + '\r\n\r\n'
    + `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(text)}`
    + `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(html)}`
    + `--${boundary}--\r\n`;
}

// a small SMTP client (implicit TLS, AUTH PLAIN), enough for one message
function smtpSend({ from, rcpts, data }) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host: CFG.host, port: CFG.port, servername: CFG.host });
    sock.setTimeout(8000);
    let buf = '', finished = false;
    const waiting = [];
    const fail = (err) => { if (!finished) { finished = true; sock.destroy(); reject(err); } };
    sock.on('timeout', () => fail(new Error('SMTP timeout')));
    sock.on('error', fail);
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let m;
      while ((m = buf.match(/^(?:\d{3}-[^\n]*\n)*(\d{3})(?!-)[^\n]*\n/))) {   // a whole (multi-line) reply
        buf = buf.slice(m[0].length);
        const next = waiting.shift();
        if (next) next(Number(m[1]), m[0]);
      }
    });
    const expect = (codes) => new Promise((ok, no) => waiting.push((code, reply) =>
      (codes.includes(code) ? ok(reply) : no(new Error('SMTP ' + reply.trim().split('\n').pop())))));
    const cmd = (line, codes) => { const p = expect(codes); sock.write(line + '\r\n'); return p; };
    const greeting = expect([220]);                     // queued before any data can arrive
    (async () => {
      await greeting;
      await cmd('EHLO aegismarketing.com.my', [250]);
      await cmd('AUTH PLAIN ' + Buffer.from(`\0${CFG.user}\0${CFG.pass}`).toString('base64'), [235]);
      await cmd(`MAIL FROM:<${from}>`, [250]);
      for (const r of rcpts) await cmd(`RCPT TO:<${r}>`, [250, 251]);
      await cmd('DATA', [354]);
      await cmd(data.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..') + '\r\n.', [250]);
      finished = true;
      sock.write('QUIT\r\n');
      sock.end();
      resolve();
    })().catch(fail);
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method' });
  }
  // browsers always say which page is posting; scripts calling this address directly usually do not
  if (!SITES.test(req.headers.origin || '')) return res.status(403).json({ ok: false, error: 'origin' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body || typeof body !== 'object') body = {};

  // bots: a filled hidden field, or a form sent within 2.5 seconds of opening the page. Say OK, send nothing.
  if (oneLine(body.hp, 200) || !(Number(body.t) >= 2500)) return res.status(200).json({ ok: true });

  const f = {
    name: oneLine(body.name, 120), email: oneLine(body.email, 200), phone: oneLine(body.phone, 40),
    product: oneLine(body.product, 120), quantity: oneLine(body.quantity, 80), details: clean(body.details, 5000),
    page: oneLine(body.page, 200),
  };
  if (!f.name || !EMAIL.test(f.email)) return res.status(400).json({ ok: false, error: 'invalid' });
  if (!CFG.pass) {
    console.error('contact: SMTP_PASS is not set in Vercel');
    return res.status(503).json({ ok: false, error: 'not_configured' });
  }
  try {
    await smtpSend({ from: CFG.user, rcpts: [CFG.to, ...(CFG.cc ? [CFG.cc] : [])], data: message(f, new Date()) });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('contact: sending failed:', err.message);
    return res.status(502).json({ ok: false, error: 'send_failed' });
  }
}
