# Chrome Web Store 上架資料

把下面的文字直接貼進開發者後台對應欄位即可。

## 上架步驟

1. 前往 https://chrome.google.com/webstore/devconsole ，用 Google 帳號登入，首次需付 5 美元一次性註冊費並驗證 email
2. 點「新增項目」，上傳 `dist/youtube-channel-order-1.0.0.zip`
3. 依下面各節填「商店資訊」「隱私權」「發布」三個分頁
4. 上傳至少 1 張截圖（1280×800 或 640×400，PNG/JPG，不能有透明）：建議在深色與淺色模式各截一張影片頁，控制列要看得到
5. 上傳 `dist/promo-small-440x280.png` 當小型宣傳圖（選填但建議）
6. 隱私權政策網址：把 `PRIVACY_POLICY.md` 放到任何公開網址（GitHub repo、GitHub Pages、Notion 公開頁面都可以），貼上連結
7. 語言：外掛內建 `_locales/zh_TW` 與 `_locales/en`，商店會依瀏覽者語言自動顯示對應的名稱與簡短說明。詳細說明要在後台「商店資訊」分頁點「新增語言」加入 English，貼上下方英文版
8. 送出審查。純內容腳本、只有 storage 權限的擴充功能通常 1～3 個工作天內過審

## 商店資訊

**名稱**（≤45 字）
YouTube 頻道順序播放

**簡短說明**（≤132 字）
依照頻道上傳順序播放上一部／下一部影片，看完自動接著播同一頻道的下一部上傳。

**詳細說明**

看完一部影片，想接著看同一個頻道「接下來上傳的那一部」，卻要在頻道頁面裡翻很久？這個擴充功能幫你解決這件事。

✔ 影片下方多一條控制列，一鍵切到同頻道「較新的下一部」或「較舊的上一部」，按鈕上直接顯示影片標題
✔ 顯示這部影片是頻道第幾部（由新到舊），方便追進度
✔ 影片播完自動接著播，方向可選「由舊看到新」或「由新看到舊」，可設定延遲秒數並隨時取消
✔ 快捷鍵 Alt+Shift+→ / Alt+Shift+←（Mac 為 Option+Shift+方向鍵），可在 Chrome 快捷鍵設定自訂
✔ 可選擇是否把 Shorts 與直播算進順序
✔ 支援深色模式

不需要登入、不需要 API 金鑰、不收集任何資料。所有資訊都來自 YouTube 本身公開的頻道上傳清單。

適合：補番舊頻道、依時間順序追系列影片、把某個頻道當 Podcast 一路聽下去。

建議把 YouTube 播放器本身的「自動播放」關掉，避免與擴充功能互相搶著跳轉。

**類別**
生產力工具（Productivity）／ 或 娛樂

**語言**
中文（繁體）

## 隱私權分頁

**單一用途說明**（Single purpose）
讓使用者在 YouTube 觀看影片時，依照該頻道的上傳順序切換到上一部或下一部影片，並可在影片播完後自動接續播放。

**權限理由**

- `storage`：儲存使用者的偏好設定（是否自動接續、播放方向、延遲秒數、是否包含 Shorts、是否顯示控制列），透過 chrome.storage.sync 在使用者自己的裝置間同步。
- 內容指令碼（Content script，youtube.com）：需要在 YouTube 影片頁面插入控制列、偵測影片播放結束事件，並向 youtube.com 讀取目前頻道的公開上傳清單以判斷上一部／下一部影片。

**是否使用遠端程式碼**
否。所有程式碼都包含在擴充功能套件中。

**資料使用揭露**（勾選項目）
全部不勾選：不收集個人識別資訊、健康資訊、財務資訊、驗證資訊、個人通訊、位置、網頁瀏覽記錄、使用者活動、網站內容。

三個聲明全部勾選：
- 不會將使用者資料販售給第三方
- 不會為了與單一用途無關的目的使用或轉移資料
- 不會為了判斷信用或貸款目的使用或轉移資料

**隱私權政策網址**
（貼上你放 PRIVACY_POLICY.md 的公開網址）

## 發布分頁

- 顯示範圍：公開
- 發布地區：所有地區

## English listing (add as a second language in the dashboard)

**Name** (auto from `_locales/en`)
Channel Order Player for YouTube

**Short description** (auto from `_locales/en`, ≤132 chars)
Jump to the previous / next upload of the same channel, in upload order. Auto-continue when a video ends.

**Detailed description**

Finished a video and want to watch the one that channel uploaded right after it? Stop digging through the channel page — this extension does it for you.

✔ A control bar above the video title lets you jump to the channel's next (newer) or previous (older) upload with one click, with the video titles shown right on the buttons
✔ Shows where this video sits in the channel's uploads (e.g. #134 of 273)
✔ Auto-continue when the video ends: oldest → newest or newest → oldest, with an optional delay you can cancel
✔ Keyboard shortcuts Alt+Shift+→ / Alt+Shift+← (Option+Shift+arrows on Mac), customizable in Chrome's shortcut settings
✔ Optionally include Shorts and live streams in the order
✔ Light and dark mode

No login, no API key, no data collection. Everything comes from YouTube's own public channel upload list.

Great for: catching up on a channel's back catalogue, watching a series in chronological order, or letting a channel play through like a podcast.

Tip: turn off YouTube's built-in Autoplay toggle in the player so the two don't compete.

**Category**
Productivity (or Entertainment)

## English privacy tab text

**Single purpose description**
Lets the user, while watching a video on YouTube, switch to the previous or next upload of the same channel in upload order, and optionally continue to it automatically when the current video ends.

**Permission justifications**

- `storage`: Stores the user's preferences (auto-continue on/off, direction, delay, include Shorts, show control bar) via chrome.storage.sync so they follow the user across their own devices.
- Content script on youtube.com: Needed to insert the control bar on YouTube watch pages, detect when the video ends, and read the channel's public upload list from youtube.com to determine the previous / next upload.

**Remote code**
No. All code is packaged in the extension.

**Data usage disclosure**
Check none of the data types (no personally identifiable information, health, financial, authentication, personal communications, location, web history, user activity, or website content is collected).

Certify all three statements: data is not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used or transferred to determine creditworthiness or for lending purposes.

**Privacy policy URL**
(Public URL of PRIVACY_POLICY.md — it already contains an English section)
