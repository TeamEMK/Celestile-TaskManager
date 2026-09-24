// Shared http(s)-only URL guard. A free-text "URL" field that gets rendered
// later as `<a href>` or passed to `window.open` must never carry a
// `javascript:` (or other non-http) scheme — anyone who can save that field
// could otherwise plant a link that runs script in whoever opens it.
export function isHttpUrl(v) {
  return /^https?:\/\//i.test(String(v || '').trim());
}
