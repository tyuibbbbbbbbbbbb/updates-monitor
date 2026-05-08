# 💬 צ'אט עדכונים – החתול השחור & הגיזרה

דף HTML סטטי על **GitHub Pages** שמציג עדכונים מ[החתול השחור](https://black-cat.thechats.click/) ו[הגיזרה](https://hagizra.news/) בסגנון צ'אט.

**לא צריך שרת. עובד ישירות מהדפדפן.**

## כתובת הצ'אט

https://tyuibbbbbbbbbbbb.github.io/updates-monitor/

## איך זה עובד

1. **GitHub Actions** סורק את האתרים כל דקה (ענן, ללא נטפרי)
2. שומר את התוצאות + תמונות ל-`data/` בריפו
3. דף ה-HTML טוען את ה-JSON מ-`raw.githubusercontent.com` (לא חסום בנטפרי)
4. הודעות חדשות מתווספות למטה אוטומטית, ללא ריענון דף

## מבנה

```
├── index.html / styles.css / app.js  # ממשק צ'אט (GitHub Pages)
├── scraper.js                         # לוגיקת סריקה + הורדת תמונות
├── sources.js                         # הגדרות אתרים
├── scripts/scrape.js                  # רץ ב-GitHub Actions
├── .github/workflows/scrape.yml       # cron כל דקה
└── data/
    ├── updates.json                   # נתוני ההודעות
    ├── firstSeen.json                 # מעקב
    └── images/                        # תמונות שהורדו (נגישות דרך נטפרי)
```
