"""YouTube 上傳端到端測試（不連真的 Google）：啟動模擬的 Google OAuth／YouTube API 伺服器，
走完「管理員設定用戶端 → 使用者連結帳號（PKCE）→ 讀頻道與播放清單 → 續傳式上傳（中途 503 重試）→ 加入播放清單 → 取消連結」。

用法：.venv\\Scripts\\python tests\\youtube_test.py   （需要 packaging/mariadb 與 packaging/ffmpeg）
"""
import base64
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)

M = {"codes": {}, "tokens": set(), "refresh": set(), "uploads": {}, "meta": None, "playlist_add": None, "revoked": [],
     "fail_once": True, "chunks": 0}


class Mock(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, code, obj, headers=None):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(b)

    def _auth_ok(self):
        return self.headers.get("Authorization", "").replace("Bearer ", "") in M["tokens"]

    def do_GET(self):
        u = urllib.parse.urlsplit(self.path)
        q = dict(urllib.parse.parse_qsl(u.query))
        if u.path == "/auth":                                     # 模擬「選帳號＋允許」→ 轉回程式
            assert q["code_challenge_method"] == "S256" and "youtube.upload" in q["scope"] and q["access_type"] == "offline"
            code = "code-" + str(time.time())
            M["codes"][code] = q["code_challenge"]
            self.send_response(302)
            self.send_header("Location", q["redirect_uri"] + "?" + urllib.parse.urlencode({"code": code, "state": q["state"]}))
            self.send_header("Content-Length", "0")
            self.end_headers()
        elif u.path == "/youtube/v3/channels":
            if not self._auth_ok():
                return self._json(401, {"error": {"message": "bad token"}})
            self._json(200, {"items": [{"id": "UC-test", "snippet": {"title": "吳家相簿頻道"}}]})
        elif u.path == "/youtube/v3/playlists":
            self._json(200, {"items": [{"id": "PL1", "snippet": {"title": "畢業紀念"}}]})
        else:
            self._json(404, {})

    def do_POST(self):
        u = urllib.parse.urlsplit(self.path)
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n)
        if u.path == "/token":
            f = dict(urllib.parse.parse_qsl(body.decode()))
            assert f["client_id"] == "123-test.apps.googleusercontent.com" and f["client_secret"] == "GOCSPX-testsecret"
            if f["grant_type"] == "authorization_code":
                ch = M["codes"].pop(f["code"])
                calc = base64.urlsafe_b64encode(hashlib.sha256(f["code_verifier"].encode()).digest()).rstrip(b"=").decode()
                if calc != ch:
                    return self._json(400, {"error": "invalid_grant", "error_description": "PKCE mismatch"})
                at, rt = "at-1", "rt-1"
                M["tokens"].add(at)
                M["refresh"].add(rt)
                return self._json(200, {"access_token": at, "refresh_token": rt, "expires_in": 3600})
            if f["grant_type"] == "refresh_token" and f["refresh_token"] in M["refresh"]:
                M["tokens"].add("at-2")
                return self._json(200, {"access_token": "at-2", "expires_in": 3600})
            return self._json(400, {"error": "invalid_grant"})
        if u.path == "/revoke":
            M["revoked"].append(dict(urllib.parse.parse_qsl(body.decode())).get("token"))
            return self._json(200, {})
        if u.path == "/upload/youtube/v3/videos":
            if not self._auth_ok():
                return self._json(401, {"error": {"message": "bad token"}})
            M["meta"] = json.loads(body)
            M["size"] = int(self.headers["X-Upload-Content-Length"])
            M["uploads"]["s1"] = bytearray()
            host = "http://127.0.0.1:%d" % self.server.server_address[1]
            return self._json(200, {}, {"Location": host + "/session/s1"})
        if u.path == "/youtube/v3/playlistItems":
            M["playlist_add"] = json.loads(body)
            return self._json(200, {"id": "PLI1"})
        self._json(404, {})

    def do_PUT(self):
        u = urllib.parse.urlsplit(self.path)
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n)
        buf = M["uploads"][u.path.rsplit("/", 1)[1]]
        cr = self.headers.get("Content-Range", "")
        if cr.startswith("bytes */"):                             # 問進度
            return self._json(308, {}, {"Range": "bytes=0-%d" % (len(buf) - 1)} if buf else {})
        M["chunks"] += 1
        if M["fail_once"] and M["chunks"] == 2:                    # 第二段故意失敗一次 → 程式要重試
            M["fail_once"] = False
            return self._json(503, {"error": {"message": "backend error"}})
        start = int(cr.split(" ")[1].split("-")[0])
        assert start == len(buf), (start, len(buf))
        buf.extend(body)
        if len(buf) < M["size"]:
            return self._json(308, {}, {"Range": "bytes=0-%d" % (len(buf) - 1)})
        # 模擬：未審核專案 → 一律私人
        return self._json(200, {"id": "VID123", "status": {"privacyStatus": "private"}})


def main():
    mock = ThreadingHTTPServer(("127.0.0.1", 0), Mock)
    threading.Thread(target=mock.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:%d" % mock.server_address[1]
    os.environ.update(FA_GOOGLE_AUTH=base + "/auth", FA_GOOGLE_TOKEN=base + "/token", FA_GOOGLE_REVOKE=base + "/revoke",
                      FA_YOUTUBE_API=base, FA_NO_BROWSER="1", FA_DATA_DIR=tempfile.mkdtemp(prefix="fa-yt-"))
    os.environ.setdefault("FA_MARIADB_BIN", os.path.join(HERE, "packaging", "mariadb", "bin"))
    from fa import server, youtube
    youtube.CHUNK = 32 * 1024                                     # 小段，才測得到多段續傳
    server.KEY = "t"
    threading.Thread(target=server.start_database, daemon=True).start()
    srv = server.serve(0)
    app = "http://127.0.0.1:%d" % srv.server_address[1]
    sid = {"s": ""}

    def call(name, body=None, method="POST", q=""):
        r = urllib.request.Request(app + "/api/" + name + "?k=t" + q, data=None if method == "GET" else json.dumps(body or {}).encode(),
                                   headers={"X-Session": sid["s"], "Content-Type": "application/json"}, method=method)
        try:
            j = json.loads(urllib.request.urlopen(r, timeout=60).read())
        except urllib.error.HTTPError as e:
            j = json.loads(e.read())
        if not j.get("ok"):
            raise RuntimeError(j.get("error"))
        return j["data"]

    for _ in range(120):
        if call("state", method="GET").get("ready"):
            break
        time.sleep(1)
    sid["s"] = call("setup", {"uid": "admin", "name": "管理員", "pw": "yt-test-123"})["session"]
    ok = []

    st = call("yt_status", method="GET")
    assert not st["configured"] and st["can_setup"]
    try:
        call("yt_client", {"id": "bad", "secret": "x"})
        raise AssertionError("錯誤格式應該被拒絕")
    except RuntimeError:
        pass
    cj = json.dumps({"installed": {"client_id": "123-test.apps.googleusercontent.com", "client_secret": "GOCSPX-testsecret"}})
    r = call("yt_client", {"json": cj})
    assert r["configured"] and r["secret"].endswith("cret") and "GOCSPX" not in r["secret"]
    ok.append("管理員匯入 OAuth 用戶端 JSON（密鑰不回傳給畫面）")

    url = call("yt_auth", {})["url"]
    page = urllib.request.urlopen(url, timeout=30).read().decode("utf-8")      # 模擬瀏覽器：登入 → 轉回 /yt-callback
    assert "連結成功" in page and "吳家相簿頻道" in page, page[:300]
    st = call("yt_status", method="GET")
    assert st["linked"] and st["channel"] == "吳家相簿頻道"
    ok.append("連結帳號（PKCE＋本機回呼）→ 頻道：" + st["channel"])
    assert call("yt_playlists", method="GET")[0]["title"] == "畢業紀念"
    ok.append("讀播放清單")

    # 做一支 3 秒的測試影片並登記成製作紀錄
    vid = os.path.join(os.environ["FA_DATA_DIR"], "測試影片.mp4")
    subprocess.run([os.path.join(HERE, "packaging", "ffmpeg", "ffmpeg.exe"), "-v", "error", "-y", "-f", "lavfi", "-i",
                    "testsrc=size=640x360:rate=30", "-f", "lavfi", "-i", "sine=frequency=440", "-t", "3",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", vid], check=True)
    db = server.STATE["db"]
    eid = db.exec("INSERT INTO fa_export (project_id, uid, preset, path, size, seconds, status) VALUES (1,'admin','youtube',%s,%s,3,'DONE')",
                  (vid, os.path.getsize(vid)))
    try:
        call("yt_upload", {"export_id": 99999, "title": "x"})
        raise AssertionError("別人的或不存在的影片應該被拒絕")
    except RuntimeError:
        pass
    job = call("yt_upload", {"export_id": eid, "title": "畢業紀念相簿", "description": "背景音樂：Kevin MacLeod",
                             "privacy": "public", "kids": False, "playlist": "PL1", "tags": ["畢業", "家庭"]})["job"]
    for _ in range(120):
        j = call("yt_job", method="GET", q="&id=" + job)
        if j["state"] in ("done", "error", "cancelled"):
            break
        time.sleep(0.5)
    assert j["state"] == "done", j
    assert j["url"] == "https://youtu.be/VID123" and j["privacy"] == "private"
    assert M["chunks"] >= 3 and not M["fail_once"], ("沒有測到多段或重試", M["chunks"])
    assert bytes(M["uploads"]["s1"]) == open(vid, "rb").read(), "上傳內容不一致"
    assert M["meta"]["snippet"]["title"] == "畢業紀念相簿" and M["meta"]["status"]["privacyStatus"] == "public"
    assert M["meta"]["status"]["selfDeclaredMadeForKids"] is False and M["meta"]["snippet"]["tags"] == ["畢業", "家庭"]
    assert M["playlist_add"]["snippet"]["playlistId"] == "PL1" and M["playlist_add"]["snippet"]["resourceId"]["videoId"] == "VID123"
    ok.append("續傳式上傳 %d 段（中途 503 重試成功），內容逐位元相同，%s" % (M["chunks"], j["url"]))
    ok.append("標題、說明、標籤、兒童設定、播放清單都送出；未審核專案回傳私人 → 畫面顯示「私人」")

    # 權杖過期 → 自動用 refresh token 換新
    t = youtube.token(db, "admin")
    t["exp"] = 0
    youtube._set_meta(db, "yt_token:admin", t)
    assert youtube._access(db, "admin") == "at-2"
    ok.append("存取權杖過期會自動更新")

    call("yt_unlink", {})
    assert not call("yt_status", method="GET")["linked"] and M["revoked"] == ["rt-1"]
    ok.append("取消連結並撤銷 Google 授權")
    # 偏好設定 API 不會帶出權杖
    assert "rt-1" not in json.dumps(call("pref", method="GET"))

    srv.shutdown()
    server.stop_database()
    print("YouTube 測試全部通過：")
    for x in ok:
        print("  ✔", x)


if __name__ == "__main__":
    main()
