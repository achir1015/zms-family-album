"""下載內附的 40 首背景音樂（每首 4～5 分多鐘）。

來源：Kevin MacLeod（incompetech.com），授權 Creative Commons 姓名標示 4.0（CC BY 4.0），
可以免費放進程式發佈，條件是標示作者 → web/assets/music/music.json 的 credit 欄、程式「關於」與音樂清單都會顯示。

下載原檔後用內附 FFmpeg 統一音量（EBU R128 -16 LUFS）並轉成 AAC 128k 的 .m4a（各平台瀏覽器都能播）。
輸出：web/assets/music/m01.m4a … m40.m4a、web/assets/music/music.json
用法：python tools/fetch_music.py   （已存在的略過）
"""
import json
import os
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "web", "assets", "music")
UA = "zms-family-album/0.9.0"
SRC = "https://incompetech.com/music/royalty-free/mp3-royaltyfree/"
CATALOG = "https://incompetech.com/music/royalty-free/pieces.json"

# (分類, 中文名, 原曲名)
TRACKS = [
    ("溫馨抒情", "永恆的希望", "Eternal Hope"),
    ("溫馨抒情", "晶瑩鋼琴", "Aretes"),
    ("溫馨抒情", "清新空氣", "Fresh Air"),
    ("溫馨抒情", "冰上的夢", "Crinoline Dreams"),
    ("溫馨抒情", "晨光漫步", "Bumba Crossing"),
    ("溫馨抒情", "啟程", "Inspired"),
    ("溫馨抒情", "幸福時光", "Almost Bliss"),
    ("溫馨抒情", "螢火與星塵", "Fireflies and Stardust"),
    ("溫馨抒情", "北方林間", "Northern Glade"),
    ("溫馨抒情", "田園時光", "Farm"),
    ("溫馨抒情", "寧靜飛船", "Airship Serenity"),
    ("溫馨抒情", "卡農（星空版）", "Canon In D Interstellar Mix"),
    ("輕快活潑", "把握當下", "Carpe Diem"),
    ("輕快活潑", "快樂每一天", "Daily Beetle"),
    ("輕快活潑", "開心飛翔", "Flying Kerfuffle"),
    ("輕快活潑", "快樂蜜蜂", "Happy Bee"),
    ("輕快活潑", "毛球遊行", "Fuzzball Parade"),
    ("輕快活潑", "鄉村彈奏", "Still Pickin"),
    ("輕快活潑", "馬車輪鋼琴曲", "Wagon Wheel"),
    ("輕快活潑", "電子泡泡", "Blip Stream"),
    ("輕快活潑", "可愛狐狸", "Kawai Kitsune"),
    ("輕快活潑", "探險樂園", "Adventures in Adventureland"),
    ("輕快活潑", "冒險的呼喚", "Call to Adventure"),
    ("輕快活潑", "茅屋村莊", "Thatched Villagers"),
    ("運動活力", "放克節奏", "Got Funk"),
    ("運動活力", "動感舞曲", "Realizer"),
    ("運動活力", "滿滿能量", "Raving Energy"),
    ("運動活力", "布吉派對", "Boogie Party"),
    ("浪漫爵士", "爵士早午餐", "Jazz Brunch"),
    ("浪漫爵士", "巴薩諾瓦", "Bossa Antigua"),
    ("浪漫爵士", "海灣酒廊", "Backbay Lounge"),
    ("浪漫爵士", "小酌時光", "Apero Hour"),
    ("浪漫爵士", "森巴晚餐", "Samba Isobel"),
    ("浪漫爵士", "街角漫步", "George Street Shuffle"),
    ("浪漫爵士", "輕盈午後", "Airport Lounge"),
    ("浪漫爵士", "夏日戀曲", "Verano Sensual"),
    ("浪漫爵士", "深夜電台", "Late Night Radio"),
    ("浪漫爵士", "婚禮華爾滋", "Devonshire Waltz Allegretto"),
    ("節慶", "聖誕歡唱", "Deck the Halls B"),
    ("節慶", "平安夜鋼琴", "It Came Upon a Midnight Clear"),
]


def ffmpeg():
    for p in (os.path.join(HERE, "packaging", "ffmpeg", "ffmpeg.exe"), "ffmpeg"):
        if os.path.isfile(p) or p == "ffmpeg":
            return p


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=180) as r:
        return r.read()


def duration(path):
    r = subprocess.run([ffmpeg(), "-i", path], capture_output=True, text=True, encoding="utf-8", errors="replace")
    for line in r.stderr.splitlines():
        if "Duration:" in line:
            h, m, s = line.split("Duration:")[1].split(",")[0].strip().split(":")
            return round(int(h) * 3600 + int(m) * 60 + float(s), 2)
    return 0


def main():
    os.makedirs(OUT, exist_ok=True)
    cat = {p["title"]: p for p in json.loads(get(CATALOG))}
    meta = []
    for i, (group, name, title) in enumerate(TRACKS):
        p = cat[title]
        dst = os.path.join(OUT, "m%02d.m4a" % (i + 1))
        if not os.path.isfile(dst) or os.path.getsize(dst) < 500000:     # 上次失敗留下的空檔也重做
            raw = get(SRC + urllib.parse.quote(p["filename"]))
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
                f.write(raw)
            try:
                subprocess.run([ffmpeg(), "-v", "error", "-y", "-i", f.name, "-vn", "-map_metadata", "-1", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
                                "-ar", "44100", "-ac", "2", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
                                "-metadata", "title=" + title, "-metadata", "artist=Kevin MacLeod", dst], check=True)
            finally:
                os.unlink(f.name)
        d = duration(dst)
        meta.append({"file": os.path.basename(dst), "name": name, "group": group, "title": title, "dur": d,
                     "feel": p.get("feel") or "", "bpm": p.get("bpm") or "",
                     "credit": '"%s" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0' % title})
        print("OK %02d %s %s %.0f 秒 %.1f MB" % (i + 1, name, title, d, os.path.getsize(dst) / 1e6), flush=True)
    json.dump(meta, open(os.path.join(OUT, "music.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("完成", len(meta), "首", sum(os.path.getsize(os.path.join(OUT, m["file"])) for m in meta) / 1e6, "MB")


if __name__ == "__main__":
    sys.exit(main())
