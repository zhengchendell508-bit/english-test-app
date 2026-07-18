const CACHE = "english-test-parent-admin-v5";
const ASSETS = [
  "./","./index.html","./parent.html","./children.html","./student.html","./admin.html",
  "./style.css","./account.js","./data.js","./student.js","./admin.js"
];
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch", e => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
