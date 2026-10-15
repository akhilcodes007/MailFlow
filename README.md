# MailFlow — Production-Ready Bulk Email Platform

MailFlow is a full-stack MERN application for managing bulk email campaigns with recipient import, personalization, dry-run simulation, and delivery telemetry via Twilio SendGrid (`@sendgrid/mail`).

---

## 🛠️ Architecture & Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Lucide Icons, Axios, DOMPurify, SheetJS (`xlsx`)
- **Backend**: Node.js, Express, Mongoose, Helmet, Morgan, Express-Rate-Limit, Express-Validator
- **Database**: MongoDB Atlas Replica Set (with indexes on campaigns, recipients, and suppressions)
- **Email Service**: Twilio SendGrid exclusively (`@sendgrid/mail` & `@sendgrid/eventwebhook`)
- **Authentication**: JWT authentication with bcryptjs (cost factor 12), seeded admin, strict login rate-limiting
- **Automated Testing**: Jest, Supertest

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies

In root:
```bash
cd server && npm install
cd ../client && npm install
cd ..
```

### 2. Configure Environment

Create `server/.env` (excluded from git):
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://<USER>:<PASSWORD>@<HOST>:27017/mailflow?ssl=true&replicaSet=<REPLICA_SET>&authSource=admin
JWT_SECRET=your_super_strong_random_secret_at_least_64_characters
JWT_EXPIRES_IN=8h
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=AdminPass123!
CLIENT_ORIGIN=http://localhost:5173
SENDGRID_API_KEY=SG.your_actual_key_here
SENDGRID_FROM_EMAIL=verified_sender@yourdomain.com
SENDGRID_FROM_NAME=MailFlow
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
MAX_RECIPIENTS_PER_CAMPAIGN=500
```

### 3. Seed Initial Administrator Account
Public registration is intentionally disabled. Seed the admin via CLI:
```bash
npm run seed --prefix server
```

Default credentials:
- **Email**: `admin@example.com`
- **Password**: `AdminPass123!` (or value from `ADMIN_PASSWORD`)

### 4. Start the Application

Open two terminals (or use the root scripts):

**Terminal 1 — Backend:**
```bash
npm run dev --prefix server
# Server starts on http://localhost:5000
```

**Terminal 2 — Frontend:**
```bash
npm run dev --prefix client
# Client starts on http://localhost:5173
```

---

## 🧪 Automated Testing

Run the automated test suite (Jest + Supertest):
```bash
npm test --prefix server
```
Tests cover:
- Email syntax validation, normalization & deduplication
- HTML sanitization against XSS & script injection
- Personalization merge tags (`{{name}}`, `{{email}}`)
- Dry-run safety execution
- Authentication guards and login rate limiting
- SendGrid webhook signature verification

---

## 📧 Features & Workflows

### 1. Recipient Import & Hygiene
- **Formats**: CSV, Excel `.xlsx`, `.xls` parsed entirely in the browser using SheetJS.
- **Auto-Detection**: Automatic column detection for email and name headers, with manual dropdown overrides.
- **Validation**: Strict RFC 5322 syntax validation, case normalization, and deduplication.
- **Preview & Hygiene**: Filter tabs for Valid, Invalid, and Duplicates.
- **Reporting**: Export invalid addresses with failure reasons as a downloadable `.csv` report.
- **Safety Limits**: Max 5MB file upload limit, capped at 500 recipients per campaign.
- **Server Pre-flight**: Secondary validation executed on the server before database storage.

### 2. Message Composer & Preview
- **Rich Editor**: HTML and plain-text support with formatting toolbars.
- **Merge Tags**: Instant inserters for `{{name}}` and `{{email}}`.
- **Live Preview**: Sanitized using DOMPurify with sample recipient data.
- **Admin Test Email**: Test button to dispatch a sample email directly to the authenticated admin.
- **Launch Confirmation**: Irreversible dispatch warning with mode selection (Dry-Run vs Live).

### 3. SendGrid Engine & Telemetry
- **Default Dry-Run Mode**: Defaults to safe simulated sends unless explicitly configured with live credentials.
- **Recipient Isolation**: Individual isolated dispatches preventing recipients from viewing each other's addresses.
- **Batch Pacing**: Controlled concurrency and delay pacing between batches to respect SendGrid rate limits.
- **Durable State**: Atomic state transitions (`draft` -> `sending` -> `completed` / `dry-run`) with recipient-level status updates (`pending`, `processing`, `accepted`, `delivered`, `bounced`, `failed`).
- **Transient Retries**: Exponential backoff on HTTP 429, 500, 503 errors.
- **Ambiguous Timeout Protection**: Does not blindly resend timed-out requests to prevent duplicate emails.
- **Consent Suppressions**: Automatically checks unsubscribe and bounce lists before sending.

### 4. SendGrid Event Webhook Integration
- **Endpoint**: `POST /api/webhooks/sendgrid`
- **Security**: Cryptographic ECDSA signature verification via `@sendgrid/eventwebhook` using `SENDGRID_WEBHOOK_VERIFICATION_KEY`.
- **Idempotency**: Prevents duplicate webhook events using MongoDB TTL deduplication (`sg_event_id`).
- **Telemetry**: Correlates delivery (`delivered`, `bounce`, `dropped`) with recipients and updates campaign statistics.

---

## 🔒 Safe Live Email Test Instructions

To conduct a controlled live test:
1. Ensure your sender email (`SENDGRID_FROM_EMAIL`) has completed **Single Sender Verification** or **Domain Authentication** in your SendGrid dashboard.
2. In `server/.env`, verify `SENDGRID_API_KEY` contains your active key.
3. In the MailFlow UI, go to **Compose Campaign**.
4. Enter your subject and content.
5. In the toolbar, click **Send Test to Admin** with mode set to **LIVE**.
6. Check your inbox for the delivery.

---

## 🌐 Production Deployment

### Frontend (Vercel)
1. Push project to GitHub.
2. Import root repository into Vercel.
3. Set **Root Directory** to `client`.
4. Configure Environment Variable:
   - `VITE_API_URL`: `https://your-backend-api.onrender.com/api` (or custom domain).
5. Deploy. `client/vercel.json` ensures client-side routing works for all routes.

### Backend (Render / Railway / DigitalOcean)
1. Set Root Directory to `server`.
2. Build Command: `npm install`
3. Start Command: `node src/index.js`
4. Configure Environment Variables:
   - `PORT`: `5000` (or host assigned port)
   - `NODE_ENV`: `production`
   - `MONGODB_URI`: Your MongoDB Atlas URI
   - `JWT_SECRET`: 64+ char random hex string
   - `CLIENT_ORIGIN`: Your production Vercel frontend URL
   - `SENDGRID_API_KEY`: Production SendGrid key
   - `SENDGRID_FROM_EMAIL`: Verified sender address
   - `SENDGRID_WEBHOOK_VERIFICATION_KEY`: Public key from SendGrid Event Webhook settings.
