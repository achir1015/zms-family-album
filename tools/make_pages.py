"""產生線上版（GitHub Pages）與手機 App 用的網頁：web/ → docs/

- 加入 js/local.js（瀏覽器內的核心：IndexedDB 存相簿與素材、WebCodecs 輸出 MP4）與 lib/mp4-muxer.js
- PWA：manifest.webmanifest、sw.js（離線可用；改版時 CACHE 名稱會跟著版本與內容雜湊改變）
- 背景音樂 web/assets/music/*.m4a 不在 git 裡：沒有的話先執行 tools/fetch_music.py

用法：python tools/make_pages.py
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
from fa import APP_NAME, APP_VERSION  # noqa: E402

WEB = os.path.join(HERE, "web")
OUT = os.path.join(HERE, "docs")


def main():
    music = os.path.join(WEB, "assets", "music")
    if not any(f.endswith(".m4a") for f in os.listdir(music)):
        subprocess.run([sys.executable, os.path.join(HERE, "tools", "fetch_music.py")], check=True)
    keep = {"ios"}                                   # docs/ios 安裝頁另外維護，不要刪
    if os.path.isdir(OUT):
        for n in os.listdir(OUT):
            if n in keep:
                continue
            p = os.path.join(OUT, n)
            shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    os.makedirs(OUT, exist_ok=True)
    for n in os.listdir(WEB):
        s, d = os.path.join(WEB, n), os.path.join(OUT, n)
        if os.path.isdir(s):
            shutil.copytree(s, d, ignore=shutil.ignore_patterns("manifest.json", "__pycache__"))
        else:
            shutil.copy2(s, d)

    # index.html：加入線上版核心、PWA
    p = os.path.join(OUT, "index.html")
    html = open(p, encoding="utf-8").read()
    html = html.replace('<script src="js/api.js"></script>',
                        '<script>window.FA_WEB_VERSION = %s;</script>\n<script src="js/api.js"></script>\n'
                        '<script src="lib/mp4-muxer.js"></script>\n<script src="js/local.js"></script>'
                        % json.dumps(APP_VERSION), 1)
    head = ('<link rel="manifest" href="manifest.webmanifest">\n'
            '<link rel="apple-touch-icon" href="assets/icon-256.png">\n'
            '<meta name="theme-color" content="#1d2530">\n'
            '<meta name="apple-mobile-web-app-capable" content="yes">\n')
    html = html.replace("</head>", head + "</head>", 1)
    html = html.replace("<script>FA.boot();</script>",
                        "<script>FA.boot();\nif ('serviceWorker' in navigator && location.protocol === 'https:' && !window.ZMSIOS && !window.ZMSAndroid)"
                        " navigator.serviceWorker.register('sw.js');</script>", 1)
    open(p, "w", encoding="utf-8").write(html)

    json.dump({"name": APP_NAME, "short_name": "家庭相簿", "start_url": "./", "display": "standalone",
               "background_color": "#1d2530", "theme_color": "#1d2530", "lang": "zh-TW",
               "icons": [{"src": "assets/icon-256.png", "sizes": "256x256", "type": "image/png"},
                         {"src": "assets/icon.png", "sizes": "512x512", "type": "image/png", "purpose": "any"}]},
              open(os.path.join(OUT, "manifest.webmanifest"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # Service worker：程式檔 network-first（有網路就拿最新）、素材 cache-first
    h = hashlib.sha1()
    for root, _, files in os.walk(OUT):
        if os.sep + "music" in root or os.sep + "ios" in root:
            continue
        for f in sorted(files):
            if f.endswith((".js", ".css", ".html")):
                h.update(open(os.path.join(root, f), "rb").read())
    cache = "zms-album-%s-%s" % (APP_VERSION, h.hexdigest()[:8])
    sw = """const CACHE = %s;
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'index.html']))); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || e.request.headers.has('range')) return;
  const asset = /\\/assets\\//.test(u.pathname) && !/\\.json$/.test(u.pathname);
  if (asset) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => { if (res.ok && !/\\/music\\//.test(u.pathname)) { const c = res.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return res; })));
  } else {
    e.respondWith(fetch(e.request).then((res) => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return res; }).catch(() => caches.match(e.request)));
  }
});
""" % json.dumps(cache)
    open(os.path.join(OUT, "sw.js"), "w", encoding="utf-8").write(sw)
    open(os.path.join(OUT, ".nojekyll"), "w").close()
    total = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(OUT) for f in fs)
    print("完成：%s（%.1f MB，CACHE %s）" % (OUT, total / 1e6, cache))


if __name__ == "__main__":
    main()
