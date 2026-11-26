"""後端冒煙測試：建管理員（已有就登入）→ 上傳相片 → 各種輸出格式各送 2 秒畫面。

用法：先 python main.py --web 8700，再 python tests/api_smoke.py [格式代號…]
"""
import json
import os
import subprocess
import sys
import tempfile
import urllib.request

B = "http://127.0.0.1:8700/api/"
K = "dev"


def call(name, body=None, raw=None, sid="", q=""):
    data = raw if raw is not None else (json.dumps(body or {}).encode() if body is not None else None)
    req = urllib.request.Request(B + name + "?k=" + K + q, data=data, method="POST" if data is not None else "GET",
                                 headers={"X-Session": sid})
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())["data"]
    except urllib.error.HTTPError as e:
        raise SystemExit("%s → %s" % (name, e.read().decode()))


def main():
    st = call("state")
    if not st["has_users"]:
        sid = call("setup", {"uid": "admin", "name": "管理員", "pw": "admin123"})["session"]
    else:
        sid = call("login", {"uid": "admin", "pw": "admin123"})["session"]
    t = tempfile.mkdtemp()
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30", "-frames:v",
                    "60", "-q:v", "3", os.path.join(t, "f%03d.jpg")], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
                    os.path.join(t, "a.wav")], check=True)
    m = call("upload", raw=open(os.path.join(t, "f001.jpg"), "rb").read(), sid=sid, q="&name=test.jpg")
    print("上傳", m["id"], m["width"], m["height"])
    ids = sys.argv[1:] or [p["id"] for p in call("presets")["presets"]]
    ok = 0
    for pid in ids:
        j = call("export_start", {"preset": pid, "aspect": "16:9", "name": "測試-" + pid, "folder": t}, sid=sid)
        call("export_audio", raw=open(os.path.join(t, "a.wav"), "rb").read(), sid=sid, q="&job=" + j["job"])
        for i in range(60):
            call("export_frame", raw=open(os.path.join(t, "f%03d.jpg" % (i + 1)), "rb").read(), sid=sid,
                 q="&job=%s&i=%d" % (j["job"], i))
        try:
            r = call("export_finish", {}, sid=sid, q="&job=" + j["job"])
            print("OK  %-12s %8d  %s" % (pid, r["size"], os.path.basename(r["path"])))
            ok += 1
        except SystemExit as e:
            print("NG  %-12s %s" % (pid, str(e)[:300]))
    print("通過 %d / %d，檔案在 %s" % (ok, len(ids), t))


if __name__ == "__main__":
    main()
