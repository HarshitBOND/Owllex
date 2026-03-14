# LexVert Subscription Model - Automated Hearing Tracker
## "We Handle Everything - Lawyers Get Alerts & Peace of Mind"

---

## 🎯 Core Concept

```
┌────────────────────────────────────────────────────────────┐
│  SYSTEM AUTOMATICALLY HANDLES EVERYTHING                   │
│  Lawyers Just Pay & Receive Notifications                 │
└────────────────────────────────────────────────────────────┘

Delhi High Court PDFs 
    ↓ (Daily)
System Downloads Automatically
    ↓
Parser Extracts ALL Cases
    ↓
Check Each Case Against Subscribed Lawyers
    ↓
Case match lawyer's registered keywords?
    ├─ YES + SUBSCRIBED = SEND NOTIFICATION ✓
    ├─ YES + NOT SUBSCRIBED = SKIP
    └─ NO MATCH = SKIP
    ↓
Lawyer Receives Alert Without Doing Anything
    ↓
"Your case W.P.(C) 12345/2024 hearing on 15.03.2026"
```

---

## 💰 Subscription Tiers

### **Tier 1: STARTER ($99/month)**
```
✓ Track up to 5 active cases
✓ Email notifications only
✓ Notifications 3 days + 1 day before hearing
✓ Web dashboard to view cases
✗ SMS notifications
✗ Client portal
✗ Case status updates
```

### **Tier 2: PROFESSIONAL ($299/month)**
```
✓ Track up to 50 active cases
✓ Email + SMS notifications
✓ Notifications 7 days, 3 days, 1 day, day of
✓ Web dashboard + internal notes
✓ Client portal (read-only access for your clients)
✓ Push notifications
✓ Case linking to multiple clients
✓ Bulk case tracking
```

### **Tier 3: ENTERPRISE ($999/month)**
```
✓ Unlimited case tracking
✓ All channels: Email, SMS, Push, WhatsApp
✓ Custom notification schedule
✓ Advanced analytics & case reports
✓ Dedicated case manager (email support)
✓ Custom integrations
✓ API access for their own systems
✓ Priority support
✓ Auto-refresh every 3 hours vs 12 hours
✓ Scheduled reports (daily case digest)
```

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    LAWYER SUBSCRIBES                         │
│  1. Pays monthly subscription ($99, $299, $999)             │
│  2. Registers keywords to track:                            │
│     - Case numbers: W.P.(C) 12345/2024                     │
│     - Party names: "XYZ Corporation"                       │
│     - Judges: "Justice Tejas Karia"                        │
│     - Court numbers: "COURT NO. 01"                        │
│  3. Provides phone for SMS                                 │
│  4. Sets notification preferences (time zone, days before)  │
│  5. Done. System takes over.                               │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│                SYSTEM AUTOMATION (BACKEND)                   │
│                                                              │
│  DAILY JOB (Every 6 Hours):                                │
│  ┌────────────────────────────────────────────────────────┐│
│  │ 1. Download latest PDFs from Delhi HC               ││
│  │    - combined_adv_DD.MM.YYYY.pdf                    ││
│  │    - adv_DD.MM.YYYY.pdf                             ││
│  │    - new_c_DDMMYYYY.pdf                             ││
│  │                                                      ││
│  │ 2. Parser extracts all cases                        ││
│  │    - Case numbers, parties, judges, dates, courts  ││
│  │                                                      ││
│  │ 3. FOR EACH CASE:                                   ││
│  │    a) Check: Does it match any subscribed lawyer?  ││
│  │    b) Get lawyer subscription details               ││
│  │    c) Check: Is subscription active + paid?         ││
│  │    d) If YES → Create notification entries          ││
│  │    e) If NO → Log & skip                            ││
│  │                                                      ││
│  │ 4. Store in database:                               ││
│  │    - Case found                                     ││
│  │    - Matched to lawyer_id                          ││
│  │    - Subscription verified                         ││
│  │                                                      ││
│  │ NOTIFICATION JOB (Every 6 Hours):                   ││
│  │ 1. Find all cases with upcoming hearings            ││
│  │ 2. Check notification schedule for each lawyer      ││
│  │ 3. Send based on timing:                            ││
│  │    - 7 days before: "Case date: 15.03.2026"        ││
│  │    - 3 days before: "Hearing in 3 days"            ││
│  │    - 1 day before: "Hearing tomorrow"               ││
│  │    - Day of: "Hearing TODAY at Court No. 01"       ││
│  │ 4. Send via subscribed channels (Email/SMS/Push)    ││
│  │ 5. Log all notifications (auditing)                 ││
│  └────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│              LAWYER RECEIVES NOTIFICATIONS                   │
│                                                              │
│  12.03.2026, 10:00 AM:                                     │
│  📧 Email: "Case W.P.(C) 12345/2024 hearing in 3 days"  │
│  📱 SMS: "Hearing 15.03 - Court 01 - W.P.(C) 12345/24"  │
│  🔔 Push: "Case reminder - tap to view details"         │
│                                                              │
│  14.03.2026, 10:00 AM:                                     │
│  📧 Email: "Tomorrow is your case hearing!"                │
│  📱 SMS: "Tomorrow: W.P.(C) 12345/2024, Court 01"        │
│                                                              │
│  15.03.2026, 09:00 AM:                                     │
│  📧 Email: "Case hearing TODAY!"                           │
│  📱 SMS: "Today 10:00 AM - Court 01 - Be on time!"        │
│                                                              │
│  Lawyer views in portal: Clicks case → See full details   │
└──────────────────────────────────────────────────────────────┘
```

---

## 📊 Database Schema

### **1. Subscription (New)**
```
subscriptions
├─ _id: ObjectId
├─ user_id: string (Clerk user_id)
├─ tier: "starter" | "professional" | "enterprise"
├─ status: "active" | "trial" | "cancelled" | "paused"
├─ stripe_subscription_id: string
├─ stripe_customer_id: string
├─ current_period_start: datetime
├─ current_period_end: datetime
├─ trial_end: datetime (null if no trial)
├─ auto_renew: bool
├─ payment_method: string (last 4 digits)
├─ price_per_month: int (in cents: 9900, 29900, 99900)
├─ billings_history: array
│   ├─ date: datetime
│   ├─ amount: int
│   ├─ status: "paid" | "failed" | "refunded"
│   └─ receipt_url: string
├─ notifications_sent_this_month: int
├─ cases_tracked: int
├─ created_at: datetime
└─ updated_at: datetime
```

### **2. Lawyer Preferences (New)**
```
lawyer_preferences
├─ _id: ObjectId
├─ user_id: string (Clerk user_id)
├─ tier: string (from subscription)
├─ 
├─ ─── TRACKING KEYWORDS ───
├─ watched_case_numbers: [string]
│   # ["W.P.(C) 12345/2024", "W.P.(C) 5000/2024"]
├─ watched_petitioners: [string]
│   # ["Dr Satendra Singh", "XYZ Corporation"]
├─ watched_respondents: [string]
│   # ["Union of India", "Ministry of Defence"]
├─ watched_judges: [string]
│   # ["Justice Tejas Karia", "Justice Vibhu Bakhru"]
├─ watched_court_numbers: [string]
│   # ["COURT NO. 01", "COURT NO. 02"]
├─ watched_case_types: [string]
│   # ["W.P.(C)", "CRL.M.", "FAO"]
├─ 
├─ ─── NOTIFICATION SETTINGS ───
├─ preferred_channels: [string]
│   # ["email", "sms", "push"]
├─ notification_before_days: [int]
│   # [7, 3, 1, 0] = notify 7 days, 3 days, 1 day, day of hearing
├─ notify_at_time: string
│   # "10:00 AM" in their timezone
├─ timezone: string
│   # "Asia/Kolkata"
├─ phone_for_sms: string
│   # "+91-98765-43210"
├─ disable_weekend_notifications: bool
│   # Skip SMS on Saturday/Sunday
├─ 
├─ ─── CLIENT PORTAL SETTINGS ───
├─ auto_add_clients: bool
│   # Auto-parse and add client names as stakeholders
├─ allow_client_sharing: bool
│   # Allow clients to see their case status via link
├─ 
├─ created_at: datetime
└─ updated_at: datetime
```

### **3. Auto-Tracked Cases (New)**
```
auto_tracked_cases
├─ _id: ObjectId
├─ case_id: string (unique via parser)
├─ lawyer_id: string (Clerk user_id who matched this case)
├─ 
├─ ─── PARSE DATA ───
├─ main_case_no: string (W.P.(C) 12345/2024)
├─ case_type: string
├─ petitioner: string
├─ respondent: string
├─ court_no: string (COURT NO. 01)
├─ judge: string
├─ section: string (FOR ADMISSION, AFTER NOTICE, etc)
├─ 
├─ ─── HEARING DATA ───
├─ hearing_date: datetime
├─ hearing_date_str: string ("15.03.2026")
├─ court_location: string ("Delhi High Court")
├─ 
├─ ─── NOTIFICATION DATA ───
├─ notification_status: "scheduled" | "sent" | "failed"
├─ notifications_ready_to_send: array
│   ├─ scheduled_for: datetime
│   ├─ days_before: int
│   ├─ sent: bool
│   ├─ sent_at: datetime
│   └─ channels: ["email", "sms", "push"]
├─ 
├─ ─── MATCHING ───
├─ matched_on: string (what field matched: "case_number" | "petitioner" | "judge")
├─ match_confidence: float (0.0 - 1.0)
├─ 
├─ source_pdf: string (combined_adv_15.03.2026.pdf)
├─ parsed_at: datetime
├─ created_at: datetime
└─ updated_at: datetime
```

### **4. Notification Log (Existing + Extended)**
```
notification_logs
├─ _id: ObjectId
├─ user_id: string
├─ case_id: string
├─ subscription_tier: string (for analytics)
├─ 
├─ channel: "email" | "sms" | "push" | "webhook"
├─ scheduled_for: datetime
├─ sent_at: datetime
├─ status: "pending" | "sent" | "failed" | "skipped"
├─ 
├─ recipient: string (email or phone)
├─ subject: string
├─ body: text
├─ 
├─ error: object (if failed)
│   ├─ error_code: string
│   ├─ error_message: string
│   ├─ retry_attempt: int
│   └─ next_retry: datetime
├─ 
├─ metadata: object
│   ├─ case_number: string
│   ├─ hearing_date: string
│   ├─ days_before: int
│   ├─ court_no: string
│   └─ judge: string
├─ 
└─ created_at: datetime
```

---

## 🔄 Complete Flow

### **Day 0: Lawyer Signs Up**
```
1. Visits lexvert.com/signup
2. Creates account (Clerk auth)
3. Selects tier: Professional ($299/month)
4. Pays via Stripe (adds card)
5. Subscription created and marked "active"
6. Enters tracking keywords:
   ├─ Case numbers: W.P.(C) 12345/2024, W.P.(C) 5000/2024
   ├─ Judge: "Justice Tejas Karia"
   ├─ Party: "XYZ Corporation"
   └─ Court: "COURT NO. 01"
7. Sets notification preferences:
   ├─ Channels: Email + SMS
   ├─ Timing: 7 days, 3 days, 1 day, day of
   ├─ Time: 10:00 AM (Asia/Kolkata)
   ├─ Phone: +91-98765-43210
```

### **Day 1-N: System Runs Automatically**

**EVERY 6 HOURS - PDF Ingestion Job:**
```
00:00, 06:00, 12:00, 18:00 UTC

1. Check Delhi HC court portal OR S3 bucket where PDFs stored
2. Download: combined_adv_15.03.2026.pdf
3. Parser extracts all 2000+ cases
4. For each case, check: Does it match any lawyer's keywords?
   
   Case: W.P.(C) 12345/2024, "XYZ Corporation" vs "Union of India"
   
   Check lawyer_preferences:
   ├─ watched_case_numbers: [W.P.(C) 12345/2024] ✓ MATCH!
   ├─ watched_petitioners: [XYZ Corporation] ✓ MATCH!
   └─ Is subscription active & paid? ✓ YES
   
   ACTION: Create auto_tracked_case entry, mark for notification
```

**EVERY 6 HOURS - Notification Scheduler:**
```
Based on lawyer preferences:
   Hearing: 15.03.2026
   Notification schedule: [7 days, 3 days, 1 day, day of]
   
Create queue:
   ├─ 08.03 @ 10:00 AM: "Hearing in 7 days"
   ├─ 12.03 @ 10:00 AM: "Hearing in 3 days"
   ├─ 14.03 @ 10:00 AM: "Hearing in 1 day"
   └─ 15.03 @ 10:00 AM: "Hearing TODAY"
```

**EVERY 6 HOURS - Notification Sender:**
```
Check: Which notifications are due NOW?

If it's 12.03 10:05 AM:
   Found: Notification scheduled for 12.03 10:00 AM
   
   Check subscription tier:
   ├─ Tier: Professional
   ├─ Channels available: Email, SMS, Push
   
   Send:
   ├─ Email to xyz@example.com ✓
   ├─ SMS to +91-98765-43210 ✓
   ├─ Push notification ✓
   
   Log in notification_logs:
   ├─ status: "sent"
   ├─ sent_at: 12.03 10:05 AM
   ├─ channels: ["email", "sms", "push"]
```

---

## 💳 Payment Integration (Stripe)

### **Frontend: Subscription Page**
```typescript
// app/subscription/page.tsx

CARDS:
┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│    STARTER      │  │  PROFESSIONAL    │  │   ENTERPRISE     │
│    $99/month    │  │   $299/month     │  │   $999/month     │
│                 │  │ ⭐ MOST POPULAR  │  │                  │
│ ☐ 5 cases      │  │ ☑ 50 cases      │  │ ☑ Unlimited cases│
│ ☐ Email only   │  │ ☑ Email + SMS    │  │ ☑ All channels   │
│ ☐ 3-1 day alert│  │ ☑ 7-3-1-0 alerts │  │ ☑ Custom alerts  │
│ ☐ Web only     │  │ ☑ Web + Client   │  │ ☑ Full enterprise│
│                 │  │ ☑ API access     │  │ ☑ Priority support│
│   [Choose]      │  │   [Choose]       │  │   [Choose]       │
└─────────────────┘  └──────────────────┘  └──────────────────┘

If [Choose] clicked:
  → Stripe Payment Page
  → User enters card
  → Payment processed
  → Subscription created in DB
  → Redirect to dashboard
  → "🎉 Welcome! Your subscription is active."
```

### **Backend: Stripe Webhooks**
```python
# app/routes.py

@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    """
    Handle Stripe events:
    - payment_intent.succeeded → Activate subscription
    - customer.subscription.deleted → Cancel subscription
    - customer.subscription.updated → Update tier/status
    - invoice.payment_failed → Send reminder email
    """
```

---

## 🎯 Revenue Model

```
Monthly Revenue = (Subscriptions × Average Tier Price)

Example:
├─ 100 Starter ($99) = $9,900
├─ 300 Professional ($299) = $89,700
├─ 50 Enterprise ($999) = $49,950
│
└─ Total = $149,550/month

Annual = $1,794,600 (Excellent for startup!)
```

---

## 🚀 Implementation Phases

### **Phase 1: MVP (Weeks 1-2)**
```
✓ Stripe subscription integration
✓ Subscription tier setup
✓ Database: subscriptions, lawyer_preferences
✓ Keyword matching logic
✓ PDF auto-download + parser integration
✓ Subscribe/unsubscribe endpoints
✓ Subscription dashboard (view status, cancel, update)
```

### **Phase 2: Notification System (Weeks 3-4)**
```
✓ Notification queue creation (auto-tracked cases)
✓ Notification scheduler (every 6 hours)
✓ Email sending (SendGrid)
✓ SMS sending (Twilio)
✓ Notification logging
✓ Failed notification retry logic
```

### **Phase 3: Client Features (Weeks 5-6)**
```
✓ Lawyer dashboard (view tracked cases)
✓ Add/remove keywords
✓ Notification preference settings
✓ Case analytics (cases matched, notifications sent)
✓ Billing history view
✓ Upgrade/downgrade tier
```

### **Phase 4: Polish (Week 7)**
```
✓ Push notifications
✓ WhatsApp integration
✓ Email templates + branding
✓ SMS templates
✓ Client portal (read-only case view)
✓ Cron jobs verified working 24/7
```

---

## 🎯 Perfect Use Case Example

**Lawyer: Harish Kumar, Delhi**

Subscribed: Professional ($299/month)

Tracking:
- Case numbers: W.P.(C) 16325/2024, CS(OS) 45000/2025
- Party: "Supreme Industries Limited"
- Judge: "Justice Vipal Bakhru"

**What happens (NO EFFORT from him):**

```
Day 1: Harish is in courtroom, fighting another case
Day 5: Case W.P.(C) 16325/2024 appears in new PDF
Day 6: System matches it, creates notifications
Day 7 (8.03): Email arrives "Hearing on 15.03"
Day 11 (12.03): Email + SMS "Hearing in 3 days"
Day 13 (14.03): Email + SMS "Hearing tomorrow"
Day 14 (15.03, 9 AM): Email + SMS + Push "Hearing TODAY at 10:00 AM"
Result: Harish was prepared, case went smooth ✓
```

He never needs to:
- ❌ Download PDF
- ❌ Open PDF
- ❌ Scroll through PDFs
- ❌ Manually track dates
- ❌ Remember hearing dates
- ❌ Remind clients

✅ Just pays $299/month and gets peace of mind

---

## 🔌 Where Do PDFs Come From?

**Option 1: Public Court API**
```
Delhi HC publishes PDFs daily:
http://dhcourts.nic.in/documents/causes/
- combined_adv_15.03.2026.pdf
- adv_15.03.2026.pdf
- new_c_15032026.pdf

System downloads automatically every 6 hours
```

**Option 2: Email Subscription**
```
Scrape/subscribe to court email lists
Cases published to our system automatically
```

**Option 3: Manual Upload (Backup)**
```
Admin uploads PDF to S3/server
System processes it
Good for test PDFs, emergency backups
```

---

## 📋 Next Steps

Should I build:

1. **✅ Stripe Subscription Integration** - Payment system
2. **✅ Lawyer Preferences** - Keyword tracking setup
3. **✅ Auto-Tracking Logic** - Case matching against keywords
4. **✅ Notification Queue** - Schedule notifications automatically
5. **✅ Cron Jobs** - Run everything on schedule

Which should I start with?

**My Recommendation:** Start with **#1 (Stripe) + #2 (Preferences)** so lawyers can subscribe and set keywords. Then I'll build the automation layer.

Ready to build this automagic system? 🚀
