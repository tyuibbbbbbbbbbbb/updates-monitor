# 📰 מוניטור עדכונים – החתול השחור & הגיזרה

שרת Node.js שמציג עדכונים מאתר **החתול השחור** ומאתר **הגיזרה** בממשק עברי RTL.

## 🧠 ארכיטקטורה (עוקפת חסימת נטפרי)

```
   ┌─────────────────────┐    כל 10 דק'    ┌──────────────┐
   │  GitHub Actions     │ ───── סורק ────► │  אתרי המקור  │
   │  (ענן, לא מסונן)    │                  │  black-cat / │
   └────────┬────────────┘                  │  hagizra.news│
            │                                └──────────────┘
            │ commit
            ▼
   ┌─────────────────────┐
   │ data/updates.json   │   ◄── raw.githubusercontent.com (לא חסום בנטפרי)
   │  בריפו GitHub       │
   └────────┬────────────┘
            │ fetch כל 5 דק'
            ▼
   ┌─────────────────────┐
   │ שרת Node.js מקומי   │ ──► http://localhost:3000  (UI)
   │ במחשב שלך           │
   └─────────────────────┘
```

הסקרייפינג רץ **ב-GitHub Actions** (שם אין נטפרי) ושומר את התוצאות לקובץ `data/updates.json` בריפו. השרת המקומי מוריד את הקובץ דרך `raw.githubusercontent.com` שאינו חסום, ומציג אותו בדפדפן.

## 🚀 הרצה מקומית

```bash
npm install
npm start
```

פתח את `http://localhost:3000`.

משתני סביבה אופציונליים:
- `PORT` – פורט (ברירת מחדל 3000)
- `REFRESH_MINUTES` – כל כמה דקות להוריד JSON מ-GitHub (ברירת מחדל 5)
- `GITHUB_USER`, `GITHUB_REPO`, `GITHUB_BRANCH` – אם תפצל לריפו אחר
- `DATA_URL` – override מלא לכתובת ה-JSON

## ⚙️ הפעלת ה-GitHub Action

ה-workflow ב-`.github/workflows/scrape.yml` מוגדר לרוץ אוטומטית **כל 10 דקות**.

### הפעלה ראשונה ידנית
1. לך ל-https://github.com/tyuibbbbbbbbbbbb/updates-monitor/actions
2. בחר **Scrape Updates** → **Run workflow** → **Run workflow** (כפתור ירוק)
3. אחרי ~30 שניות תיווצר תיקייה `data/` עם `updates.json` ו-`firstSeen.json`
4. השרת המקומי יתחיל להציג את הנתונים בדפדפן

> **הערה חשובה:** GitHub מאט workflows מתוזמנים בריפו לא פעיל. אם זה מפסיק לרוץ – פשוט עשה Run workflow ידני פעם בכמה ימים, או דחוף commit כלשהו.

## 📁 מבנה

```
updates-monitor/
├── server.js                    # שרת מקומי – קורא מ-GitHub raw
├── scraper.js                   # הגיון סקרייפינג (משותף)
├── sources.js                   # הגדרות אתרי המקור + סלקטורים
├── scripts/scrape.js            # סקריפט שרץ ב-GitHub Actions
├── .github/workflows/scrape.yml # workflow אוטומטי כל 10 דק'
├── data/
│   ├── updates.json             # פלט הסריקה (נוצר אוטומטית)
│   └── firstSeen.json           # מעקב אחר פריטים שנראו
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── package.json
```

## 🔧 התאמת סלקטורים

אם הסקרייפר לא מוצא פריטים (תראה "0 פריטים" בלוג של ה-Action):
1. ערוך את הסלקטורים ב-`sources.js`
2. דחוף commit – ה-workflow יורץ אוטומטית מחדש
3. שרת ה-localhost יקלוט את הנתונים החדשים תוך עד 5 דקות

## 🧪 API מקומי

| Endpoint           | Method | תיאור                                   |
|--------------------|--------|------------------------------------------|
| `/api/updates`     | GET    | הנתונים העדכניים שירדו מ-GitHub          |
| `/api/refresh`     | POST   | הורדה מיידית של ה-JSON מ-GitHub          |
| `/api/health`      | GET    | בדיקת חיים                              |
