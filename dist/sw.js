if (!self.define) {
  let e,
    i = {};
  const s = (s, n) => (
    (s = new URL(s + ".js", n).href),
    i[s] ||
      new Promise((i) => {
        if ("document" in self) {
          const e = document.createElement("script");
          ((e.src = s), (e.onload = i), document.head.appendChild(e));
        } else ((e = s), importScripts(s), i());
      }).then(() => {
        let e = i[s];
        if (!e) throw new Error(`Module ${s} didn’t register its module`);
        return e;
      })
  );
  self.define = (n, r) => {
    const c =
      e ||
      ("document" in self ? document.currentScript.src : "") ||
      location.href;
    if (i[c]) return;
    let o = {};
    const l = (e) => s(e, c),
      t = { module: { uri: c }, exports: o, require: l };
    i[c] = Promise.all(n.map((e) => t[e] || l(e))).then((e) => (r(...e), o));
  };
}
define(["./workbox-8c29f6e4"], function (e) {
  "use strict";
  (self.skipWaiting(),
    e.clientsClaim(),
    e.precacheAndRoute(
      [
        { url: "vite.svg", revision: "8e3a10e157f75ada21ab742c022d5430" },
        { url: "registerSW.js", revision: "1872c500de691dce40960bb85481de07" },
        { url: "index.html", revision: "da5188b0875c14454f1cab98075e1af9" },
        {
          url: "icon-512x512.png",
          revision: "58078a1930c3ea178745f621d1e777de",
        },
        {
          url: "icon-512x512.png",
          revision: "104bb5c3f1fec39de1b3ddc94f24b683",
        },
        {
          url: "icon-192x192.png",
          revision: "be7cfbf8e6252c968726465fbacd9c37",
        },
        {
          url: "icon-192x192.png",
          revision: "2fb569c3b7410b84a0d3c73bd44cdbea",
        },
        { url: "assets/secp256k1-Cao5Swmf.wasm", revision: null },
        { url: "assets/qr-scanner.min-W51h4E4H.js", revision: null },
        { url: "assets/qr-scanner-worker.min-D85Z9gVD.js", revision: null },
        { url: "assets/index-p9EmEalJ.css", revision: null },
        { url: "assets/index-DDp44Llb.js", revision: null },
        {
          url: "icon-192x192.png",
          revision: "2fb569c3b7410b84a0d3c73bd44cdbea",
        },
        {
          url: "icon-512x512.png",
          revision: "104bb5c3f1fec39de1b3ddc94f24b683",
        },
        {
          url: "manifest.webmanifest",
          revision: "4c75b2e4632149aff6a0c865416498a1",
        },
      ],
      {},
    ),
    e.cleanupOutdatedCaches(),
    e.registerRoute(
      new e.NavigationRoute(e.createHandlerBoundToURL("index.html")),
    ));
});
