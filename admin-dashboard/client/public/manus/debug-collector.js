/**
 * Manus Debug Collector (browser-side)
 *
 * Intercepts console logs and network requests, then periodically
 * flushes them to the Vite dev server via POST /__manus__/logs.
 * Only active in development.
 */
(function () {
  if (typeof window === "undefined") return;

  const FLUSH_INTERVAL = 5000;
  const ENDPOINT = "/__manus__/logs";

  let consoleLogs = [];
  let networkRequests = [];

  // --- Console interception ---
  const origConsole = {};
  ["log", "warn", "error", "info", "debug"].forEach(function (level) {
    origConsole[level] = console[level];
    console[level] = function () {
      const args = Array.prototype.slice.call(arguments);
      consoleLogs.push({
        level: level,
        args: args.map(function (a) {
          try {
            return typeof a === "object" ? JSON.stringify(a) : String(a);
          } catch (_) {
            return "[unserializable]";
          }
        }),
        ts: Date.now(),
      });
      origConsole[level].apply(console, arguments);
    };
  });

  // --- Network interception (fetch) ---
  var origFetch = window.fetch;
  window.fetch = function () {
    var url = arguments[0];
    var opts = arguments[1] || {};
    var method = (opts.method || "GET").toUpperCase();
    var start = Date.now();

    return origFetch.apply(window, arguments).then(
      function (res) {
        networkRequests.push({
          url: typeof url === "string" ? url : url.url,
          method: method,
          status: res.status,
          durationMs: Date.now() - start,
          ts: start,
        });
        return res;
      },
      function (err) {
        networkRequests.push({
          url: typeof url === "string" ? url : url.url,
          method: method,
          status: 0,
          error: err.message,
          durationMs: Date.now() - start,
          ts: start,
        });
        throw err;
      }
    );
  };

  // --- Flush ---
  function flush() {
    if (consoleLogs.length === 0 && networkRequests.length === 0) return;

    var payload = {
      consoleLogs: consoleLogs.splice(0),
      networkRequests: networkRequests.splice(0),
    };

    origFetch
      .call(window, ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      .catch(function () {
        /* ignore flush errors */
      });
  }

  setInterval(flush, FLUSH_INTERVAL);
  window.addEventListener("beforeunload", flush);
})();
