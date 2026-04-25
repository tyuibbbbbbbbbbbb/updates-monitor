# 📰 מוניטור עדכונים – החתול השחור & הגיזרה

שרת Node.js/Express שמושך עדכונים אוטומטית מאתר **החתול השחור** (`black-cat.thechats.click`) ומאתר **הגיזרה** (`hagizra.news`), ומציג אותם בדפדפן בממשק עברי RTL כהה ונקי.

## ✨ פיצ'רים

- **סריקה אוטומטית** כל 10 דקות (ניתן להתאמה ב-`POLL_MINUTES`).
- **זיהוי עדכונים חדשים** – פריטים שלא נראו לפני כן מסומנים כ"חדש" למשך 24 שעות.
- **סינון** לפי מקור / רק חדשים / הכל.
- **שמירת state** ב-`state.json` כדי לא לאבד מה כבר ראינו.
- **ממשק RTL** עברי כהה עם ריענון אוטומטי כל 30 שניות.
- **API JSON** ב-`/api/updates`, `/api/refresh`, `/api/health`.

## ⚠️ חשוב: רשת נטפרי

המחשב שלך מחובר לרשת **נטפרי** (סינון תוכן ישראלי) ולכן שני האתרים חסומים ממנו — הסקרייפר יקבל HTTP 418 עם דף חסימה של `netfree.link`.

**הפתרון:** הרץ את השרת בשירות ענן (Render / Railway / Fly.io) ששם אין סינון. שם הסריקה תעבוד כרגיל. ראה את הסעיף "העלאה ל-GitHub והפעלה" למטה.

ממשק הווב יציג שגיאה ברורה עם הטקסט "הרשת מסוננת (נטפרי)" במקרה הזה.

## 🚀 הרצה מקומית

```bash
npm install
npm start
```

ואז פתח את `http://localhost:3000`.

משתני סביבה אופציונליים:
- `PORT` – פורט (ברירת מחדל 3000)
- `POLL_MINUTES` – תדירות סריקה בדקות (ברירת מחדל 10)

## 📁 מבנה

```
updates-monitor/
├── server.js          # שרת Express + polling
├── scraper.js         # הגיון הסקרייפינג עם cheerio
├── sources.js         # הגדרות המקורות (URL וסלקטורים)
├── public/
│   ├── index.html     # דף הבית
│   ├── styles.css     # עיצוב RTL כהה
│   └── app.js         # JS צד-לקוח
├── package.json
└── README.md
```

## 🌐 העלאה ל-GitHub והפעלה

1. צור ריפו חדש ב-GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/USER/REPO.git
   git push -u origin main
   ```

2. **דפלוי חינמי** (השרת חייב לרוץ 24/7):
   - **Render.com** – חבר את הריפו, בחר Web Service, Build = `npm install`, Start = `npm start`.
   - **Railway.app** – אותו דבר, מזהה Node.js אוטומטית.
   - **Fly.io** – `flyctl launch` בתיקייה.
   - **Codespaces** – אם זה רק לשימוש אישי, אפשר להפעיל מתוך GitHub Codespaces.

## 🔧 התאמה אישית

אם המבנה של אחד האתרים משתנה והסקרייפר לא מוצא פריטים:
- ערוך את הסלקטורים ב-`sources.js` (`selectors: [...]`).
- הסקרייפר מנסה את הסלקטורים בסדר עד שאחד מחזיר תוצאות.

## 🧪 API

| Endpoint           | Method | תיאור                                      |
|--------------------|--------|--------------------------------------------|
| `/api/updates`     | GET    | כל הפריטים האחרונים + מטא־דאטה              |
| `/api/refresh`     | POST   | מפעיל סריקה ידנית עכשיו                     |
| `/api/health`      | GET    | בדיקת חיים                                 |
