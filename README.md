# ES Print Group — Open House 2026 Registration System

A complete Registration and Notification System for the **ES Print Group Open House 2026** built with **Google Apps Script (GAS)**, **HTML/CSS Form**, and the **Resend API**.

---

## 📌 Features

- **🌐 Embeddable Registration Form (`index.html`)**
  - Clean and responsive user interface (ready to embed via iframe in Webflow, WordPress, or custom websites).
  - Built-in anti-spam protection using a honeypot field and timestamp validation (no external Captcha required).
- **📊 Multi-Sheet Event Routing (`Code.gs`)**
  - Automatically routes registration data to the appropriate Google Sheet based on city or event keyword (e.g., *Cabanatuan, Tacloban, CDO, Bacolod, Makati, Cebu*).
  - Includes a fallback default Google Sheet if no keyword matches.
- **✉️ Dynamic Email Notifications via Resend API**
  - **Attendee Confirmation Email:** Instantly sent to the registrant with event details and schedule.
  - **Admin Notification Email:** Real-time alert for the sales/admin team upon every new registration.
  - Dynamic sender name matching the Event Title.
- **☑️ Google Sheets Follow-Up Triggers**
  - Interactive checkbox triggers directly inside Google Sheets:
    - **Column Q:** Reminder (H-1 / Day before the visit)
    - **Column R:** Thank You / Feedback email
    - **Column S:** No-Show / Missed visit email

---

## 📁 Repository Structure

```text
├── Code.gs        # Google Apps Script backend logic, routing, & Resend API integrations
├── index.html     # Registration form frontend interface & client-side validation
└── README.md      # Documentation and deployment guide
```

---

## ⚙️ Configuration

Open [Code.gs](Code.gs) and configure the following constants:

### 1. Sheet Routing (`SHEET_ROUTES`)
Map each city/keyword to its corresponding Google Spreadsheet ID:
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
Ensure your verified sender domain and API key are configured:
```javascript
const RESEND_API_KEY = 're_xxxxxxxxxxxx';
const SENDER_EMAIL   = 'events@yourdomain.com';
```

---

## 🚀 Deployment Guide (Google Apps Script)

1. **Create a new Google Apps Script Project:**
   - Go to [script.google.com](https://script.google.com).
   - Click **New Project**.
2. **Copy the Project Files:**
   - Paste the contents of `Code.gs` into the script editor.
   - Add an HTML file named `registration-form` (or `index`) and paste the contents of `index.html`.
3. **Deploy as a Web App:**
   - Click **Deploy** > **New deployment**.
   - Select type: **Web app**.
   - **Execute as:** `Me (your Google account)`.
   - **Who has access:** `Anyone`.
   - Click **Deploy** and copy the Web App URL.
4. **Embed in Webflow / Website:**
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
