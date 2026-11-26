"""由 gl-transitions（MIT，https://github.com/gl-transitions/gl-transitions）產生 web/lib/transitions.js。

每個轉場加上中文名稱與分類；需要額外貼圖的（DisplacementMap、LumaWipe）略過。
用法：python tools/build_transitions.py
"""
import json
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ZH = {
    "Accordion": "手風琴摺疊", "ApertureWipe": "光圈擦除", "ArrowWipe": "箭頭擦除", "Ascii": "文字馬賽克",
    "BandWipe": "條帶擦除", "BeadUp": "水珠聚合", "BillowWipe": "波浪翻騰", "Bite": "咬一口", "BlockCover": "方塊覆蓋",
    "BlockSlide": "方塊滑動", "BloomDissolve": "光暈溶解", "Blossom": "花朵綻放", "BokehDissolve": "散景溶解",
    "BookFlip": "翻書", "Bottleneck": "瓶頸收縮", "Bounce": "彈跳", "BowTie": "蝴蝶結（直）",
    "BowTieHorizontal": "蝴蝶結（橫）", "BrickCollapse": "磚牆倒塌", "BrushWipe": "毛筆刷過", "BurnThrough": "燒穿",
    "ButterflyFlight": "蝴蝶飛舞", "ButterflyWaveScrawler": "蝶翼波紋", "CameraShake": "鏡頭晃動", "CardDeal": "發牌",
    "CardSwipe": "卡片滑開", "CellDissolve": "細胞溶解", "Chessboard": "西洋棋盤", "CircleBurst": "圓形爆開",
    "CircleIris": "圓形光圈", "CircleOpen": "圓形展開", "CirclePacking": "圓點堆疊", "Cleave": "劈開",
    "ClockWipe": "時鐘掃過", "Clothesline": "曬衣繩", "CloudDive": "穿越雲層", "CodeRain": "數位雨",
    "CoinSettle": "錢幣落定", "ColorCoords": "色彩座標", "ColorDistance": "色差漸變", "ColorPanelWipe": "彩色面板擦除",
    "ColorPhase": "色相漸變", "ColorWrap": "色彩包覆", "Comb": "梳齒", "ComicPanels": "漫畫分格", "Condensation": "水氣凝結",
    "CorePunch": "中心衝擊", "CornerPin": "四角釘", "Crankshaft": "曲軸轉動", "Craze": "龜裂紋", "CrazyParametricFun": "瘋狂曲線",
    "CrossWarp": "交錯扭曲", "CrossZoom": "交錯縮放", "Crosshatch": "交叉線影", "Crumple": "揉紙", "Cube": "立方體旋轉",
    "CurtainRise": "布幕升起", "Curtains": "拉開布幕", "CurvedWipe": "弧形擦除", "CylinderRoll": "圓筒捲動",
    "Cymatics": "聲波紋", "DamBreak": "潰堤", "DefocusBlur": "失焦模糊", "Deinterleave": "交錯分離", "DiamondWipe": "菱形擦除",
    "DiffuseDissolve": "擴散溶解", "Directional": "推移", "DirectionalEased": "緩動推移", "DirectionalScaled": "縮放推移",
    "DirectionalWarp": "扭曲推移", "DirectionalWipe": "方向擦除", "DiscCascade": "圓片瀑布", "Disintegrate": "粉碎消散",
    "DisplacementMap": "位移貼圖", "DitherDissolve": "網點溶解", "DominoFall": "骨牌倒下", "Donut": "甜甜圈",
    "DoomMelt": "融化流下", "Doorway": "推門而入", "Drape": "垂簾", "Dreamy": "夢幻", "DreamyZoom": "夢幻縮放",
    "DropHop": "跳落", "DuotoneFade": "雙色淡化", "EchoSlide": "殘影滑動", "EdgeGlow": "邊緣發光", "EqualizerWipe": "等化器",
    "EyeBlink": "眨眼", "FacetedGlass": "切面玻璃", "Fade": "淡入淡出", "FadeColor": "經由黑色淡化",
    "FadeGrayscale": "經由黑白淡化", "Faint": "暈眩", "FallOver": "向前倒下", "FalseReflection": "倒影",
    "FieldReversal": "磁場反轉", "FilmBurn": "底片燒灼", "FilmDissolve": "底片溶解", "FilmLeader": "老電影倒數",
    "FilmStrip": "底片捲動", "Fisheye": "魚眼", "FlameWipe": "火焰擦除", "FlashFade": "閃光淡化", "FlowDissolve": "流動溶解",
    "FlowerWipe": "花形擦除", "Flutter": "飄動", "FlyEye": "蒼蠅複眼", "Fold": "對摺", "FrostWipe": "霜花擦除",
    "Funnel": "漏斗", "FurShake": "毛絨抖動", "Gallery": "畫廊", "Gape": "裂開", "GeometricCollage": "幾何拼貼",
    "GlassRelief": "玻璃浮雕", "GlintDissolve": "閃爍溶解", "GlitchBands": "故障條紋", "GlitchDisplace": "故障位移",
    "GlitchFlicker": "故障閃爍", "GlitchMemories": "故障回憶", "GlitterDissolve": "亮片溶解", "Globe": "地球儀",
    "GlowDissolve": "光芒溶解", "GoldenSpiral": "黃金螺旋", "GooeyWipe": "黏液擦除", "GravityLens": "重力透鏡",
    "GridFlip": "格子翻轉", "Halftone": "印刷網點", "HeartWipe": "愛心擦除", "HeatHaze": "熱浪", "HerringboneFold": "人字摺",
    "Hexagonalize": "六角馬賽克", "HingedSquares": "鉸鏈方塊", "Hologram": "全像投影", "HoneyDrip": "蜂蜜滴落",
    "Honeycomb": "蜂巢", "HorizontalClose": "水平關閉", "HorizontalHold": "水平跳動", "HorizontalOpen": "水平打開",
    "HsvFade": "色相淡化", "HyperbolicMosaic": "雙曲馬賽克", "Inchworm": "尺蠖", "InkBleed": "墨水暈開", "InsetWipe": "內嵌擦除",
    "InsideCube": "方塊內旋", "InterlaceWipe": "交錯掃描", "InvertedPageCurl": "翻頁", "IrisFold": "光圈摺疊",
    "Kaleidoscope": "萬花筒", "KeyholeWipe": "鑰匙孔", "Kite": "風箏", "Knead": "揉麵", "LayoutGrid": "版面格子",
    "LeafWipe": "葉片擦除", "LedWall": "LED 牆", "LeftRight": "左右交換", "LensFlare": "鏡頭光暈", "LensPush": "鏡頭推移",
    "LensWipe": "鏡片擦除", "LichtenbergBurn": "閃電紋燒灼", "LightRays": "光束", "LightStreaks": "光痕", "LightWipe": "光線擦除",
    "LightningFlash": "閃電", "LightningRift": "雷電裂縫", "LineFeed": "換行捲動", "LiquidFill": "液體注滿",
    "LissajousTiles": "李薩如方塊", "LumaWipe": "亮度擦除", "LuminanceMelt": "亮度融化", "MarblingDissolve": "大理石紋溶解",
    "MicroBrickCascade": "小磚瀑布", "MoireWipe": "疊紋擦除", "Morph": "變形", "Mosaic": "馬賽克", "MultiplyBlend": "色彩疊加",
    "Nightfall": "夜幕降臨", "NoiseDissolve": "雜訊溶解", "OutlineCrumble": "輪廓崩落", "OutlineFill": "輪廓填滿",
    "OutlineTear": "輪廓撕開", "Overexposure": "過度曝光", "PaintBucket": "油漆桶", "PaintDissolve": "油彩溶解",
    "PaperFold": "紙張摺疊", "PaperLayers": "紙張層疊", "PaperPlane": "紙飛機", "PaperTear": "撕紙", "ParallaxPush": "視差推移",
    "Perforate": "打孔", "PerlinDissolve": "雲霧溶解", "PhotoDevelop": "相片顯影", "PinchLift": "捏起", "Pinwheel": "風車",
    "PixelStretch": "像素拉伸", "Pixelize": "像素化", "PlasmaDissolve": "電漿溶解", "PlusWipe": "十字擦除",
    "PointCharges": "電荷場", "PolkaDotsCurtain": "圓點布幕", "PopIn": "彈出", "PosterPaste": "海報張貼",
    "PowerKaleido": "動感萬花筒", "PrimaryLights": "三原色光", "Prisms": "稜鏡", "ProjectorThrow": "投影機",
    "Pupil": "瞳孔", "Puzzle": "拼圖", "PuzzleCube": "魔術方塊", "QuadTurn": "四格翻轉", "QuadtreeBlocks": "四分方塊",
    "RadialWipe": "放射擦除", "RainPuddle": "雨滴水窪", "RandomSquares": "隨機方塊", "Reassemble": "重新組合",
    "RectangleCover": "矩形覆蓋", "RectangleIris": "矩形光圈", "ReededGlass": "條紋玻璃", "Reflow": "重新流動",
    "Refraction": "折射", "Revolve": "旋轉門", "RibbonTwist": "緞帶扭轉", "RingSpin": "圓環旋轉", "RingsWipe": "圓環擦除",
    "Ripple": "水波漣漪", "Rolls": "捲動", "RotateScaleFade": "旋轉縮放淡化", "RotateScaleVanish": "旋轉縮小消失",
    "Runway": "跑道", "SandDrift": "流沙", "SawtoothWipe": "鋸齒擦除", "ScreenPrintWipe": "網版印刷", "SequinStroke": "亮片筆觸",
    "Shatter": "玻璃碎裂", "Shockwave": "衝擊波", "ShoreWash": "海浪拍岸", "Shred": "碎紙", "ShutterWipe": "百葉快門",
    "SimpleFlip": "翻轉", "SimpleZoom": "放大", "SimpleZoomOut": "縮小", "SketchDissolve": "素描溶解", "SkyLanterns": "天燈",
    "SlashSplit": "斜切分開", "SlideAwayRight": "向右滑走", "SlideProjector": "幻燈機", "Slides": "幻燈片", "SlitStretch": "細縫拉伸",
    "SlitThread": "穿線", "SlotReels": "拉霸轉輪", "SmokeDissolve": "煙霧溶解", "SnakeBlockWipe": "蛇形方塊", "Snap": "啪一聲",
    "Snapshot": "快照", "Snowflake": "雪花", "Soak": "浸濕", "SoapDrop": "肥皂泡", "SoapFilm": "泡泡膜", "SourceSink": "漩渦吸入",
    "SpeedLines": "速度線", "Sphere": "球體", "SpinningTop": "陀螺", "SpiralBlockWipe": "螺旋方塊", "SpiralLines": "螺旋線",
    "SpiralWipe": "螺旋擦除", "SplatterWipe": "潑灑", "SplitFlap": "翻牌看板", "SplitSlideInHorizontal": "水平分割滑入",
    "SplitSlideInOutHorizontal": "水平分割滑進滑出", "SplitSlideInOutVertical": "垂直分割滑進滑出",
    "SplitSlideInVertical": "垂直分割滑入", "SplitSlideOutHorizontal": "水平分割滑出", "SplitSlideOutVertical": "垂直分割滑出",
    "SpotlightWipe": "聚光燈", "SquaresWipe": "方塊擦除", "Squeeze": "擠壓", "StarWipe": "星形擦除", "StaticFade": "雜訊淡化",
    "StaticWipe": "雜訊擦除", "Steamroll": "壓路機", "StereoViewer": "立體鏡", "StickySplit": "黏稠分開", "StopMotion": "定格動畫",
    "Stratify": "分層", "StretchSlide": "拉伸滑動", "StripDatamoshGlitch": "資料損毀", "StrobeToss": "頻閃拋出",
    "Subdivide": "細分", "Swap": "交換", "Swim": "游動", "Swirl": "漩渦", "Tableau": "畫面定格", "TangentMotionBlur": "動態模糊",
    "TileBlast": "方塊爆破", "TileConveyor": "方塊輸送帶", "TileRings": "方塊圓環", "TileShuffle": "方塊洗牌",
    "TilesWave": "方塊波浪", "TopBottom": "上下交換", "TriangleFlip": "三角翻轉", "TruchetWipe": "曲線磚擦除", "Tumble": "翻滾",
    "Tunnel": "隧道", "TvLostSignal": "電視沒訊號", "TvRoll": "電視跳格", "TvStatic": "電視雜訊", "TvTurnOff": "關電視",
    "Umbrella": "雨傘", "Unbox": "開箱", "UndulatingBurnOut": "波動燒灼", "Unstack": "拆開堆疊", "Unstir": "反攪拌",
    "Vaporize": "蒸發", "VerticalClose": "垂直關閉", "VerticalOpen": "垂直打開", "VhsTracking": "錄影帶雜訊",
    "ViscousFingers": "黏液指紋", "Vortex": "旋渦", "WarpSpeed": "曲速", "WaterDrop": "水滴", "WatercolorDissolve": "水彩溶解",
    "WaterfallWipe": "瀑布擦除", "WaveWipe": "波浪擦除", "WedgeWipe": "楔形擦除", "WhipPan": "甩鏡頭", "WhipSpin": "甩旋轉",
    "WhipTilt": "甩上下", "Whirlwind": "旋風", "Whittle": "削切", "Wind": "風吹", "WindowBlinds": "百葉窗", "WindowSlices": "窗格切片",
    "Wormhole": "蟲洞", "Wrench": "扭轉", "XorWipe": "互斥擦除", "ZoomInCircles": "圓圈放大", "ZoomInOut": "放大再縮小",
    "ZoomWipeLeft": "向左縮放擦除", "ZoomWipeRight": "向右縮放擦除",
}

# 分類：依標籤（先符合的優先）
CATS = [
    ("basic", "基本淡化", {"fade", "dissolve", "blend"}),
    ("3d", "3D 立體", {"3d", "perspective", "fold", "flip"}),
    ("slide", "推移滑動", {"slide", "push", "directional"}),
    ("wipe", "擦除", {"wipe", "reveal", "iris"}),
    ("shape", "形狀圖案", {"shape", "circle", "pattern", "grid", "tiles", "blocks", "squares", "stripes"}),
    ("zoom", "縮放旋轉", {"zoom", "rotate", "spin", "swirl"}),
    ("light", "光影特效", {"light", "glow", "flash", "burn", "lens"}),
    ("organic", "自然流體", {"organic", "liquid", "water", "wave", "paint", "paper"}),
    ("retro", "復古與故障", {"retro", "glitch", "noise", "scanlines"}),
]
ORDER_FIRST = ["Fade", "FadeColor", "Directional", "SimpleZoom", "Cube", "InvertedPageCurl", "Doorway", "CircleOpen",
               "HeartWipe", "WindowBlinds", "Swap", "Mosaic", "Ripple", "CrossZoom", "Dreamy"]


def main():
    src = json.load(open(os.path.join(HERE, "tools", "gl-transitions.json"), encoding="utf-8"))
    out = []
    for t in src:
        if t.get("textures") or t.get("license") not in ("MIT", "BSD 3 Clause", "BSD 2 Clause"):
            continue
        tags = set(t.get("tags") or [])
        cat = next((c for c, _, s in CATS if tags & s), "fun")
        params = {k: {"type": t["paramsTypes"][k], "value": t["defaultParams"].get(k)} for k in t["paramsTypes"]}
        out.append(dict(id=t["name"], zh=ZH.get(t["name"], t["name"]), cat=cat, three="3d" in tags,
                        glsl=t["glsl"], params=params, preview=t.get("preview", 0.5)))
    rank = {n: i for i, n in enumerate(ORDER_FIRST)}
    out.sort(key=lambda x: (rank.get(x["id"], 999), x["zh"]))
    cats = [dict(id=c, name=n) for c, n, _ in CATS] + [dict(id="fun", name="趣味創意")]
    js = ("/* 由 tools/build_transitions.py 產生，勿手改。轉場著色器來自 gl-transitions（MIT 授權，"
          "https://github.com/gl-transitions/gl-transitions）。 */\n"
          "window.FA_TRANSITION_CATS = %s;\nwindow.FA_TRANSITIONS = %s;\n"
          % (json.dumps(cats, ensure_ascii=False), json.dumps(out, ensure_ascii=False)))
    os.makedirs(os.path.join(HERE, "web", "lib"), exist_ok=True)
    open(os.path.join(HERE, "web", "lib", "transitions.js"), "w", encoding="utf-8").write(js)
    from collections import Counter
    print(len(out), "個轉場", Counter(x["cat"] for x in out), "3D:", sum(x["three"] for x in out))
    miss = [x["id"] for x in out if x["zh"] == x["id"]]
    if miss:
        print("缺中文名稱：", miss)


if __name__ == "__main__":
    main()
