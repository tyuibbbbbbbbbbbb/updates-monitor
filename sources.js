// הגדרת מקורות הסקרייפינג
module.exports = [
  {
    id: "blackcat",
    name: "החתול השחור",
    url: "https://black-cat.thechats.click/",
    icon: "🐱",
    color: "#1f2937",
    // סלקטורים שמנוסים בסדר עד שאחד עובד
    selectors: [
      "a.topic-title",
      "a.title.raw-link",
      ".topic-list-item a",
      ".discussion-title a",
      ".post-title a",
      "article h2 a, article h3 a",
      "main a[href*='/topic/'], main a[href*='/t/']",
    ],
    limit: 25,
  },
  {
    id: "hagizra",
    name: "הגיזרה",
    url: "https://hagizra.news/",
    icon: "📡",
    color: "#dc2626",
    selectors: [
      "article h2 a, article h3 a",
      ".post-title a, .entry-title a, h2.entry-title a",
      ".td-module-title a, .td_module_wrap a.td-image-wrap",
      ".elementor-post__title a",
      "a.title",
      "main a[href*='/202'], main a[href*='/news/'], main a[href*='/post/']",
    ],
    limit: 25,
    fallbackText: false,
  },
];
