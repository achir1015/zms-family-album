"""線上版（docs/）端到端測試：在 pywebview 視窗（macOS＝WebKit，與 iPhone／iPad 同一個核心）裡
建立範本相簿 → 加內附音樂 → 用 WebCodecs 輸出第一段 480p MP4 → 檢查影片長度、畫面與聲音。

用法：python tools/make_pages.py 之後，python tests/web_e2e.py   （macOS 要在登入的畫面工作階段執行）
"""
import functools
import http.server
import json
import os
import tempfile
import threading
import time

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(HERE, "docs")

JS = r"""
window.__e2e = null;
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const R = { ua: navigator.userAgent, videoEncoder: typeof VideoEncoder !== 'undefined', audioEncoder: typeof AudioEncoder !== 'undefined', canFilter: FA.CAN_FILTER };
  for (let i = 0; i < 40 && !document.querySelector('#screen-home.show, .screen.show#home'); i++) await wait(250);
  let blob = null; FA.saveBlob = (b, n) => { blob = b; R.file = n; };
  await FA.makeSample(); await wait(2500);
  R.shows = FA.S.project.data.shows.map((s) => s.items.length);
  const lib = await FA.loadMusicLib();
  const m = await FA.api('music_import', { file: lib[0].file }); FA.S.project.media[m.id] = m; FA.addMusic([m]);
  FA.S.outRange = 'cur'; FA.setTab('create'); await wait(1500);
  document.querySelector('[data-id="mp4_480"]').click(); await wait(800);
  const t0 = Date.now(); document.querySelector('#btn-export').click();
  for (let i = 0; i < 900 && !blob; i++) { await wait(1000); if (/失敗|錯誤|不支援/.test(document.querySelector('#out-msg')?.textContent || '')) break; }
  R.msg = document.querySelector('#out-msg')?.textContent; R.sec = (Date.now() - t0) / 1000;
  if (blob) {
    R.size = blob.size;
    await fetch('/__save', { method: 'POST', body: blob });
    const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(blob);
    await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = () => j(new Error('影片無法播放')); });
    R.video = { dur: +v.duration.toFixed(1), w: v.videoWidth, h: v.videoHeight };
    try { const ab = await new (window.AudioContext || window.webkitAudioContext)().decodeAudioData(await blob.arrayBuffer()); let pk = 0; const ch = ab.getChannelData(0); for (let i = 0; i < ch.length; i += 50) pk = Math.max(pk, Math.abs(ch[i])); R.audio = { dur: +ab.duration.toFixed(1), peak: +pk.toFixed(2) }; }
    catch (e) { R.audio = 'none: ' + e.message; }
  }
  return JSON.stringify(R);
})().then((t) => (window.__e2e = t), (e) => (window.__e2e = JSON.stringify({ error: String(e && (e.stack || e.message) || e) })));
'started'
"""


def main():
    import webview
    class H(http.server.SimpleHTTPRequestHandler):
        def do_POST(self):                         # 測試把做好的 MP4 傳回來，用 FFmpeg 檢查
            n = int(self.headers.get("Content-Length") or 0)
            open(os.path.join(tempfile.gettempdir(), "fa-web-e2e.mp4"), "wb").write(self.rfile.read(n))
            self.send_response(200); self.send_header("Content-Length", "0"); self.end_headers()
    h = functools.partial(H, directory=DOCS)
    http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = "http://127.0.0.1:%d/index.html" % srv.server_address[1]
    win = webview.create_window("web-e2e", url, width=1360, height=860)
    out = {}

    def flow():
        time.sleep(5)
        try:
            win.evaluate_js(JS)
            res = None
            for _ in range(900):
                time.sleep(1)
                res = win.evaluate_js("window.__e2e")
                if res:
                    break
            out.update(json.loads(res) if isinstance(res, str) else (res or {"error": "timeout"}))
        except Exception as e:
            out["error"] = repr(e)
        mp4 = os.path.join(tempfile.gettempdir(), "fa-web-e2e.mp4")
        if os.path.isfile(mp4):
            import subprocess
            ff = os.environ.get("FA_FFMPEG") or "ffmpeg"
            r = subprocess.run([ff, "-hide_banner", "-i", mp4], capture_output=True, text=True, errors="replace")
            out["ffmpeg"] = [l.strip() for l in r.stderr.splitlines() if "Stream" in l or "Duration" in l]
        txt = json.dumps(out, ensure_ascii=False, indent=1)
        print(txt, flush=True)
        open(os.path.join(tempfile.gettempdir(), "fa-web-e2e.json"), "w", encoding="utf-8").write(txt)
        win.destroy()

    webview.start(flow, gui="edgechromium" if os.name == "nt" else None, private_mode=True)
    srv.shutdown()


if __name__ == "__main__":
    main()
