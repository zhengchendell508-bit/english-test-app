const CACHE = "english-test-cloud-pdf-v17";
const ASSETS = [
  "./",
  "./index.html",
  "./parent.html",
  "./children.html",
  "./submissions.html",
  "./student.html",
  "./admin.html",
  "./style.css",
  "./account.js",
  "./device-mode.js",
  "./data.js",
  "./report.js",
  "./submission-store.js",
  "./student.js",
  "./admin.js",
  "./vendor/html2canvas.min.js",
  "./vendor/jspdf.umd.min.js"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
