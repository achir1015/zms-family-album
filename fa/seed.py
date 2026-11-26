"""第一次使用的預設資料：權限功能與角色。"""

# 權限功能：(代號, 名稱, 說明)；等級 0 無、1 查詢、2 維護
FUNCS = [
    ("EDIT", "相簿編輯", "等級 1 可開啟、播放自己的相簿；等級 2 可新增、編輯、刪除自己的相簿與素材"),
    ("EXPORT", "輸出影片", "輸出成影片檔、手機格式、DVD 相容格式"),
    ("SHARE", "共用相簿", "等級 1 可觀看別人分享的相簿；等級 2 可修改、刪除別人分享的相簿"),
    ("SYS", "系統管理", "使用者與權限、備份還原、版本更新、操作紀錄"),
]
FUNC_NAMES = {f[0]: f[1] for f in FUNCS}
LEVEL_NAMES = {0: "無", 1: "查詢", 2: "維護"}


def _r(**kw):
    return {f[0]: kw.get(f[0], 0) for f in FUNCS}


ROLES = {
    "系統管理員": {f[0]: 2 for f in FUNCS},
    "編輯者": _r(EDIT=2, EXPORT=2, SHARE=1),
    "家人": _r(EDIT=1, EXPORT=1, SHARE=1),
    "訪客": _r(SHARE=1),
}


def seed_all(db, first=False):
    """每次開啟都會補上缺的參考資料（INSERT IGNORE，不覆蓋使用者修改過的內容）。"""
    db.exec("INSERT IGNORE INTO sys_company (id, name) VALUES (1, '')")
