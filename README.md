# ES Print Group — Open House 2026 Registration System

Isang kumpletong Registration and Notification System para sa **ES Print Group Open House 2026** gamit ang **Google Apps Script (GAS)**, **HTML/CSS Form**, at **Resend API**.

---

## 📌 Features

- **🌐 Embeddable Registration Form (`index.html`)**
  - Malinis at responsive na user interface (swak i-embed via iframe sa Webflow, WordPress, o custom site).
  - Built-in anti-spam protection gamit ang honeypot field at timestamp validation (walang external Captcha na kailangan).
- **📊 Multi-Sheet Event Routing (`Code.gs`)**
  - Automatic routing ng registration data sa tamang Google Sheet base sa lungsod o keyword ng event (e.g., *Cabanatuan, Tacloban, CDO, Bacolod, Makati, Cebu*).
  - May fallback default Google Sheet sakaling walang mag-match na keyword.
- **✉️ Dynamic Email Notifications via Resend API**
  - **Attendee Confirmation Email:** Agad na ipinapadala sa nag-register kasama ang event details at schedule.
  - **Admin Notification Email:** Alerto para sa sales/admin team kapag may bagong registration.
  - Dynamic sender name base sa mismong Event Title.
- **☑️ Google Sheets Follow-Up Triggers**
  - May interactive checkbox triggers sa Google Sheet:
    - **Column Q:** Reminder (H-1 / Day before the visit)
    - **Column R:** Thank You / Feedback email
    - **Column S:** No-Show / Missed visit email

---

## 📁 Repository Structure

```text
├── Code.gs        # Google Apps Script backend logic, routing, & Resend API integrations
├── index.html     # Registration form frontend interface & client-side validation
└── README.md      # Documentation at deployment guide
```

---

## ⚙️ Configuration

Buksan ang [Code.gs](Code.gs) at i-configure ang mga sumusunod na constants:

### 1. Sheet Routing (`SHEET_ROUTES`)
I-map ang bawat lungsod/keyword sa kaukulang Google Spreadsheet ID:
```javascript
const SHEET_ROUTES = [            
  { keyword: 'CABANATUAN', sheetId: 'YOUR_SPREADSHEET_ID_HERE' },
  { keyword: 'TACLOBAN',   sheetId: 'YOUR_SPREADSHEET_ID_HERE' },
  { keyword: 'CDO',        sheetId: 'YOUR_SPREADSHEET_ID_HERE' },
  { keyword: 'BACOLOD',    sheetId: 'YOUR_SPREADSHEET_ID_HERE' },
  { keyword: 'MAKATI',     sheetId: 'YOUR_SPREADSHEET_ID_HERE' },
  { keyword: 'CEBU',       sheetId: 'YOUR_SPREADSHEET_ID_HERE' }
];

const DEFAULT_SHEET_ID = 'YOUR_FALLBACK_SPREADSHEET_ID';
const NOTIFY_EMAIL = 'sales@esprintmedia.com';
```

### 2. Resend API Keys & Sender Email
Siguraduhing naka-set ang iyong verified sender domain at API key:
```javascript
const RESEND_API_KEY = 're_xxxxxxxxxxxx';
const SENDER_EMAIL   = 'events@yourdomain.com';
```

---

## 🚀 Deployment Guide (Google Apps Script)

1. **Gumawa ng bagong Google Apps Script Project:**
   - Pumunta sa [script.google.com](https://script.google.com).
   - Lumikha ng **New Project**.
2. **Kopyahin ang mga Files:**
   - I-paste ang laman ng `Code.gs` sa script editor.
   - Magdagdag ng HTML file na pinangalanang `registration-form` (o `index`) at i-paste ang laman ng `index.html`.
3. **I-deploy bilang Web App:**
   - I-click ang **Deploy** > **New deployment**.
   - Piliin ang uri: **Web app**.
   - **Execute as:** `Me (your Google account)`.
   - **Who has access:** `Anyone`.
   - I-click ang **Deploy** at kopyahin ang Web App URL.
4. **I-embed sa Webflow / Website:**
   ```html
   <iframe 
     src="YOUR_WEB_APP_URL" 
     width="100%" 
     height="850px" 
     frameborder="0" 
     style="border: none; max-width: 680px; display: block; margin: 0 auto;">
   </iframe>
   ```

---

## 📄 License

Internal use for **ES Print Group Open House 2026**.
