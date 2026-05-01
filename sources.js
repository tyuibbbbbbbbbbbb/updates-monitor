// הגדרת מקורות הסקרייפינג. שני האתרים הם Angular SPA עם ערוצי הודעות.
// כל הודעה היא <app-message>; אנו מחלצים מתוכה תוכן + תאריך.
module.exports = [
  {
    id: "blackcat",
    name: "החתול השחור",
    url: "https://black-cat.thechats.click/",
    icon: "🐱",
    color: "#1f2937",
    mode: "feed",
    itemSelector: "app-message",
    contentSelectors: [
      ".message-card .markdown-container",
      ".message-card-wrap",
      ".message-card",
      ".message-shell",
    ],
    titleSelectors: [
      ".message-channel-name",
    ],
    timeSelectors: [
      "time",
      "[class*='time']",
      ".message-meta-row span:last-child",
    ],
    limit: 25,
  },
  {
    id: "hagizra",
    name: "הגיזרה",
    url: "https://hagizra.news/",
    icon: "📡",
    color: "#dc2626",
    mode: "feed",
    itemSelector: "app-message",
    contentSelectors: [
      ".markdown-container",
      ".message-content-wrapper",
    ],
    titleSelectors: [],
    timeSelectors: [
      "time",
      "[class*='time']",
    ],
    limit: 25,
  },
];
