"""下載剪貼畫：Microsoft Fluent Emoji 3D（MIT 授權，https://github.com/microsoft/fluentui-emoji）。

存到 web/assets/clipart/<代號>.png（256×256），並產生 web/assets/clipart/index.js（分類與中文名稱）。
已存在的略過。用法：python tools/fetch_clipart.py
"""
import io
import json
import os
import urllib.parse
import urllib.request

from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "web", "assets", "clipart")
BASE = "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/"

# 分類: [(代號, Fluent 資料夾名稱, 中文名稱, 有膚色)]
CLIP = {
    "愛情婚禮": [("heart", "Red heart", "紅心", 0), ("hearts", "Two hearts", "兩顆心", 0),
                 ("heartribbon", "Heart with ribbon", "緞帶愛心", 0), ("sparkheart", "Sparkling heart", "閃亮愛心", 0),
                 ("ring", "Ring", "戒指", 0), ("rose", "Rose", "玫瑰", 0), ("bouquet", "Bouquet", "花束", 0),
                 ("kiss", "Kiss mark", "唇印", 0), ("wedding", "Wedding", "教堂婚禮", 0),
                 ("loveletter", "Love letter", "情書", 0), ("couple", "Couple with heart", "情侶", 0),
                 ("cupid", "Heart with arrow", "邱比特之箭", 0), ("dove", "Dove", "和平鴿", 0)],
    "生日派對": [("cake", "Birthday cake", "生日蛋糕", 0), ("balloon", "Balloon", "氣球", 0),
                 ("party", "Party popper", "拉炮", 0), ("gift", "Wrapped gift", "禮物", 0),
                 ("confetti", "Confetti ball", "彩球", 0), ("partyface", "Partying face", "派對臉", 0),
                 ("candle", "Candle", "蠟燭", 0), ("shortcake", "Shortcake", "草莓蛋糕", 0),
                 ("crown", "Crown", "皇冠", 0), ("ribbon", "Ribbon", "緞帶", 0), ("tada", "Sparkles", "閃亮", 0)],
    "寶寶兒童": [("baby", "Baby", "寶寶", 1), ("babybottle", "Baby bottle", "奶瓶", 0), ("teddy", "Teddy bear", "泰迪熊", 0),
                 ("rainbow", "Rainbow", "彩虹", 0), ("kite", "Kite", "風箏", 0), ("yoyo", "Yo-yo", "溜溜球", 0),
                 ("abc", "Input latin uppercase", "ABC", 0), ("crayon", "Crayon", "蠟筆", 0),
                 ("child", "Child", "小朋友", 1), ("duck", "Duck", "小鴨", 0), ("chick", "Hatching chick", "小雞破殼", 0),
                 ("carousel", "Carousel horse", "旋轉木馬", 0), ("balloon2", "Balloon", "氣球", 0)],
    "動物": [("dog", "Dog face", "小狗", 0), ("cat", "Cat face", "小貓", 0), ("rabbit", "Rabbit face", "兔子", 0),
             ("panda", "Panda", "貓熊", 0), ("bear", "Bear", "熊", 0), ("chicken", "Chicken", "雞", 0),
             ("pig", "Pig face", "小豬", 0), ("koala", "Koala", "無尾熊", 0), ("butterfly", "Butterfly", "蝴蝶", 0),
             ("bird", "Bird", "小鳥", 0), ("fish", "Tropical fish", "熱帶魚", 0), ("dolphin", "Dolphin", "海豚", 0),
             ("unicorn", "Unicorn", "獨角獸", 0), ("turtle", "Turtle", "烏龜", 0), ("penguin", "Penguin", "企鵝", 0)],
    "節慶": [("tree", "Christmas tree", "聖誕樹", 0), ("santa", "Santa Claus", "聖誕老人", 1),
             ("snowman", "Snowman", "雪人", 0), ("bell", "Bell", "鐘", 0), ("fireworks", "Fireworks", "煙火", 0),
             ("sparkler", "Sparkler", "仙女棒", 0), ("lantern", "Red paper lantern", "紅燈籠", 0),
             ("moon", "Full moon face", "中秋明月", 0), ("moonviewing", "Moon viewing ceremony", "賞月", 0),
             ("redenv", "Red envelope", "紅包", 0), ("pumpkin", "Jack-o-lantern", "南瓜燈", 0),
             ("egg", "Egg", "彩蛋", 0), ("star", "Star", "星星", 0), ("glowstar", "Glowing star", "發光星星", 0),
             ("dragon", "Dragon", "龍", 0), ("tanabata", "Tanabata tree", "七夕", 0)],
    "旅遊風景": [("plane", "Airplane", "飛機", 0), ("car", "Automobile", "汽車", 0), ("train", "Bullet train", "高鐵", 0),
                 ("ship", "Ship", "郵輪", 0), ("beach", "Beach with umbrella", "海灘", 0), ("island", "Desert island", "小島", 0),
                 ("mountain", "Snow-capped mountain", "雪山", 0), ("camping", "Camping", "露營", 0),
                 ("camera", "Camera with flash", "相機", 0), ("map", "World map", "世界地圖", 0),
                 ("luggage", "Luggage", "行李箱", 0), ("ferris", "Ferris wheel", "摩天輪", 0),
                 ("sun", "Sun", "太陽", 0), ("cloud", "Cloud", "雲", 0), ("palm", "Palm tree", "椰子樹", 0)],
    "自然花草": [("sakura", "Cherry blossom", "櫻花", 0), ("tulip", "Tulip", "鬱金香", 0), ("sunflower", "Sunflower", "向日葵", 0),
                 ("hibiscus", "Hibiscus", "扶桑花", 0), ("leaf", "Maple leaf", "楓葉", 0), ("clover", "Four leaf clover", "幸運草", 0),
                 ("seedling", "Seedling", "嫩芽", 0), ("mushroom", "Mushroom", "香菇", 0), ("snow", "Snowflake", "雪花", 0),
                 ("rainbow2", "Rainbow", "彩虹", 0), ("water", "Droplet", "水滴", 0), ("blossom", "Blossom", "小花", 0)],
    "美食": [("coffee", "Hot beverage", "咖啡", 0), ("tea", "Teacup without handle", "熱茶", 0), ("bubbletea", "Bubble tea", "珍珠奶茶", 0),
             ("pizza", "Pizza", "披薩", 0), ("hamburger", "Hamburger", "漢堡", 0), ("icecream", "Soft ice cream", "霜淇淋", 0),
             ("donut", "Doughnut", "甜甜圈", 0), ("apple", "Red apple", "蘋果", 0), ("watermelon", "Watermelon", "西瓜", 0),
             ("strawberry", "Strawberry", "草莓", 0), ("ramen", "Steaming bowl", "拉麵", 0), ("dumpling", "Dumpling", "水餃", 0),
             ("mooncake", "Moon cake", "月餅", 0), ("cheers", "Clinking glasses", "乾杯", 0)],
    "運動學校": [("soccer", "Soccer ball", "足球", 0), ("basketball", "Basketball", "籃球", 0), ("baseball", "Baseball", "棒球", 0),
                 ("medal", "1st place medal", "金牌", 0), ("trophy", "Trophy", "獎盃", 0), ("bike", "Bicycle", "腳踏車", 0),
                 ("graduation", "Graduation cap", "畢業帽", 0), ("school", "School", "學校", 0), ("books", "Books", "書本", 0),
                 ("pencil", "Pencil", "鉛筆", 0), ("diploma", "Scroll", "畢業證書", 0), ("swim", "Person swimming", "游泳", 1)],
    "表情": [("smile", "Smiling face with heart-eyes", "愛心眼", 0), ("laugh", "Face with tears of joy", "笑哭", 0),
             ("grin", "Beaming face with smiling eyes", "開心", 0), ("wink", "Winking face", "眨眼", 0),
             ("hug", "Smiling face with hearts", "被愛包圍", 0), ("cool", "Smiling face with sunglasses", "酷", 0),
             ("blowkiss", "Face blowing a kiss", "飛吻", 0), ("thumbs", "Thumbs up", "讚", 1), ("clap", "Clapping hands", "拍手", 1),
             ("ok", "OK hand", "OK", 1), ("wave", "Waving hand", "揮手", 1), ("pray", "Folded hands", "祈福", 1),
             ("muscle", "Flexed biceps", "加油", 1), ("hundred", "Hundred points", "一百分", 0)],
    "家庭生活": [("family", "Family", "一家人", 0), ("house", "House with garden", "家", 0), ("grandma", "Old woman", "奶奶", 1),
                 ("grandpa", "Old man", "爺爺", 1), ("people", "People hugging", "擁抱", 0), ("tv", "Television", "電視", 0),
                 ("music", "Musical notes", "音符", 0), ("guitar", "Guitar", "吉他", 0), ("frame", "Framed picture", "相框", 0),
                 ("photo", "Camera", "照相機", 0), ("cook", "Cooking", "煎蛋", 0), ("key", "Key", "鑰匙", 0)],
}


def url_for(folder, tone):
    name = folder.lower().replace(" ", "_").replace("-", "-")
    if tone:
        return BASE + urllib.parse.quote(folder) + "/Default/3D/" + name + "_3d_default.png"
    return BASE + urllib.parse.quote(folder) + "/3D/" + name + "_3d.png"


def main():
    os.makedirs(OUT, exist_ok=True)
    index = []
    fail = []
    for cat, items in CLIP.items():
        for code, folder, zh, tone in items:
            path = os.path.join(OUT, code + ".png")
            if not os.path.isfile(path):
                try:
                    with urllib.request.urlopen(url_for(folder, tone), timeout=30) as r:
                        im = Image.open(io.BytesIO(r.read())).convert("RGBA")
                    im.thumbnail((256, 256), Image.LANCZOS)
                    im.save(path, optimize=True)
                except Exception as e:
                    fail.append("%s（%s）：%s" % (code, folder, e))
                    continue
            index.append(dict(id=code, name=zh, cat=cat))
    js = ("/* 剪貼畫：Microsoft Fluent Emoji 3D（MIT 授權）。由 tools/fetch_clipart.py 產生。 */\n"
          "window.FA_CLIPART = %s;\n" % json.dumps(index, ensure_ascii=False))
    open(os.path.join(OUT, "index.js"), "w", encoding="utf-8").write(js)
    print("剪貼畫", len(index), "個")
    for f in fail:
        print("失敗", f)


if __name__ == "__main__":
    main()
