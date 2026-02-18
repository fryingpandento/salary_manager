// iOSアプリ「Scriptable」用のウィジェットスクリプト
// 1. App Storeから「Scriptable」をインストールしてください
// 2. 新しいスクリプトを作成し、この内容をコピペしてください
// 3. ホーム画面にScriptableのウィジェットを追加し、このスクリプトを選択してください

const url = "https://raw.githubusercontent.com/fryingpandento/salary_manager/main/public/widget_data.json";

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
        const req = new Request(url);
        const data = await req.loadJSON();

        // 更新日時を表示 (デバッグ用、あるいはデータの古さ確認用)
        // const updateTime = widget.addText(`更新: ${data.update_at.substring(5, 10)} ${data.update_at.substring(11, 16)}`);
        // updateTime.font = Font.systemFont(8);
        // updateTime.textColor = Color.gray();
        // widget.addSpacer(4);

        const schedules = data.future_schedules.slice(0, 3); // 直近3件

        if (schedules.length === 0) {
            const noShift = widget.addText("現在予定はありません");
            noShift.font = Font.systemFont(12);
            noShift.textColor = Color.gray();
        } else {
            for (const s of schedules) {
                const row = widget.addStack();
                row.layoutHorizontally();

                // 日付
                const dateText = row.addText(s.date_str);
                dateText.font = Font.boldSystemFont(12);
                dateText.textColor = new Color("#1C1C1E");

                row.addSpacer(8);

                // 時間
                const timeText = row.addText(`${s.time_str}-${s.end_time_str}`);
                timeText.font = Font.systemFont(12);
                timeText.textColor = new Color("#1C1C1E");

                widget.addSpacer(2);

                // 場所
                const locText = widget.addText(`  ${s.location || s.type}`);
                locText.font = Font.systemFont(10);
                locText.textColor = Color.gray();
                locText.lineLimit = 1;

                widget.addSpacer(6);
            }
        }
    } catch (e) {
        const errText = widget.addText("データ取得エラー");
        errText.textColor = Color.red();
        const subText = widget.addText("ネット接続を確認してください");
        subText.font = Font.systemFont(8);
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
