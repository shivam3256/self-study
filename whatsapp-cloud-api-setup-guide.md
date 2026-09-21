# WhatsApp Meta Cloud API Setup & Integration Guide

This guide provides step-by-step instructions to configure and send automated WhatsApp fee renewal reminders using the **WhatsApp Meta Cloud API** for the Self-Study Center SaaS platform.

---

## 📋 Overview of Architecture

```
[ Scheduled Celery / API Trigger ]
              │
              ▼
[ ReminderService: Checks Student Expiry Dates (7/3/1 days & Overdue) ]
              │
              ▼
[ Celery Worker: send_whatsapp_task ]
              │
              ▼
[ Meta WhatsApp Cloud API (Graph API v20.0) ]
              │
              ▼
[ Student's WhatsApp (Delivered) ]
```

---

## 🚀 Step-by-Step Setup Guide

### Step 1: Create a Meta Developer Account
1. Go to the [Meta for Developers Portal](https://developers.facebook.com/).
2. Log in with your Facebook account.
3. Click **Get Started** / **Create Account** and complete verification (email & phone).

---

### Step 2: Create a Meta App
1. Navigate to **My Apps** → Click **Create App**.
2. Select **Other** as the use case → Click **Next**.
3. Choose **Business** as the App Type → Click **Next**.
4. Enter:
   - **App Name**: `Self-Study Management` (or your preferred name).
   - **App Contact Email**: Your active email address.
   - **Business Account**: Select your Meta Business Account (or let Meta create one).
5. Click **Create App**.

---

### Step 3: Add WhatsApp Product to your App
1. In the App Dashboard, scroll down to the **Add products to your app** section.
2. Locate **WhatsApp** and click **Set Up**.
3. You will be redirected to the **WhatsApp Quickstart / API Setup** page.

---

### Step 4: Get Your Credentials (Testing Mode)
On the **WhatsApp > API Setup** tab:

1. **Phone Number ID**: Copy the numeric ID displayed under *"Phone number ID"* (e.g., `109283746592817`).
2. **WhatsApp Business Account ID (WABA ID)**: Copy the numeric ID under *"WhatsApp Business Account ID"*.
3. **Temporary Access Token**: Copy the token (valid for 24 hours for initial testing).
4. **Recipient Phone Number (For Testing)**:
   - In the *"To"* field on the dashboard, add your personal phone number (with country code, e.g., `919876543210`) and enter the OTP received on WhatsApp to authorize it for test sends.

---

### Step 5: Generate a Permanent System User Token (Production)

Temporary tokens expire in 24 hours. Follow these steps to create a permanent token:

1. Open [Meta Business Suite](https://business.facebook.com/settings).
2. Go to **Settings** → **Business Settings**.
3. Under **Users**, click **System Users** → Click **Add**.
4. Name the system user (e.g., `SaaS-WhatsApp-Bot`) and select role **Admin**.
5. Click **Add Assets**:
   - Choose **Apps** → Select your app → Toggle **Full Control (Manage App)** ON.
   - Choose **WhatsApp Accounts** → Select your WABA account → Toggle **Full Control (Manage WhatsApp Account)** ON.
   - Save changes.
6. Click **Generate New Token**:
   - Select your App.
   - Set **Token Expiration** to **Never** (Permanent).
   - Check the following permissions:
     - `whatsapp_business_messaging`
     - `whatsapp_business_management`
7. Click **Generate Token** and copy the resulting string immediately (it is only shown once).

---

### Step 6: Add Your Real Business Phone Number (Optional for Go-Live)
1. In **WhatsApp > API Setup**, scroll to **Step 5: Add a phone number**.
2. Click **Add Phone Number**.
3. Enter your Business Display Name, Category, and Phone Number.
4. Verify via SMS/Voice call OTP.
5. Once verified, copy the new **Phone Number ID** for this production number.

---

### Step 7: Configure Environment Variables in the Backend

Open the backend `.env` file (`backend/.env`) and populate your credentials:

```env
# WhatsApp Meta Cloud API Configuration
WHATSAPP_PROVIDER=meta
WHATSAPP_ACCESS_TOKEN=EAAG...your_permanent_system_user_token_here...
WHATSAPP_PHONE_NUMBER_ID=109283746592817
WHATSAPP_BUSINESS_ACCOUNT_ID=102938475610293
WHATSAPP_API_VERSION=v20.0
```

> **Note on Local Development / Testing without Meta API**:
> Leave `WHATSAPP_PROVIDER=mock`. The system will automatically record simulated successful message deliveries in the audit logs without calling external network APIs.

---

### Step 8: (Optional) Creating Message Templates for Proactive Notifications

Outside a 24-hour user-initiated window, WhatsApp requires pre-approved **Message Templates**.

1. Go to **WhatsApp Manager** → **Message Templates**.
2. Click **Create Template**.
3. Choose Category: **Utility** (for payment/renewal alerts).
4. Name: `fee_renewal_reminder`.
5. Language: `English` (or your preferred language).
6. Body Example:
   ```
   Hello {{1}}, your membership at {{2}} is expiring on {{3}}. Please renew to secure your reserved desk. Contact {{4}}.
   ```
7. Submit for Meta review (usually approved in 1–5 minutes).

---

## 🧪 Testing & Verification

### 1. From the Web Interface
1. Start Backend & Frontend:
   - Backend: `uvicorn app.main:app --reload --port 8000`
   - Frontend: `npm run dev`
2. Log into the application dashboard.
3. Click **WhatsApp Reminders** in the sidebar.
4. Click **Trigger Due-Date Reminders Now**.
5. The system scans active students, matches upcoming expiry dates (7, 3, 1 day, or overdue), dispatches messages, and logs delivery status in real-time in the table.
6. Failed messages provide an interactive **Retry** button.

### 2. From Automated Tests
Run pytest in the backend directory:
```bash
venv\Scripts\python.exe -m pytest -k test_whatsapp_reminders_flow
```

---

## 🛠️ Common Meta Cloud API Error Codes & Solutions

| Error Code | Error Description | Solution |
|---|---|---|
| `190` | Invalid / Expired OAuth Token | Generate a new permanent System User Access Token in Meta Business Settings. |
| `100` | Param / Phone Number Format Error | Ensure phone number includes international dial code without `+` or spaces (e.g., `919876543210`). |
| `131030` | Recipient Not in Allowed List | When using a test phone number, you must whitelist the recipient number in the Meta App Dashboard under WhatsApp API Setup. |
| `131047` | Re-engagement Window Closed | Customer has not messaged you in 24 hours. Send a pre-approved Meta Template message instead of a free-form session message. |
| `131056` | Payment Method Missing | Add a payment method to your Meta Business Account in WhatsApp Billing settings. |
