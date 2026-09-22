// Returns 410 Gone for the 303 hacked-WordPress spam URLs and the old theme
// demo pages. vercel.json `redirects` only supports 3xx, so anything that
// should read as permanently removed is rewritten here instead.
// 410 de-indexes noticeably faster than a plain 404.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(410).send('410 Gone — this page was removed.');
}
