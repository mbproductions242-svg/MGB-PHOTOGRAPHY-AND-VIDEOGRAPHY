// public/js/pwa.js — registers the service worker so the site qualifies as
// an installable ("Add to Home Screen") app. Safe no-op in browsers/contexts
// without service worker support.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installability is a nice-to-have, not required for the site to work —
      // fail silently so a blocked/unsupported SW never breaks the page.
    });
  });
}
