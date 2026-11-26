"""資料表定義（唯一來源）：建表 SQL 與欄位中文說明。

表名前綴：sys_＝系統（使用者、權限、設定、紀錄）、fa_＝家庭相簿（相簿、素材、輸出紀錄、個人偏好）。
"""

# (表名, 中文名稱, [(欄位, SQL 型別與屬性, 中文說明)], 其他限制)
TABLES = [
    ("sys_meta", "系統參數", [
        ("k", "VARCHAR(40) NOT NULL PRIMARY KEY", "參數代號"),
        ("v", "TEXT", "參數值")], []),
    ("sys_company", "單位設定（單一公司／家庭）", [
        ("id", "INT NOT NULL PRIMARY KEY", "固定 1"),
        ("name", "VARCHAR(120) NOT NULL DEFAULT ''", "公司或家庭名稱（片尾字幕預設署名）"),
        ("out_dir", "VARCHAR(400) NOT NULL DEFAULT ''", "預設輸出資料夾（空白＝使用者的「影片」資料夾）")], []),
    ("sys_user", "使用者", [
        ("uid", "VARCHAR(30) NOT NULL PRIMARY KEY", "帳號"),
        ("name", "VARCHAR(60) NOT NULL", "姓名"),
        ("pw_hash", "VARCHAR(200) NOT NULL", "密碼雜湊（PBKDF2）"),
        ("role", "VARCHAR(30) NOT NULL DEFAULT ''", "角色範本"),
        ("dept", "VARCHAR(30) NOT NULL DEFAULT ''", "部門或家庭成員關係"),
        ("is_admin", "TINYINT NOT NULL DEFAULT 0", "系統管理員"),
        ("active", "TINYINT NOT NULL DEFAULT 1", "啟用"),
        ("last_login", "DATETIME NULL", "最近登入"),
        ("created_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "建立時間")], []),
    ("sys_user_perm", "使用者權限", [
        ("uid", "VARCHAR(30) NOT NULL", "帳號"),
        ("func", "VARCHAR(10) NOT NULL", "功能代號"),
        ("lvl", "TINYINT NOT NULL DEFAULT 0", "等級 0 無、1 查詢、2 維護")], ["PRIMARY KEY (uid, func)"]),
    ("sys_audit_log", "操作紀錄", [
        ("id", "BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY", "流水號"),
        ("at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "時間"),
        ("uid", "VARCHAR(30) NOT NULL DEFAULT ''", "使用者"),
        ("action", "VARCHAR(30) NOT NULL", "動作"),
        ("target", "VARCHAR(80) NOT NULL DEFAULT ''", "對象"),
        ("detail", "TEXT", "內容")], ["KEY ix_at (at)"]),
    ("fa_project", "相簿專案（一個專案可含多段影片）", [
        ("id", "INT NOT NULL AUTO_INCREMENT PRIMARY KEY", "流水號"),
        ("name", "VARCHAR(100) NOT NULL", "相簿名稱"),
        ("owner", "VARCHAR(30) NOT NULL", "建立人"),
        ("shared", "TINYINT NOT NULL DEFAULT 0", "分享給其他使用者觀看"),
        ("aspect", "VARCHAR(5) NOT NULL DEFAULT '16:9'", "畫面比例 16:9 或 4:3"),
        ("seconds", "DECIMAL(9,2) NOT NULL DEFAULT 0", "總長度（秒）"),
        ("items", "INT NOT NULL DEFAULT 0", "相片與影片數"),
        ("thumb", "INT NULL", "封面素材"),
        ("data", "LONGTEXT", "相簿內容（JSON：影片段、相片、轉場、字幕、剪貼畫、特效、音樂）"),
        ("created_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "建立時間"),
        ("updated_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP", "最後修改")],
     ["KEY ix_owner (owner)"]),
    ("fa_media", "素材（相片、影片、音樂、旁白）", [
        ("id", "INT NOT NULL AUTO_INCREMENT PRIMARY KEY", "流水號"),
        ("owner", "VARCHAR(30) NOT NULL", "匯入人"),
        ("kind", "VARCHAR(6) NOT NULL", "photo 相片、video 影片、audio 音樂、voice 旁白"),
        ("name", "VARCHAR(200) NOT NULL", "原始檔名"),
        ("path", "VARCHAR(300) NOT NULL", "存放路徑（素材庫內的相對路徑）"),
        ("sha1", "CHAR(40) NOT NULL", "檔案指紋（同一個檔案只存一份）"),
        ("size", "BIGINT NOT NULL DEFAULT 0", "檔案大小"),
        ("width", "INT NOT NULL DEFAULT 0", "寬"),
        ("height", "INT NOT NULL DEFAULT 0", "高"),
        ("duration", "DECIMAL(10,3) NOT NULL DEFAULT 0", "長度（秒）"),
        ("taken_at", "DATETIME NULL", "拍攝或修改時間（排序用）"),
        ("created_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "匯入時間")],
     ["KEY ix_owner (owner)", "KEY ix_sha (sha1)"]),
    ("fa_export", "輸出紀錄", [
        ("id", "INT NOT NULL AUTO_INCREMENT PRIMARY KEY", "流水號"),
        ("project_id", "INT NOT NULL", "相簿"),
        ("uid", "VARCHAR(30) NOT NULL", "輸出人"),
        ("preset", "VARCHAR(40) NOT NULL", "輸出格式代號"),
        ("path", "VARCHAR(400) NOT NULL DEFAULT ''", "輸出檔案"),
        ("size", "BIGINT NOT NULL DEFAULT 0", "檔案大小"),
        ("seconds", "DECIMAL(9,2) NOT NULL DEFAULT 0", "影片長度"),
        ("status", "VARCHAR(8) NOT NULL DEFAULT 'RUN'", "RUN 進行中、DONE 完成、FAIL 失敗、STOP 取消"),
        ("message", "TEXT", "錯誤訊息"),
        ("created_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "開始時間"),
        ("finished_at", "DATETIME NULL", "完成時間")], ["KEY ix_project (project_id)"]),
    ("fa_pref", "個人偏好（我的最愛風格、剪貼畫、上次設定）", [
        ("uid", "VARCHAR(30) NOT NULL PRIMARY KEY", "帳號"),
        ("data", "TEXT", "設定（JSON）")], []),
]


def ddl():
    out = []
    for name, title, cols, extra in TABLES:
        body = ["  `%s` %s COMMENT '%s'" % (c, t, d.replace("'", "''")) for c, t, d in cols]
        body += ["  " + x for x in extra]
        out.append("CREATE TABLE IF NOT EXISTS `%s` (\n%s\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 "
                   "COLLATE=utf8mb4_unicode_ci COMMENT='%s'" % (name, ",\n".join(body), title))
    return out
