import type { AppLocale } from "./i18n";

export interface LegalDocument {
  eyebrow: string;
  title: string;
  updated: string;
  intro: string;
  sections: Array<{ title: string; paragraphs: string[] }>;
}

export const legalContent: Record<AppLocale, { privacy: LegalDocument; terms: LegalDocument; labels: { privacy: string; terms: string; company: string } }> = {
  "zh-HK": {
    labels: { privacy: "私隱政策", terms: "使用條款", company: "RICHTIDE LIMITED" },
    privacy: {
      eyebrow: "資料與選擇",
      title: "私隱政策",
      updated: "生效日期：2026 年 8 月 8 日",
      intro: "RICHTIDE LIMITED（「我們」）營運 Yi · 易。這份政策會說明：我們收集哪些個人資料、為何使用、與誰分享、保存多久，以及你可以如何行使自己的選擇與權利。",
      sections: [
        { title: "我們持有的資料", paragraphs: ["我們可能持有你的姓名、電郵地址、登入及驗證紀錄、語言與顯示設定；你提交的問題、卦象事實、已儲存閱讀、筆記及對話；掛金金額、付款狀態及 Stripe 識別碼；聯絡表格內容；以及防濫用、錯誤與操作記錄。完整付款卡資料由 Stripe 處理，我們不會儲存。"] },
        { title: "使用目的", paragraphs: ["我們使用資料，以建立及保護帳戶、提供可重現的閱讀、保存你明確選擇的內容、處理掛金、回覆支援查詢、執行用量與安全限制、偵測濫用、維護服務，並履行適用的法律義務。我們不會出售個人資料。"] },
        { title: "AI 由你選擇", paragraphs: ["DeepSeek 反思是自願功能。每次使用前，你都可以分別選擇是否傳送卦象事實、經審核的來源及原問題；高風險問題會繞過 AI。模型的隱藏推理不會回傳至瀏覽器，也不會儲存在瀏覽器；拒絕使用 AI 不影響確定性結果。"] },
        { title: "服務供應商與跨境處理", paragraphs: ["我們使用 Cloudflare 提供運算、資料庫、保安及電郵；Better Auth 提供認證流程；Stripe 處理付款；Google 及 Microsoft 在你選擇時提供登入；DeepSeek 只處理你明確同意傳送的 AI 資料。這些供應商可能於香港以外處理資料，並受其條款及保安措施約束。我們亦可能於法律要求，或為保障使用者與服務而有必要時披露資料。"] },
        { title: "保存與分享", paragraphs: ["未儲存的訪客閱讀會於七日內刪除。匿名分享連結於七日後失效，且不含身份、原問題、筆記或對話。已儲存的閱讀、筆記及對話，會保留至你逐項刪除或關閉帳戶。操作錯誤記錄一般在 90 日後刪除；付款及必要的審計資料，則可按法律、會計、爭議及防詐需要保存更長時間。"] },
        { title: "保安、Cookie 與你的權利", paragraphs: ["我們使用同站 HTTP-only 工作階段、存取控制、加密傳輸及資料最小化。必要 Cookie 用於登入及安全；語言、主題及字體選擇可儲存在你的裝置。你可以在設定中匯出或刪除帳戶，亦可要求查閱或更正個人資料；為保障資料安全，我們可能核實申請人身份。"] },
        { title: "聯絡與更新", paragraphs: ["如對本政策有疑問，或想提出查閱、更正或刪除要求，請電郵至 contact@rich-tide.com。我們或會因服務或法律變更而更新本政策，並在本頁標示新的生效日期。"] },
      ],
    },
    terms: {
      eyebrow: "服務界線",
      title: "使用條款",
      updated: "生效日期：2026 年 8 月 8 日",
      intro: "本條款是你與 RICHTIDE LIMITED 就使用 Yi · 易所訂立的協議。使用服務，即表示你同意本條款及私隱政策。",
      sections: [
        { title: "反思工具，不是專業建議", paragraphs: ["Yi 依固定規則產生卦象事實，並可在你同意後，提供供文化及反思用途的來源材料與 AI 內容。它不是預言，亦不提供醫療、心理健康、法律、金融、投資、安全或其他專業建議。請勿以服務取代合資格專業人士、緊急服務或你自己的判斷。"] },
        { title: "帳戶與可接受使用", paragraphs: ["儲存、筆記、搜尋及對話需要帳戶。你須提供準確資料、妥善保護登入方式，並對帳戶活動負責；不得濫用服務、規避限制、干擾系統、侵犯他人權利、提交違法內容，或未經許可大量擷取來源目錄。"] },
        { title: "自願掛金", paragraphs: ["HK$0 已可完成閱讀。HK$1–888 的正數款項，是對數碼服務的自願掛金，並非慈善捐款。正數付款由 Stripe Checkout 處理，只有經驗證的 webhook 才會確認付款及顯示結果。退款可向 contact@rich-tide.com 提出，並會按適用法律、付款狀態及具體情況處理。"] },
        { title: "AI、來源與用量", paragraphs: ["AI 是自願功能，受每日公平使用及全域預算限制。來源與翻譯雖經審核，但歷史文本可有版本差異，AI 亦可能不完整或出錯；確定性卦象不會由 AI 更改。服務可在供應商故障、安全路由或觸發限額時，只提供確定性內容。"] },
        { title: "你的內容與服務材料", paragraphs: ["你保留對問題、筆記及對話內容所擁有的權利，並授予我們一項有限許可，僅限用於營運、保障、支援、匯出及刪除本服務。應用程式、設計、品牌、程式及來源目錄受各自權利保護；除法律允許外，不得複製或重新分發。"] },
        { title: "可用性、終止及責任", paragraphs: ["服務按現狀及可用情況提供。我們可維護、變更，或在合理需要時暫停功能；亦可因安全、濫用或違反條款而限制帳戶。你可以隨時刪除帳戶。在法律允許的最大範圍內，我們不對間接或相應損失負責；本條款不排除任何依法不能排除的權利或責任。"] },
        { title: "香港法律與聯絡", paragraphs: ["本條款受香港特別行政區法律管限，爭議由香港法院的非專屬司法管轄權處理。條款任何部分無效，不影響其餘部分。如有查詢，請電郵至 contact@rich-tide.com。"] },
      ],
    },
  },
  "zh-CN": {
    labels: { privacy: "隐私政策", terms: "使用条款", company: "RICHTIDE LIMITED" },
    privacy: {
      eyebrow: "数据与选择", title: "隐私政策", updated: "生效日期：2026 年 8 月 8 日",
      intro: "RICHTIDE LIMITED（“我们”）运营 Yi · 易。这份政策会说明：我们收集哪些个人数据、为何使用、与谁分享、保存多久，以及你可以如何行使自己的选择与权利。",
      sections: [
        { title: "我们持有的数据", paragraphs: ["我们可能持有你的姓名、邮箱地址、登录及验证记录、语言与显示设置；你提交的问题、卦象事实、已保存阅读、笔记及对话；随喜赞助金额、付款状态及 Stripe 标识符；联系表单内容；以及防滥用、错误与操作记录。完整支付卡数据由 Stripe 处理，我们不会存储。"] },
        { title: "使用目的", paragraphs: ["我们使用数据，以创建及保护账户、提供可重现阅读、保存你明确选择的内容、处理随喜赞助、回复支持请求、执行用量与安全限制、检测滥用、维护服务，并履行适用的法律义务。我们不会出售个人数据。"] },
        { title: "AI 由你选择", paragraphs: ["DeepSeek 反思是自愿功能。每次使用前，你都可以分别选择是否发送卦象事实、经审核的来源及原问题；高风险问题会绕过 AI。模型的隐藏推理不会回传至浏览器，也不会存储在浏览器；拒绝使用 AI 不影响确定性结果。"] },
        { title: "服务提供商与跨境处理", paragraphs: ["我们使用 Cloudflare 提供计算、数据库、安全及邮件；Better Auth 提供认证流程；Stripe 处理付款；Google 及 Microsoft 在你选择时提供登录；DeepSeek 只处理你明确同意发送的 AI 数据。这些提供商可能在香港以外处理数据，并受其条款及安全措施约束。我们也可能在法律要求，或为保护用户与服务而有必要时披露数据。"] },
        { title: "保存与分享", paragraphs: ["未保存的访客阅读会在七天内删除。匿名分享链接在七天后失效，且不含身份、原问题、笔记或对话。已保存的阅读、笔记及对话，会保留至你逐项删除或关闭账户。操作错误记录通常在 90 天后删除；付款及必要的审计数据，则可按法律、会计、争议及防欺诈需要保存更长时间。"] },
        { title: "安全、Cookie 与你的权利", paragraphs: ["我们使用同站 HTTP-only 会话、访问控制、加密传输及数据最小化。必要 Cookie 用于登录及安全；语言、主题及字体选择可存储在你的设备。你可以在设置中导出或删除账户，也可要求访问或更正个人数据；为保护数据安全，我们可能核实申请人身份。"] },
        { title: "联系与更新", paragraphs: ["如对本政策有疑问，或想提出访问、更正或删除请求，请发送邮件至 contact@rich-tide.com。我们可能会因服务或法律变化而更新本政策，并在本页标示新的生效日期。"] },
      ],
    },
    terms: {
      eyebrow: "服务边界", title: "使用条款", updated: "生效日期：2026 年 8 月 8 日",
      intro: "本条款是你与 RICHTIDE LIMITED 就使用 Yi · 易订立的协议。使用服务，即表示你同意本条款及隐私政策。",
      sections: [
        { title: "反思工具，不是专业建议", paragraphs: ["Yi 按固定规则生成卦象事实，并可在你同意后，提供供文化及反思用途的来源材料与 AI 内容。它不是预言，也不提供医疗、心理健康、法律、金融、投资、安全或其他专业建议。请勿以服务取代合格专业人士、紧急服务或你自己的判断。"] },
        { title: "账户与可接受使用", paragraphs: ["保存、笔记、搜索及对话需要账户。你须提供准确数据、妥善保护登录方式，并对账户活动负责；不得滥用服务、规避限制、干扰系统、侵犯他人权利、提交违法内容，或未经许可批量提取来源目录。"] },
        { title: "随喜赞助", paragraphs: ["HK$0 已可完成阅读。HK$1–888 的正数款项，是对数字服务的随喜赞助，并非慈善捐款。正数付款由 Stripe Checkout 处理，只有经验证的 webhook 才会确认付款及显示结果。退款可向 contact@rich-tide.com 提出，并会按适用法律、付款状态及具体情况处理。"] },
        { title: "AI、来源与用量", paragraphs: ["AI 是自愿功能，受每日公平使用及全局预算限制。来源与翻译虽经审核，但历史文本可能存在版本差异，AI 也可能不完整或出错；确定性卦象不会由 AI 更改。服务可在提供商故障、安全路由或触发限额时，只提供确定性内容。"] },
        { title: "你的内容与服务材料", paragraphs: ["你保留对问题、笔记及对话内容所拥有的权利，并授予我们有限的许可，仅限用于运营、保护、支持、导出及删除本服务。应用程序、设计、品牌、程序及来源目录受各自权利保护；除法律允许外，不得复制或重新分发。"] },
        { title: "可用性、终止及责任", paragraphs: ["服务按现状及可用情况提供。我们可维护、变更，或在合理需要时暂停功能；也可因安全、滥用或违反条款而限制账户。你可以随时删除账户。在法律允许的最大范围内，我们不对间接或后果性损失负责；本条款不排除任何依法不能排除的权利或责任。"] },
        { title: "香港法律与联系", paragraphs: ["本条款受香港特别行政区法律管辖，争议由香港法院的非专属司法管辖权处理。条款任何部分无效，不影响其余部分。如有查询，请发送邮件至 contact@rich-tide.com。"] },
      ],
    },
  },
  en: {
    labels: { privacy: "Privacy", terms: "Terms", company: "RICHTIDE LIMITED" },
    privacy: {
      eyebrow: "Data and choice", title: "Privacy Policy", updated: "Effective 8 August 2026",
      intro: "RICHTIDE LIMITED (“we”, “us”) operates Yi · 易. This policy explains what personal data we collect, why we use it, who receives it, how long it is kept, and how you can exercise your choices and rights.",
      sections: [
        { title: "Data we hold", paragraphs: ["We may hold your name, email address, sign-in and verification records, language and display settings; questions, cast facts, archived readings, notes and chats you submit; contribution amounts, payment status and Stripe identifiers; contact-form content; and anti-abuse, error and operational records. Stripe processes complete payment-card details; we do not store them."] },
        { title: "Why we use it", paragraphs: ["We use data to create and protect accounts, provide reproducible readings, retain content you explicitly save, process contributions, answer support requests, enforce usage and safety controls, detect abuse, maintain the service, and meet applicable legal obligations. We do not sell personal data."] },
        { title: "AI is your choice", paragraphs: ["DeepSeek reflection is optional. Before each use, you separately choose whether to send cast facts, reviewed sources and your original question. High-stakes questions bypass AI. Hidden model reasoning is not returned to or stored in the browser. Declining AI does not affect the deterministic result."] },
        { title: "Providers and international processing", paragraphs: ["We use Cloudflare for compute, databases, security and email; Better Auth for authentication flows; Stripe for payments; Google and Microsoft for sign-in when selected; and DeepSeek only for AI data you explicitly consent to send. These providers may process data outside Hong Kong under their terms and safeguards. We may also disclose data when legally required or reasonably necessary to protect users and the service."] },
        { title: "Retention and sharing", paragraphs: ["Unsaved guest readings are deleted within seven days. Anonymous share links expire after seven days and contain no identity, original question, notes or chat. Archived readings, notes and chats remain until you delete them or close the account. Operational error records are generally deleted after 90 days. Payment and essential audit data may be kept longer for legal, accounting, dispute and fraud-prevention needs."] },
        { title: "Security, cookies and your rights", paragraphs: ["We use same-site HTTP-only sessions, access controls, encrypted transport and data minimisation. Necessary cookies support sign-in and security; language, theme and font choices may be stored on your device. You can export or delete your account in Settings and request access to or correction of personal data. We may verify identity before fulfilling a request."] },
        { title: "Contact and changes", paragraphs: ["For questions or access, correction and deletion requests, email contact@rich-tide.com. We may update this policy as the service or law changes and will identify the new effective date on this page."] },
      ],
    },
    terms: {
      eyebrow: "Service boundaries", title: "Terms of Use", updated: "Effective 8 August 2026",
      intro: "These terms form an agreement between you and RICHTIDE LIMITED for use of Yi · 易. By using the service, you agree to these terms and the Privacy Policy.",
      sections: [
        { title: "Reflection, not professional advice", paragraphs: ["Yi produces cast facts using fixed rules and, with your consent, may provide source material and AI content for cultural reflection. It is not prediction and does not provide medical, mental-health, legal, financial, investment, safety or other professional advice. Do not use it instead of qualified professionals, emergency services or your own judgment."] },
        { title: "Accounts and acceptable use", paragraphs: ["An account is required for archives, notes, search and chat. You must provide accurate information, protect your sign-in method and take responsibility for account activity. Do not abuse the service, evade limits, disrupt systems, infringe rights, submit unlawful content or bulk-extract the source catalog without permission."] },
        { title: "Voluntary contributions", paragraphs: ["HK$0 completes a reading. Positive HK$1-888 amounts are voluntary contributions for the digital service, not charitable donations. Stripe Checkout processes positive payments; only a verified webhook confirms payment and releases the result. Refund requests may be sent to contact@rich-tide.com and are handled according to applicable law, payment status and the circumstances."] },
        { title: "AI, sources and usage", paragraphs: ["AI is optional and subject to daily fair-use and global budget limits. Sources and translations are reviewed, but historical texts can vary by edition and AI can be incomplete or wrong. AI never changes the deterministic cast. The service may return deterministic content only when a provider fails, safety routing applies or a limit is reached."] },
        { title: "Your content and service materials", paragraphs: ["You retain rights you hold in questions, notes and chat content and grant us a limited licence only as needed to operate, secure, support, export and delete the service. The application, design, brand, code and source catalog remain protected by their respective rights and may not be copied or redistributed except as permitted by law."] },
        { title: "Availability, termination and liability", paragraphs: ["The service is provided as available. We may maintain, change or reasonably suspend features and may restrict accounts for security, abuse or breach of these terms. You may delete your account at any time. To the fullest extent permitted by law, we are not liable for indirect or consequential loss; these terms do not exclude rights or liabilities that cannot lawfully be excluded."] },
        { title: "Hong Kong law and contact", paragraphs: ["These terms are governed by the laws of the Hong Kong Special Administrative Region, with disputes subject to the non-exclusive jurisdiction of Hong Kong courts. If one provision is invalid, the remainder continues. Questions may be sent to contact@rich-tide.com."] },
      ],
    },
  },
};
