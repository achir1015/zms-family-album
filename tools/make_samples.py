"""產生內建範本相簿用的 40 張寫實相片（AI 產生，不是真人）：台灣 18～30 歲年輕男女的畢業照與校園生活。

用 AI Horde（https://aihorde.net，志工電腦組成的免費 AI 繪圖網路，匿名金鑰 0000000000），
模型 Juggernaut XL（寫實照片）；圖在志工電腦上產生，不會讓筆電滿載。排隊較慢（每張約 2～6 分鐘），同時送 4 張。
匿名使用者只能產生約 512×512 像素的圖 → 用 RealESRGAN 放大（被拒就改用本機 Lanczos 放大），存成 1600 寬的 JPG。

輸出：web/assets/samples/s01.jpg … s40.jpg、web/assets/samples/samples.json（每張的中文說明，範本當字幕用）
用法：python tools/make_samples.py   （已存在的略過，可以重複執行補齊失敗的）
"""
import base64
import io
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request

from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "web", "assets", "samples")
API = "https://aihorde.net/api/v2"
UA = "zms-family-album/0.9.0"           # 標明是本程式（Python 預設的 Python-urllib 會被 AI Horde 前端的 Cloudflare 擋）
HEAD = {"Content-Type": "application/json", "apikey": "0000000000", "User-Agent": UA,
        "Client-Agent": "zms-family-album:0.9.0:unknown"}
MODEL = "Juggernaut XL"
NEG = ("cartoon, anime, illustration, painting, drawing, 3d render, cgi, doll, plastic skin, deformed, disfigured, "
       "bad hands, extra fingers, extra limbs, mutated, text, watermark, logo, signature, blurry, lowres, nsfw")
BASE = ("candid photo, Taiwanese young East Asian {who}, natural skin texture, realistic, {scene}, "
        "shot on Canon EOS R5, 35mm lens, natural light, high detail, photojournalism")

# (中文說明, 人物, 場景)
SHOTS = [
    ("畢業典禮上拋學士帽", "group of male and female college graduates aged 22", "throwing graduation caps into the blue sky, wearing black graduation gowns, joyful, university campus lawn"),
    ("穿學士服的合照", "five friends, men and women aged 22", "posing together in graduation gowns and caps in front of a red brick university building, smiling"),
    ("和爸媽的畢業合影", "family of three: a female graduate aged 22 standing between her father aged 55 and her mother aged 52",
     "the daughter wears a graduation gown and cap and holds a bouquet, both parents smiling with arms around her, three people in frame, family portrait on campus"),
    ("領畢業證書", "male graduate aged 23", "receiving diploma on stage at graduation ceremony, auditorium, shaking hands"),
    ("捧著花束的畢業生", "female graduate aged 22", "holding sunflower bouquet, graduation gown and tassel cap, golden hour on campus"),
    ("畢業典禮會場", "many graduates aged 22 in gowns", "sitting in rows in a large university auditorium during graduation ceremony"),
    ("和老師的畢業合照", "graduates aged 22 with their professor", "group photo in graduation gowns in a classroom, warm atmosphere"),
    ("畢業自拍", "three female students aged 21", "taking a selfie with smartphone in graduation gowns, laughing, campus garden"),
    ("椰林大道散步", "young couple of college students aged 20", "walking along a palm tree avenue on a Taiwanese university campus, backpacks, sunny day"),
    ("校門口", "group of college students aged 19", "chatting in front of a university main gate, Taiwan, morning"),
    ("圖書館讀書", "male college student aged 20", "studying with laptop and books in a modern university library, focused"),
    ("圖書館討論", "four college students aged 20, men and women", "group study discussion around a table in a library, notebooks"),
    ("上課聽講", "college students aged 19, men and women", "listening to a lecture in a university lecture hall, taking notes"),
    ("黑板前上台報告", "female college student aged 21", "giving a presentation in front of a projector screen in a classroom, pointing at slides"),
    ("實驗課", "two college students aged 20 wearing lab coats and safety goggles", "doing a chemistry experiment in a university laboratory, test tubes"),
    ("電腦教室", "college students aged 20", "coding on computers in a university computer lab, monitors with code"),
    ("美術課寫生", "female art student aged 20", "painting with watercolors on an easel outdoors on campus"),
    ("學生餐廳吃午餐", "group of college friends aged 20", "eating lunch together in a busy university cafeteria, Taiwanese food, bento boxes"),
    ("珍奶下午茶", "two female college students aged 20", "holding bubble milk tea cups and laughing at an outdoor table on campus"),
    ("宿舍生活", "male college students aged 19", "hanging out in a university dorm room, playing guitar, bunk beds"),
    ("社團迎新", "college students aged 19", "club recruitment fair booths on campus, colorful posters, students talking"),
    ("熱舞社練舞", "college students aged 20, dance club", "practicing street dance in front of a mirror in a dance studio"),
    ("吉他社表演", "male college student aged 21", "playing acoustic guitar and singing on a small outdoor campus stage, audience"),
    ("系上營火晚會", "college students aged 19", "sitting around a campfire at night at a student camp, cheering"),
    ("校慶園遊會", "college students aged 20", "running a food stall at a campus festival, smiling, crowd, lanterns"),
    ("志工服務", "college student volunteers aged 20 wearing matching t-shirts", "doing a beach cleanup in Taiwan, holding trash bags, teamwork"),
    ("籃球比賽投籃", "male college basketball player aged 21", "jumping shot in an indoor university basketball game, action shot, crowd"),
    ("籃球隊歡呼", "male university basketball team aged 21", "celebrating a win, hugging on the court, jerseys"),
    ("排球比賽扣球", "female college volleyball player aged 20", "spiking the ball over the net, indoor gymnasium, action"),
    ("棒球比賽打擊", "male college baseball player aged 21", "swinging the bat at home plate, university baseball field, afternoon"),
    ("田徑接力賽", "college students aged 20", "relay race on a red running track during a university sports day, passing baton"),
    ("啦啦隊加油", "female college cheerleaders aged 20", "cheering with pom poms in the stands at a university sports game"),
    ("大隊接力衝線", "female college student aged 19", "crossing the finish line on a running track, arms raised, classmates cheering"),
    ("羽球雙打", "two college students aged 20, a man and a woman", "playing badminton doubles in a university gym"),
    ("游泳比賽", "male college swimmer aged 21", "swimming freestyle in an indoor pool during a university swimming competition"),
    ("拔河比賽", "college students aged 19, men and women", "tug of war competition on a sports field, pulling a rope, determined"),
    ("畢業旅行海邊", "group of college friends aged 22, men and women", "jumping together on a beach in Kenting Taiwan, blue sea, sunny"),
    ("夜市吃宵夜", "college friends aged 21", "eating street food at a busy Taiwanese night market, neon lights, night"),
    ("騎腳踏車出遊", "two college students aged 20", "riding bicycles along a riverside bike path in Taipei, sunset"),
    ("畢業前的夕陽", "four graduates aged 22 in gowns", "silhouettes watching the sunset on a university campus hill, emotional, golden hour"),
]


def call(path, body=None, method=None):
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(8):
        req = urllib.request.Request(API + path, data=data, headers=HEAD, method=method or ("POST" if data else "GET"))
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "replace")[:300]
            if e.code in (429, 500, 502, 503) and attempt < 7:
                time.sleep(3 * (attempt + 1))
                continue
            raise RuntimeError("HTTP %s %s" % (e.code, msg))
        except Exception:
            if attempt < 5:
                time.sleep(4 * (attempt + 1))
                continue
            raise


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=120) as r:
        return r.read()


def one(i, cap, who, scene, upscale=True):
    path = os.path.join(OUT, "s%02d.jpg" % (i + 1))
    params = {"steps": 25, "cfg_scale": 5, "sampler_name": "k_dpmpp_2m", "karras": True, "width": 640, "height": 448,
              "n": 1, "seed": str(20261126 + i)}
    if upscale:
        params["post_processing"] = ["RealESRGAN_x4plus"]
    body = {"prompt": BASE.format(who=who, scene=scene) + " ### " + NEG, "params": params, "models": [MODEL],
            "nsfw": False, "censor_nsfw": True, "r2": True, "shared": False}
    try:
        sub = call("/generate/async", body)
    except RuntimeError as e:
        if upscale and ("post" in str(e).lower() or "kudos" in str(e).lower() or "403" in str(e)):
            return one(i, cap, who, scene, upscale=False)
        raise
    jid = sub["id"]
    t0 = time.time()
    while True:
        time.sleep(8)
        c = call("/generate/check/" + jid)
        if c.get("faulted"):
            raise RuntimeError("faulted")
        if c.get("done"):
            break
        if time.time() - t0 > 45 * 60:
            call("/generate/status/" + jid, method="DELETE")
            raise RuntimeError("timeout")
    g = call("/generate/status/" + jid)["generations"][0]
    if g.get("censored"):
        raise RuntimeError("censored")
    im = Image.open(io.BytesIO(fetch(g["img"]))).convert("RGB")
    if im.width < 1600:
        im = im.resize((1600, round(1600 * im.height / im.width)), Image.LANCZOS)
    elif im.width > 1920:
        im.thumbnail((1920, 1920), Image.LANCZOS)
    im.save(path, quality=90)
    return "%s %dx%d %.0f 秒 worker=%s" % (os.path.basename(path), im.width, im.height, time.time() - t0, g.get("worker_name"))


def main():
    os.makedirs(OUT, exist_ok=True)
    json.dump([{"file": "s%02d.jpg" % (i + 1), "caption": c} for i, (c, _, _) in enumerate(SHOTS)],
              open(os.path.join(OUT, "samples.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    todo = [i for i in range(len(SHOTS)) if not os.path.isfile(os.path.join(OUT, "s%02d.jpg" % (i + 1)))]
    print("要產生", len(todo), "張", flush=True)
    lock = threading.Lock()
    queue = list(todo)

    def worker():
        while True:
            with lock:
                if not queue:
                    return
                i = queue.pop(0)
            for attempt in range(3):
                try:
                    print("OK", SHOTS[i][0], one(i, *SHOTS[i]), flush=True)
                    break
                except Exception as e:
                    print("重試", i + 1, SHOTS[i][0], e, flush=True)
                    time.sleep(10)
            else:
                print("失敗", i + 1, SHOTS[i][0], flush=True)

    ths = [threading.Thread(target=worker) for _ in range(int(sys.argv[1]) if len(sys.argv) > 1 else 4)]
    for t in ths:
        t.start()
    for t in ths:
        t.join()
    have = len([f for f in os.listdir(OUT) if f.endswith(".jpg")])
    print("完成，共", have, "張", flush=True)


if __name__ == "__main__":
    main()
