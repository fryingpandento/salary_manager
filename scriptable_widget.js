// iOSアプリ「Scriptable」用のウィジェットスクリプト
// 1. App Storeから「Scriptable」をインストールしてください
// 2. 新しいスクリプトを作成し、この内容をコピペしてください
// 3. ホーム画面にScriptableのウィジェットを追加し、このスクリプトを選択してください

const supabaseUrl = 'https://wkhhbwzbbvpwmkqdvvso.supabase.co';
const supabaseKey = 'sb_publishable_kWCeIBN9tu2Jg5LDX5Q9Hg_EL1xHz-f';

async function createWidget() {
    const widget = new ListWidget();
    widget.backgroundColor = new Color("#F2F2F7");

    const titleStack = widget.addStack();
    titleStack.layoutHorizontally();
    titleStack.centerAlignContent();

    const icon = titleStack.addImage(SFSymbol.named("calendar").image);
    icon.imageSize = new Size(16, 16);
    icon.tintColor = new Color("#007AFF");

    titleStack.addSpacer(4);

    const title = titleStack.addText("Salary Manager");
    title.font = Font.boldSystemFont(14);
    title.textColor = new Color("#007AFF");

    widget.addSpacer(12);

    try {
        const today = new Date().toISOString().split('T')[0];
        const apiUrl = `${supabaseUrl}/rest/v1/shifts?select=*&date=gte.${today}&order=date.asc,start_time.asc&limit=5`;
        const req = new Request(apiUrl);
        req.headers = {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`
        };

        const shifts = await req.loadJSON();
        const days = ['日', '月', '火', '水', '木', '金', '土'];

        if (shifts.length === 0) {
            const noShift = widget.addText("現在予定はありません");
            noShift.font = Font.systemFont(12);
            noShift.textColor = Color.gray();
        } else {
            // Show max 3 items
            for (let i = 0; i < Math.min(shifts.length, 3); i++) {
                const s = shifts[i];
                const dateObj = new Date(s.date);
                const dayStr = days[dateObj.getDay()];
                const dateStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()}(${dayStr})`;

                const startTime = s.start_time.substring(0, 5); // HH:mm:ss -> HH:mm
                const endTime = s.end_time.substring(0, 5);

                const row = widget.addStack();
                row.layoutHorizontally();

                // 日付
                const dateText = row.addText(dateStr);
                dateText.font = Font.boldSystemFont(12);
                dateText.textColor = new Color("#1C1C1E");

                row.addSpacer(8);

                // 時間
                const timeText = row.addText(`${startTime}-${endTime}`);
                timeText.font = Font.systemFont(12);
                timeText.textColor = new Color("#1C1C1E");

                widget.addSpacer(2);

                // 場所・タイトル
                const locText = widget.addText(`  ${s.location || s.title}`);
                locText.font = Font.systemFont(10);
                locText.textColor = Color.gray();
                locText.lineLimit = 1;

                widget.addSpacer(6);
            }
        }
    } catch (e) {
        const errText = widget.addText("データ取得エラー");
        errText.textColor = Color.red();
        const subText = widget.addText(e.message);
        subText.font = Font.systemFont(8);
        subText.lineLimit = 2;
    }

    return widget;
}

if (config.runsInWidget) {
    const widget = await createWidget();
    Script.setWidget(widget);
} else {
    const widget = await createWidget();
    widget.presentMedium();
}

Script.complete();
