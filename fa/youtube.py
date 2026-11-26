"""直接上傳到 YouTube（YouTube Data API v3）。

- 單位設定：系統管理員貼上 Google Cloud「OAuth 用戶端（電腦版應用程式）」的用戶端 ID 與密鑰 → sys_meta 'yt_client'
- 每個使用者各自連結自己的 YouTube 帳號：OAuth（PKCE＋本機 127.0.0.1 回呼），refresh token 存在 sys_meta 'yt_token:<帳號>'
  （不放在 fa_pref，畫面的偏好設定 API 不會讀到）
- 上傳：續傳式（resumable）分段上傳，背景執行緒，畫面輪詢進度
- 權限範圍只要 youtube.upload（上傳）與 youtube.readonly（顯示頻道名稱、播放清單）

注意：Google 未審核的 API 專案上傳的影片一律是「私人」，要到 YouTube 自己改公開；每天配額約 6 支影片。
"""
import base64
import hashlib
import json
import os
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

AUTH_URL = os.environ.get("FA_GOOGLE_AUTH", "https://accounts.google.com/o/oauth2/v2/auth")
TOKEN_URL = os.environ.get("FA_GOOGLE_TOKEN", "https://oauth2.googleapis.com/token")
REVOKE_URL = os.environ.get("FA_GOOGLE_REVOKE", "https://oauth2.googleapis.com/revoke")
API = os.environ.get("FA_YOUTUBE_API", "https://www.googleapis.com")          # 測試時指到模擬伺服器
SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly"
CHUNK = 8 * 1024 * 1024
UA = "zms-family-album"

PENDING = {}            # state → {uid, verifier, redirect, t}
UPLOADS = {}            # 上傳工作 id → 狀態 dict


class YTError(Exception):
    pass


# ------------------------------------------------------------------ 設定與權杖（sys_meta）
def _meta(db, k):
    v = db.value("SELECT v FROM sys_meta WHERE k=%s", (k,))
    return json.loads(v) if v else None


def _set_meta(db, k, v):
    if v is None:
        db.exec("DELETE FROM sys_meta WHERE k=%s", (k,))
    else:
        db.exec("REPLACE INTO sys_meta (k, v) VALUES (%s, %s)", (k, json.dumps(v, ensure_ascii=False)))


def client(db):
    c = _meta(db, "yt_client") or {}
    return c if c.get("id") and c.get("secret") else None


def save_client(db, cid, secret):
    cid, secret = (cid or "").strip(), (secret or "").strip()
    if not cid and not secret:
        _set_meta(db, "yt_client", None)
        return
    if not cid.endswith(".apps.googleusercontent.com"):
        raise YTError("用戶端 ID 的格式不對（應該是 ….apps.googleusercontent.com 結尾）")
    if len(secret) < 10:
        raise YTError("請貼上用戶端密鑰（Client secret）")
    _set_meta(db, "yt_client", {"id": cid, "secret": secret})


def parse_client_json(text):
    """Google Cloud 下載的 client_secret_xxx.json → (id, secret)"""
    try:
        d = json.loads(text)
        d = d.get("installed") or d.get("web") or d
        return d["client_id"], d["client_secret"]
    except Exception:
        raise YTError("這不是 Google Cloud 下載的 OAuth 用戶端 JSON 檔")


def token(db, uid):
    return _meta(db, "yt_token:" + uid)


def status(db, uid):
    c = client(db)
    t = token(db, uid)
    return {"configured": bool(c), "linked": bool(t), "channel": (t or {}).get("channel", ""),
            "channel_id": (t or {}).get("channel_id", "")}


# ------------------------------------------------------------------ HTTP 小工具
def _req(url, data=None, headers=None, method=None, timeout=60):
    h = {"User-Agent": UA}
    h.update(headers or {})
    if isinstance(data, dict):
        data = urllib.parse.urlencode(data).encode()
        h.setdefault("Content-Type", "application/x-www-form-urlencoded")
    r = urllib.request.Request(url, data=data, headers=h, method=method or ("POST" if data is not None else "GET"))
    return urllib.request.urlopen(r, timeout=timeout)


def _err_text(e):
    try:
        body = e.read().decode("utf-8", "replace")
        j = json.loads(body)
        er = j.get("error")
        if isinstance(er, dict):
            reason = ((er.get("errors") or [{}])[0]).get("reason", "")
            msg = er.get("message", "")
            if reason in ("quotaExceeded", "uploadLimitExceeded"):
                return "今天的 YouTube 上傳次數已經用完（Google 限制），請明天再試"
            if reason == "youtubeSignupRequired":
                return "這個 Google 帳號還沒有 YouTube 頻道，請先到 YouTube 建立頻道"
            return "%s（%s）" % (msg, reason) if reason else msg
        return j.get("error_description") or str(er) or body[:300]
    except Exception:
        return "HTTP %s" % getattr(e, "code", "?")


# ------------------------------------------------------------------ OAuth（PKCE＋本機回呼）
def auth_url(db, uid, redirect):
    c = client(db)
    if not c:
        raise YTError("系統管理員還沒有設定 YouTube 上傳（右上角選單 →「YouTube 上傳設定」）")
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(24)
    for k in [k for k, v in PENDING.items() if time.time() - v["t"] > 900]:
        PENDING.pop(k, None)
    PENDING[state] = {"uid": uid, "verifier": verifier, "redirect": redirect, "t": time.time()}
    q = {"client_id": c["id"], "redirect_uri": redirect, "response_type": "code", "scope": SCOPES,
         "access_type": "offline", "prompt": "consent", "state": state,
         "code_challenge": challenge, "code_challenge_method": "S256"}
    return AUTH_URL + "?" + urllib.parse.urlencode(q)


def finish_auth(db, state, code):
    """瀏覽器回到 127.0.0.1 的回呼：用授權碼換權杖，存起來；回傳 (uid, 頻道名稱)"""
    p = PENDING.pop(state or "", None)
    if not p:
        raise YTError("連結已逾時，請回到程式再按一次「連結 YouTube 帳號」")
    c = client(db)
    try:
        with _req(TOKEN_URL, {"code": code, "client_id": c["id"], "client_secret": c["secret"],
                              "redirect_uri": p["redirect"], "grant_type": "authorization_code",
                              "code_verifier": p["verifier"]}) as r:
            t = json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise YTError("Google 拒絕連結：" + _err_text(e))
    if not t.get("refresh_token"):
        raise YTError("Google 沒有給長期授權，請到 Google 帳號的「第三方存取」移除本程式後再連結一次")
    tok = {"refresh": t["refresh_token"], "access": t.get("access_token", ""),
           "exp": time.time() + int(t.get("expires_in", 3000)) - 60}
    try:
        ch = _api_get("/youtube/v3/channels?part=snippet&mine=true", tok["access"])
        it = (ch.get("items") or [{}])[0]
        tok["channel"] = it.get("snippet", {}).get("title", "")
        tok["channel_id"] = it.get("id", "")
    except Exception:
        tok["channel"] = ""
    _set_meta(db, "yt_token:" + p["uid"], tok)
    return p["uid"], tok.get("channel", "")


def _access(db, uid):
    t = token(db, uid)
    if not t:
        raise YTError("還沒有連結 YouTube 帳號")
    if t.get("access") and time.time() < t.get("exp", 0):
        return t["access"]
    c = client(db)
    if not c:
        raise YTError("系統管理員還沒有設定 YouTube 上傳")
    try:
        with _req(TOKEN_URL, {"client_id": c["id"], "client_secret": c["secret"], "refresh_token": t["refresh"],
                              "grant_type": "refresh_token"}) as r:
            n = json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code in (400, 401):
            _set_meta(db, "yt_token:" + uid, None)
            raise YTError("YouTube 授權已失效或被取消，請重新連結帳號")
        raise YTError("無法更新 YouTube 授權：" + _err_text(e))
    t["access"] = n["access_token"]
    t["exp"] = time.time() + int(n.get("expires_in", 3000)) - 60
    _set_meta(db, "yt_token:" + uid, t)
    return t["access"]


def unlink(db, uid):
    t = token(db, uid)
    if t:
        try:
            _req(REVOKE_URL, {"token": t["refresh"]}, timeout=15).close()
        except Exception:
            pass
    _set_meta(db, "yt_token:" + uid, None)


def _api_get(path, access):
    with _req(API + path, headers={"Authorization": "Bearer " + access}, timeout=30) as r:
        return json.loads(r.read())


def playlists(db, uid):
    acc = _access(db, uid)
    try:
        d = _api_get("/youtube/v3/playlists?part=snippet&mine=true&maxResults=50", acc)
    except urllib.error.HTTPError as e:
        raise YTError(_err_text(e))
    return [{"id": x["id"], "title": x["snippet"]["title"]} for x in d.get("items", [])]


# ------------------------------------------------------------------ 上傳（背景執行緒）
def start_upload(db_factory, uid, path, meta):
    if not os.path.isfile(path):
        raise YTError("找不到影片檔：" + path)
    jid = secrets.token_hex(6)
    job = {"id": jid, "uid": uid, "state": "start", "pct": 0, "sent": 0, "size": os.path.getsize(path),
           "url": "", "error": "", "cancel": False, "t0": time.time(), "name": os.path.basename(path)}
    UPLOADS[jid] = job
    threading.Thread(target=_upload, args=(db_factory, job, path, meta), daemon=True).start()
    return jid


def _upload(db_factory, job, path, meta):
    db = db_factory()
    try:
        acc = _access(db, job["uid"])
        privacy = meta.get("privacy") if meta.get("privacy") in ("private", "unlisted", "public") else "private"
        body = {"snippet": {"title": (meta.get("title") or job["name"])[:100],
                            "description": (meta.get("description") or "")[:5000],
                            "tags": [t for t in (meta.get("tags") or []) if t][:30],
                            "categoryId": str(meta.get("category") or "22")},
                "status": {"privacyStatus": privacy, "selfDeclaredMadeForKids": bool(meta.get("kids")),
                           "embeddable": True}}
        ext = os.path.splitext(path)[1].lower()
        ctype = {".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/mp4", ".webm": "video/webm",
                 ".avi": "video/x-msvideo", ".wmv": "video/x-ms-wmv", ".mkv": "video/x-matroska",
                 ".mpg": "video/mpeg", ".mpeg": "video/mpeg", ".flv": "video/x-flv"}.get(ext, "application/octet-stream")
        try:
            with _req(API + "/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
                      json.dumps(body).encode("utf-8"),
                      {"Authorization": "Bearer " + acc, "Content-Type": "application/json; charset=UTF-8",
                       "X-Upload-Content-Type": ctype, "X-Upload-Content-Length": str(job["size"])}) as r:
                session = r.headers["Location"]
        except urllib.error.HTTPError as e:
            raise YTError(_err_text(e))
        job["state"] = "uploading"
        size, pos, fails = job["size"], 0, 0
        result = None
        with open(path, "rb") as f:
            while pos < size:
                if job["cancel"]:
                    job["state"] = "cancelled"
                    return
                f.seek(pos)
                chunk = f.read(CHUNK)
                end = pos + len(chunk) - 1
                try:
                    with _req(session, chunk, {"Authorization": "Bearer " + acc, "Content-Type": ctype,
                                               "Content-Range": "bytes %d-%d/%d" % (pos, end, size)},
                              method="PUT", timeout=300) as r:
                        result = json.loads(r.read() or b"{}")          # 200/201：全部傳完
                        pos = size
                except urllib.error.HTTPError as e:
                    if e.code == 308:                                   # 這一段收到了，繼續下一段
                        rng = e.headers.get("Range")
                        pos = int(rng.split("-")[1]) + 1 if rng else pos
                        fails = 0
                    elif e.code in (500, 502, 503, 504) and fails < 5:
                        fails += 1
                        time.sleep(2 * fails)
                        pos = _query_pos(session, acc, size, pos)
                    elif e.code == 401 and fails < 2:
                        fails += 1
                        acc = _access(db, job["uid"])
                    else:
                        raise YTError(_err_text(e))
                except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
                    if fails >= 6:
                        raise YTError("網路中斷，上傳失敗，請稍後再試")
                    fails += 1
                    time.sleep(3 * fails)
                    pos = _query_pos(session, acc, size, pos)
                job["sent"] = pos
                job["pct"] = round(pos * 100 / max(1, size), 1)
        vid = (result or {}).get("id", "")
        job["video_id"] = vid
        job["url"] = "https://youtu.be/" + vid if vid else ""
        job["privacy"] = ((result or {}).get("status") or {}).get("privacyStatus", privacy)
        if meta.get("playlist") and vid:
            try:
                with _req(API + "/youtube/v3/playlistItems?part=snippet",
                          json.dumps({"snippet": {"playlistId": meta["playlist"],
                                                  "resourceId": {"kind": "youtube#video", "videoId": vid}}}).encode(),
                          {"Authorization": "Bearer " + acc, "Content-Type": "application/json"}) as r:
                    r.read()
            except Exception as e:
                job["warn"] = "影片已上傳，但加入播放清單失敗：%s" % (_err_text(e) if isinstance(e, urllib.error.HTTPError) else e)
        job["pct"] = 100
        job["state"] = "done"
    except YTError as e:
        job["state"], job["error"] = "error", str(e)
    except Exception as e:
        job["state"], job["error"] = "error", "上傳失敗：%s" % e
    finally:
        try:
            db.close()
        except Exception:
            pass


def _query_pos(session, acc, size, fallback):
    """網路中斷後問 YouTube 已經收到多少"""
    try:
        with _req(session, b"", {"Authorization": "Bearer " + acc, "Content-Range": "bytes */%d" % size},
                  method="PUT", timeout=30) as r:
            r.read()
            return size
    except urllib.error.HTTPError as e:
        if e.code == 308:
            rng = e.headers.get("Range")
            return int(rng.split("-")[1]) + 1 if rng else 0
    except Exception:
        pass
    return fallback


def job_status(jid, uid):
    j = UPLOADS.get(jid)
    if not j or j["uid"] != uid:
        raise YTError("找不到上傳工作")
    out = {k: v for k, v in j.items() if k not in ("uid", "cancel")}
    el = time.time() - j["t0"]
    out["eta"] = int(el / (j["sent"] / j["size"]) - el) if j["sent"] and j["state"] == "uploading" else None
    return out
