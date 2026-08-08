import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export const supportedLocales = ["zh-HK", "zh-CN", "en"] as const;
export type AppLocale = typeof supportedLocales[number];

const resources = {
  "zh-HK": { translation: {
    brand: "Yi · 易",
    nav: { cast: "起一卦", history: "閱讀紀錄", help: "關於與幫助", contact: "聯絡我們", settings: "設定", account: "帳戶", admin: "營運", skip: "跳到主要內容", home: "Yi 首頁", menu: "選單" },
    hero: { eyebrow: "一個安靜、可重現的反思儀式", title: "先把問題，\n放在光裡。", body: "三種版本化方法按規則起卦。AI 只會在你明確同意後加入，從不預測。", start: "開始起卦", privacy: "你的問題預設不會傳給 AI，也永不出現在分享連結。", caption: "卦象／形態／變化", imageAlt: "冷灰背景前，象牙色陶瓷陰陽爻懸浮在墨綠石座上" },
    trust: { label: "產品原則", deterministic: "確定性結果", reviewed: "提交前覆核", private: "問題預設私密" },
    cast: {
      title: "你的問題", questionHint: "寫下一個有界線、可以反思的問題（最多 280 字）", noQuestion: "我暫時沒有具體問題", continue: "選擇起卦方法", methodTitle: "選擇方法", number: "三數起卦", numberBody: "輸入上卦、下卦與一個動爻位置。", coin: "三錢起卦", coinBody: "由初爻開始，記錄六次三枚錢幣。", random: "安全隨機", randomBody: "由瀏覽器加密隨機生成，先覆核再提交。", upper: "上卦（1-8）", lower: "下卦（1-8）", changing: "動爻（1-6）", heads: "正", tails: "反", line: "第 {{n}} 爻", bottom: "初爻／最下", top: "上爻／最上", generate: "生成安全隨機卦", regenerate: "重新生成", review: "覆核卦爻", reviewTitle: "提交前覆核", bottomUp: "以下由下至上排列。動爻以橙色標示。", yin: "陰", yang: "陽", moving: "動", still: "靜", back: "返回修改", confirm: "確認並選擇掛金", invalid: "請完整填寫並檢查起卦資料。" },
    contribution: { title: "掛金隨喜", body: "這是對數碼服務的自願掛金，不是慈善捐款。HK$0 也可完成；正數金額會前往 Stripe 安全結帳，付款須由 webhook 核實後才顯示結果。", custom: "自訂整數 HK$1-888", proceed: "完成並查看結果", checkout: "前往 Stripe 結帳", pending: "正在等待付款確認", cancelled: "結帳已取消，你可以重新選擇。" },
    specialLine: { nine: "用九", six: "用六" },
    result: { waiting: "結果正在準備", waitingBody: "付款結果只以 Stripe 的已驗證通知為準。此頁會自動更新。", primary: "本卦", relating: "之卦", movingLines: "動爻", none: "無動爻", facts: "可重現事實", sourcePending: "來源目錄待審核", sourceBody: "目前只顯示不依賴解讀文本的卦象事實。來源解讀與來源型 AI 在權利及三語審核完成前保持關閉。", sourceReviewed: "已審核來源目錄", sourceReviewedBody: "這次閱讀已固定使用具來源、權利狀態及三語審核的摘錄。只有在你另行同意後才會傳給 AI。", reflection: "AI 反思", askReflection: "選擇是否加入 AI 反思", archive: "儲存這次閱讀", archived: "已儲存", again: "再起一卦", chat: "圍繞這次閱讀對話", share: "建立匿名分享" },
    consent: { title: "由你決定傳送甚麼", body: "AI 是可選的。每次操作都需要你明確同意；高風險問題不會傳給模型。", agree: "我同意把已選資料傳送給 DeepSeek 以產生反思", facts: "我同意把這次閱讀的卦象事實傳送給 DeepSeek", question: "包括我的原問題", sources: "包括已審核的來源摘錄", submit: "產生反思", decline: "暫不使用 AI", fallback: "AI 未被使用；確定性結果仍然完整。" },
    auth: { eyebrow: "閱讀存檔／筆記／對話", or: "或", title: "你的閱讀空間", signIn: "登入", signUp: "建立帳戶", name: "稱呼", email: "電郵", password: "密碼（至少 10 字元）", submit: "繼續", google: "使用 Google", microsoft: "使用 Microsoft", verify: "請查收驗證郵件後再登入。", forgot: "忘記密碼？", reset: "傳送重設連結", signOut: "登出", needAccount: "儲存、筆記、搜尋與對話需要帳戶。" },
    history: { eyebrow: "個人存檔", saved: "已儲存閱讀", searchLabel: "搜尋閱讀紀錄", title: "閱讀紀錄", empty: "還沒有儲存的閱讀。", search: "搜尋問題、卦象、反思與筆記", notes: "筆記", addNote: "新增筆記", saveNote: "儲存筆記", delete: "刪除", open: "查看" },
    chat: { eyebrow: "持續保存／可恢復", title: "閱讀對話", intro: "對話會固定使用建立時的閱讀背景。每日最多 50 個提問。", placeholder: "寫下你想梳理的部分…", send: "傳送", reconnecting: "正在重新連線…", you: "你", delete: "刪除對話", deleteConfirm: "確定永久刪除這段對話？" },
    share: { title: "匿名分享", anonymous: "匿名／七日", body: "連結只包含卦象事實及你選擇的反思；不含身份、原問題、筆記或對話，七日後失效。", includeReflection: "包括 AI 反思", create: "建立七日連結", copy: "複製連結", native: "分享", image: "下載長圖與 QR Code", revoked: "分享已撤銷", expired: "分享不存在、已撤銷或已過期", url: "分享連結", imageTagline: "一份匿名分享的私人反思", expires: "有效至 {{date}}" },
    settings: { eyebrow: "個人化", title: "設定", locale: "語言", font: "字體大小", theme: "外觀", small: "小", medium: "中", large: "大", light: "淺色", dark: "深色", system: "跟隨系統", save: "儲存設定", export: "匯出我的資料", delete: "刪除帳戶", deleteBody: "系統會傳送確認郵件。完成確認後，帳戶與已儲存資料不可復原。" },
    help: { eyebrow: "關於／方法／私隱", title: "把卦象當作一面鏡", body1: "Yi 先依照你選擇的方法生成六爻，再以固定 King Wen 對應找出本卦與之卦。相同輸入永遠得到相同事實。", body2: "它不是預言、診斷、投資或法律建議。適合用來整理問題、辨認假設，以及設計下一個可逆的小步驟。", methods: "三種方法都保留由下至上的爻序，並在提交前要求覆核。", privacy: "分享永遠匿名；AI 同意與資料範圍逐次選擇。" },
    contact: { eyebrow: "支援／意見", title: "聯絡我們", subject: "主題", message: "訊息", send: "送出", received: "已收到。我們會按順序回覆。" },
    admin: { eyebrow: "受限／內容已遮蔽", title: "營運控制台", summary: "總覽", users: "帳戶", readings: "閱讀元資料", contributions: "掛金與付款", ai: "AI 用量", config: "限額設定", noContent: "一般營運頁不顯示問題、筆記或對話內容。" },
    ops: { id: "識別碼", email: "電郵", role: "角色", status: "狀態", activate: "恢復", suspend: "停用", dashboard: "控制台", aiEnabled: "全域啟用 AI", tokens: "每日 token 上限", spend: "每日開支上限（美元微單位）", concurrency: "模型最高並行數", save: "儲存限額", saving: "儲存中…" },
    common: { loading: "載入中…", error: "操作未完成，請再試一次。", retry: "重試", close: "關閉", save: "儲存", cancel: "取消", optional: "選填", copyDone: "已複製", back: "返回" },
  } },
  "zh-CN": { translation: {
    brand: "Yi · 易",
    nav: { cast: "起一卦", history: "阅读记录", help: "关于与帮助", contact: "联系我们", settings: "设置", account: "账户", admin: "运营", skip: "跳到主要内容", home: "Yi 首页", menu: "菜单" },
    hero: { eyebrow: "一个安静、可重现的反思仪式", title: "先把问题，\n放在光里。", body: "三种版本化方法按规则起卦。AI 只会在你明确同意后加入，从不预测。", start: "开始起卦", privacy: "你的问题默认不会传给 AI，也永不出现在分享链接。", caption: "卦象／形态／变化", imageAlt: "冷灰背景前，象牙色陶瓷阴阳爻悬浮在墨绿色石座上" },
    trust: { label: "产品原则", deterministic: "确定性结果", reviewed: "提交前复核", private: "问题默认私密" },
    cast: { title: "你的问题", questionHint: "写下一个有边界、可以反思的问题（最多 280 字）", noQuestion: "我暂时没有具体问题", continue: "选择起卦方法", methodTitle: "选择方法", number: "三数起卦", numberBody: "输入上卦、下卦与一个动爻位置。", coin: "三钱起卦", coinBody: "由初爻开始，记录六次三枚钱币。", random: "安全随机", randomBody: "由浏览器加密随机生成，先复核再提交。", upper: "上卦（1-8）", lower: "下卦（1-8）", changing: "动爻（1-6）", heads: "正", tails: "反", line: "第 {{n}} 爻", bottom: "初爻／最下", top: "上爻／最上", generate: "生成安全随机卦", regenerate: "重新生成", review: "复核卦爻", reviewTitle: "提交前复核", bottomUp: "以下由下至上排列。动爻以橙色标示。", yin: "阴", yang: "阳", moving: "动", still: "静", back: "返回修改", confirm: "确认并选择挂金", invalid: "请完整填写并检查起卦数据。" },
    contribution: { title: "挂金随喜", body: "这是对数字服务的自愿挂金，不是慈善捐款。HK$0 也可完成；正数金额会前往 Stripe 安全结账，付款须由 webhook 核实后才显示结果。", custom: "自定义整数 HK$1-888", proceed: "完成并查看结果", checkout: "前往 Stripe 结账", pending: "正在等待付款确认", cancelled: "结账已取消，你可以重新选择。" },
    specialLine: { nine: "用九", six: "用六" },
    result: { waiting: "结果正在准备", waitingBody: "付款结果只以 Stripe 的已验证通知为准。此页会自动更新。", primary: "本卦", relating: "之卦", movingLines: "动爻", none: "无动爻", facts: "可重现事实", sourcePending: "来源目录待审核", sourceBody: "目前只显示不依赖解读文本的卦象事实。来源解读与来源型 AI 在权利及三语审核完成前保持关闭。", sourceReviewed: "已审核来源目录", sourceReviewedBody: "这次阅读已固定使用具来源、权利状态及三语审核的摘录。只有在你另行同意后才会传给 AI。", reflection: "AI 反思", askReflection: "选择是否加入 AI 反思", archive: "保存这次阅读", archived: "已保存", again: "再起一卦", chat: "围绕这次阅读对话", share: "创建匿名分享" },
    consent: { title: "由你决定传送什么", body: "AI 是可选的。每次操作都需要你明确同意；高风险问题不会传给模型。", agree: "我同意把已选数据传送给 DeepSeek 以生成反思", facts: "我同意把这次阅读的卦象事实传送给 DeepSeek", question: "包括我的原问题", sources: "包括已审核的来源摘录", submit: "生成反思", decline: "暂不使用 AI", fallback: "AI 未被使用；确定性结果仍然完整。" },
    auth: { eyebrow: "阅读存档／笔记／对话", or: "或", title: "你的阅读空间", signIn: "登录", signUp: "创建账户", name: "称呼", email: "邮箱", password: "密码（至少 10 个字符）", submit: "继续", google: "使用 Google", microsoft: "使用 Microsoft", verify: "请查收验证邮件后再登录。", forgot: "忘记密码？", reset: "发送重置链接", signOut: "退出登录", needAccount: "保存、笔记、搜索与对话需要账户。" },
    history: { eyebrow: "个人存档", saved: "已保存阅读", searchLabel: "搜索阅读记录", title: "阅读记录", empty: "还没有保存的阅读。", search: "搜索问题、卦象、反思与笔记", notes: "笔记", addNote: "新增笔记", saveNote: "保存笔记", delete: "删除", open: "查看" },
    chat: { eyebrow: "持续保存／可恢复", title: "阅读对话", intro: "对话会固定使用创建时的阅读背景。每天最多 50 个提问。", placeholder: "写下你想梳理的部分…", send: "发送", reconnecting: "正在重新连接…", you: "你", delete: "删除对话", deleteConfirm: "确定永久删除这段对话？" },
    share: { title: "匿名分享", anonymous: "匿名／七天", body: "链接只包含卦象事实及你选择的反思；不含身份、原问题、笔记或对话，七天后失效。", includeReflection: "包括 AI 反思", create: "创建七天链接", copy: "复制链接", native: "分享", image: "下载长图与二维码", revoked: "分享已撤销", expired: "分享不存在、已撤销或已过期", url: "分享链接", imageTagline: "一份匿名分享的私人反思", expires: "有效至 {{date}}" },
    settings: { eyebrow: "个性化", title: "设置", locale: "语言", font: "字体大小", theme: "外观", small: "小", medium: "中", large: "大", light: "浅色", dark: "深色", system: "跟随系统", save: "保存设置", export: "导出我的数据", delete: "删除账户", deleteBody: "系统会发送确认邮件。完成确认后，账户与已保存数据不可恢复。" },
    help: { eyebrow: "关于／方法／隐私", title: "把卦象当作一面镜子", body1: "Yi 先按照你选择的方法生成六爻，再以固定 King Wen 对应找出本卦与之卦。相同输入永远得到相同事实。", body2: "它不是预言、诊断、投资或法律建议。适合用来整理问题、辨认假设，以及设计下一个可逆的小步骤。", methods: "三种方法都保留由下至上的爻序，并在提交前要求复核。", privacy: "分享永远匿名；AI 同意与数据范围逐次选择。" },
    contact: { eyebrow: "支持／反馈", title: "联系我们", subject: "主题", message: "消息", send: "提交", received: "已收到。我们会按顺序回复。" },
    admin: { eyebrow: "受限／内容已隐藏", title: "运营控制台", summary: "总览", users: "账户", readings: "阅读元数据", contributions: "挂金与付款", ai: "AI 用量", config: "限额设置", noContent: "一般运营页面不显示问题、笔记或对话内容。" },
    ops: { id: "标识符", email: "邮箱", role: "角色", status: "状态", activate: "恢复", suspend: "停用", dashboard: "控制台", aiEnabled: "全局启用 AI", tokens: "每日 token 上限", spend: "每日开支上限（美元微单位）", concurrency: "模型最高并发数", save: "保存限额", saving: "保存中…" },
    common: { loading: "加载中…", error: "操作未完成，请再试一次。", retry: "重试", close: "关闭", save: "保存", cancel: "取消", optional: "选填", copyDone: "已复制", back: "返回" },
  } },
  en: { translation: {
    brand: "Yi · 易",
    nav: { cast: "Cast", history: "History", help: "About & help", contact: "Contact", settings: "Settings", account: "Account", admin: "Operations", skip: "Skip to main content", home: "Yi home", menu: "Menu" },
    hero: { eyebrow: "A quiet, reproducible reflection ritual", title: "Place the question\nin the light.", body: "Three versioned methods produce a fixed reading. AI joins only with your consent, never as prediction.", start: "Begin a reading", privacy: "Your question is not sent to AI by default and never appears in a share link.", caption: "HEXAGRAM / FORM / CHANGE", imageAlt: "Ivory ceramic yin and yang lines floating above a dark green stone plinth" },
    trust: { label: "Product principles", deterministic: "Deterministic result", reviewed: "Review before submit", private: "Private by default" },
    cast: { title: "Your question", questionHint: "Write a bounded question you can reflect on (280 characters max)", noQuestion: "I do not have a specific question", continue: "Choose a casting method", methodTitle: "Choose a method", number: "Three numbers", numberBody: "Enter upper and lower trigrams and one changing line.", coin: "Three coins", coinBody: "Record six throws of three coins, beginning at the bottom.", random: "Secure random", randomBody: "Generated with browser cryptography, then reviewed before submission.", upper: "Upper trigram (1-8)", lower: "Lower trigram (1-8)", changing: "Changing line (1-6)", heads: "Heads", tails: "Tails", line: "Line {{n}}", bottom: "First / bottom", top: "Sixth / top", generate: "Generate secure cast", regenerate: "Generate again", review: "Review the lines", reviewTitle: "Review before submitting", bottomUp: "Lines are shown bottom to top. Changing lines are orange.", yin: "Yin", yang: "Yang", moving: "Changing", still: "Still", back: "Edit", confirm: "Confirm and choose contribution", invalid: "Complete and check all casting inputs." },
    contribution: { title: "Voluntary contribution", body: "This supports the digital service and is not a charitable donation. HK$0 completes immediately. Positive amounts use Stripe-hosted Checkout; only a verified webhook reveals the result.", custom: "Custom whole HK$1-888", proceed: "Complete and view result", checkout: "Continue to Stripe Checkout", pending: "Waiting for payment confirmation", cancelled: "Checkout was cancelled. You can choose again." },
    specialLine: { nine: "All six yang lines changing", six: "All six yin lines changing" },
    result: { waiting: "Your result is being prepared", waitingBody: "Only a verified Stripe notification confirms payment. This page updates automatically.", primary: "Primary", relating: "Relating", movingLines: "Changing lines", none: "No changing lines", facts: "Reproducible facts", sourcePending: "Source catalog under review", sourceBody: "Only facts independent of interpretation texts are shown. Source interpretation and source-grounded AI stay off until rights and trilingual review are complete.", sourceReviewed: "Reviewed source catalog", sourceReviewedBody: "This reading carries fixed excerpts with provenance, rights status, and trilingual review. They are sent to AI only with your separate consent.", reflection: "AI reflection", askReflection: "Choose whether to add AI reflection", archive: "Save this reading", archived: "Saved", again: "Cast again", chat: "Discuss this reading", share: "Create anonymous share" },
    consent: { title: "You choose what is sent", body: "AI is optional. Every operation needs explicit consent; high-stakes questions never go to the model.", agree: "I consent to sending the selected data to DeepSeek for a reflection", facts: "I consent to sending this reading’s facts to DeepSeek", question: "Include my original question", sources: "Include reviewed source excerpts", submit: "Create reflection", decline: "Skip AI", fallback: "AI was not used; the deterministic result remains complete." },
    auth: { eyebrow: "Archive / Notes / Chat", or: "or", title: "Your reading space", signIn: "Sign in", signUp: "Create account", name: "Name", email: "Email", password: "Password (10+ characters)", submit: "Continue", google: "Continue with Google", microsoft: "Continue with Microsoft", verify: "Check your verification email before signing in.", forgot: "Forgot password?", reset: "Send reset link", signOut: "Sign out", needAccount: "Saving, notes, search, and chat require an account." },
    history: { eyebrow: "Personal archive", saved: "Saved reading", searchLabel: "Search reading history", title: "Reading history", empty: "No saved readings yet.", search: "Search questions, readings, reflections, and notes", notes: "Notes", addNote: "Add a note", saveNote: "Save note", delete: "Delete", open: "Open" },
    chat: { eyebrow: "Persistent / resumable", title: "Reading conversation", intro: "The conversation keeps the reading context from the moment it starts. Up to 50 turns per day.", placeholder: "Write what you want to untangle…", send: "Send", reconnecting: "Reconnecting…", you: "You", delete: "Delete conversation", deleteConfirm: "Permanently delete this conversation?" },
    share: { title: "Anonymous sharing", anonymous: "Anonymous / Seven days", body: "The link contains only facts and the reflection you choose. No identity, question, notes, or chat. It expires in seven days.", includeReflection: "Include AI reflection", create: "Create seven-day link", copy: "Copy link", native: "Share", image: "Download long image and QR", revoked: "Share revoked", expired: "This share is missing, revoked, or expired", url: "Share link", imageTagline: "A private reflection, shared anonymously", expires: "Expires {{date}}" },
    settings: { eyebrow: "Personalize", title: "Settings", locale: "Language", font: "Text size", theme: "Appearance", small: "Small", medium: "Medium", large: "Large", light: "Light", dark: "Dark", system: "System", save: "Save settings", export: "Export my data", delete: "Delete account", deleteBody: "A confirmation email will be sent. After confirmation, the account and saved data cannot be recovered." },
    help: { eyebrow: "About / Method / Privacy", title: "Use the reading as a mirror", body1: "Yi generates six lines from your chosen method, then uses a fixed King Wen mapping to identify the primary and relating hexagrams. The same inputs always produce the same facts.", body2: "It is not prediction, diagnosis, investment, or legal advice. Use it to frame a question, notice assumptions, and design one reversible next step.", methods: "All three methods preserve bottom-to-top line order and require review before submission.", privacy: "Shares are always anonymous; AI consent and data scope are chosen each time." },
    contact: { eyebrow: "Support / Feedback", title: "Contact us", subject: "Subject", message: "Message", send: "Send", received: "Received. We will reply in order." },
    admin: { eyebrow: "Restricted / Content-redacted", title: "Operations console", summary: "Summary", users: "Accounts", readings: "Reading metadata", contributions: "Contributions & payments", ai: "AI usage", config: "Limits", noContent: "Normal operations views never display question, note, or chat content." },
    ops: { id: "ID", email: "Email", role: "Role", status: "Status", activate: "Activate", suspend: "Suspend", dashboard: "Dashboard", aiEnabled: "Global AI enabled", tokens: "Daily token budget", spend: "Daily spend budget (USD micros)", concurrency: "Maximum provider concurrency", save: "Save limits", saving: "Saving…" },
    common: { loading: "Loading…", error: "That did not complete. Please try again.", retry: "Retry", close: "Close", save: "Save", cancel: "Cancel", optional: "Optional", copyDone: "Copied", back: "Back" },
  } },
} as const;

const storedLocale = localStorage.getItem("yi-locale");
const initialLocale: AppLocale = supportedLocales.includes(storedLocale as AppLocale) ? storedLocale as AppLocale : "zh-HK";

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale,
  fallbackLng: "zh-HK",
  interpolation: { escapeValue: false },
});

document.documentElement.lang = initialLocale;

export function chooseLocale(locale: AppLocale) {
  localStorage.setItem("yi-locale", locale);
  document.documentElement.lang = locale;
  return i18n.changeLanguage(locale);
}

export default i18n;
