// ==========================================
// ⚙️ 設定エリア
// ==========================================
const SUPABASE_URL = "https://wkhhbwzbbvpwmkqdvvso.supabase.co";
const SUPABASE_KEY = "sb_publishable_kWCeIBN9tu2Jg5LDX5Q9Hg_EL1xHz-f";

// ==========================================
// 🎨 ウィジェット表示処理
// ==========================================

if (config.runsInWidget) {
    let widget = await createWidget();
    Script.setWidget(widget);
} else {
    let widget = await createWidget();
    widget.presentMedium();
}
Script.complete();

async function createWidget() {
    let w = new ListWidget();

    // --- 背景グラデーション ---
    let gradient = new LinearGradient();
    gradient.locations = [0, 1];
    gradient.colors = [
        new Color("#2c3e50"), // 上: ダークグレー
        new Color("#000000")  // 下: 黒
    ];
    w.backgroundGradient = gradient;

    // --- Supabaseからデータを取得 ---
    let schedules = [];
    try {
        // JST (Local) の日付文字列を生成する
        let d = new Date();
        let year = d.getFullYear();
        let month = String(d.getMonth() + 1).padStart(2, '0');
        let day = String(d.getDate()).padStart(2, '0');
        let todayStr = `${year}-${month}-${day}`;

        let apiUrl = `${SUPABASE_URL}/rest/v1/shifts?select=*&date=gte.${todayStr}&order=date.asc,start_time.asc&limit=10`;
        let req = new Request(apiUrl);
        req.headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`
        };
        schedules = await req.loadJSON();
    } catch (e) {
        let errText = w.addText("Connection Error");
        errText.textColor = Color.red();
        return w;
    }

    // --- 未来の予定を抽出 (終了した予定を除外するロジックを統合) ---
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // ここでもJST (Local) の日付を使う
    let y = now.getFullYear();
    let m = String(now.getMonth() + 1).padStart(2, '0');
    let d = String(now.getDate()).padStart(2, '0');
    const todayDateStr = `${y}-${m}-${d}`;

    let upcoming = schedules.filter(s => {
        // 日付チェック
        if (s.date < todayDateStr) return false;

        // 当日の場合、時間をチェック
        if (s.date === todayDateStr) {
            const [endH, endM] = s.end_time.split(':').map(Number);
            // 終了時刻を過ぎていたら除外
            if (endH < currentHour || (endH === currentHour && endM <= currentMinute)) {
                return false;
            }
        }
        return true;
    });

    let main = upcoming[0];
    let sub = upcoming.slice(1, 4); // メイン1つ + サブ3つまで表示

    if (main) {
        // --- メイン（一番大きい予定） ---
        let safeLoc = main.location || "";
        let checkText = (main.title + safeLoc).toLowerCase();
        // "まいばす" (ひらがな) もチェック対象に追加
        let isMyBasket = checkText.includes("mybasket") || checkText.includes("マイバス") || checkText.includes("まいばす");
        let isGym = checkText.includes("ルネサンス") || checkText.includes("gym") || checkText.includes("ジム");
        let mainColor = isMyBasket ? new Color("#66ccff") : isGym ? new Color("#34C759") : new Color("#ffcc66");

        let row = w.addStack();
        row.layoutHorizontally();

        let bar = row.addStack();
        bar.size = new Size(4, 45);
        bar.backgroundColor = mainColor;
        bar.cornerRadius = 2;

        row.addSpacer(12);

        let info = row.addStack();
        info.layoutVertically();
        info.centerAlignContent();

        let dateStr = formatDateJP(main.date);
        let timeStr = `${main.start_time.substring(0, 5)} - ${main.end_time.substring(0, 5)}`;

        let dateLine = info.addText(`${dateStr}  ${timeStr}`);
        dateLine.font = Font.boldSystemFont(16);
        dateLine.textColor = Color.white();

        w.addSpacer(4);

        let locationText = main.location ? ` @${main.location}` : "";
        let mainText = `${main.title}${locationText}`;

        let locLine = info.addText(mainText);
        locLine.font = Font.systemFont(14);
        locLine.textColor = mainColor;
        locLine.lineLimit = 1;

        w.addSpacer(14);

        // --- 区切り線 ---
        let line = w.addStack();
        line.size = new Size(280, 1);
        line.backgroundColor = new Color("#ffffff", 0.2);

        w.addSpacer(12);

        // --- サブリスト ---
        if (sub.length > 0) {
            for (let s of sub) {
                let sRow = w.addStack();
                sRow.centerAlignContent();

                let sSafeLoc = s.location || "";
                let sCheck = (s.title + sSafeLoc).toLowerCase();
                let sIsMyBasket = sCheck.includes("mybasket") || sCheck.includes("マイバス") || sCheck.includes("まいばす");
                let sIsGym = sCheck.includes("ルネサンス") || sCheck.includes("gym") || sCheck.includes("ジム");
                let sColor = sIsMyBasket ? new Color("#66ccff") : sIsGym ? new Color("#34C759") : new Color("#ffcc66");

                let dot = sRow.addStack();
                dot.size = new Size(6, 6);
                dot.cornerRadius = 3;
                dot.backgroundColor = sColor;

                sRow.addSpacer(8);

                let sDate = formatDateJP(s.date);

                let sLocText = s.location ? ` @${s.location}` : "";

                let sStartTime = s.start_time.substring(0, 5);
                let sText = sRow.addText(`${sDate} ${sStartTime} : ${s.title}${sLocText}`);
                sText.font = Font.systemFont(12);
                sText.textColor = new Color("#d0d0d0");
                sText.lineLimit = 1;

                w.addSpacer(6);
            }
        } else {
            let fin = w.addText("No further schedules.");
            fin.font = Font.italicSystemFont(10);
            fin.textColor = Color.gray();
        }

    } else {
        // 予定なし
        w.addSpacer();
        let msg = w.addText("No Upcoming Shifts");
        msg.textColor = Color.gray();
        msg.centerAlignText();
        w.addSpacer();
    }

    // 右上に最終更新時刻（デバッグ用・動作確認用）
    w.addSpacer();
    let footer = w.addStack();
    footer.layoutHorizontally();
    footer.addSpacer();
    let nowTime = new Date();
    let timeStr = `${nowTime.getHours()}:${String(nowTime.getMinutes()).padStart(2, '0')}`;
    let updateTxt = footer.addText(`Updated: ${timeStr}`);
    updateTxt.font = Font.systemFont(8);
    updateTxt.textColor = Color.gray();

    return w;
}

// --- 日付変換関数 ---
function formatDateJP(dateString) {
    if (!dateString) return "";
    let parts = dateString.split("-");
    let year = parseInt(parts[0]);
    let month = parseInt(parts[1]);
    let day = parseInt(parts[2]);

    let dateObj = new Date(year, month - 1, day);
    let weekDays = ["日", "月", "火", "水", "木", "金", "土"];
    let weekDay = weekDays[dateObj.getDay()];

    return `${month}/${day}(${weekDay})`;
}
