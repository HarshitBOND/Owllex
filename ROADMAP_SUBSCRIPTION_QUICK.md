# LexVert Subscription Model - Quick Start

## THE IDEA IN ONE SENTENCE
"Lawyers pay monthly subscription → System automatically downloads court PDFs → Matches cases to their keywords → Sends notifications → They never miss a hearing again"

---

## 💰 THREE TIERS

| Feature | STARTER | PROFESSIONAL | ENTERPRISE |
|---------|---------|--------------|------------|
| **Price** | $99/mo | $299/mo | $999/mo |
| Cases tracked | 5 | 50 | Unlimited |
| Notifications | Email only | Email + SMS | Email + SMS + Push + WhatsApp |
| Timing | 3 days + 1 day | 7, 3, 1 days + day of | Custom |
| Client portal | ❌ | ✅ | ✅ |
| Priority support | ❌ | ❌ | ✅ |

---

## 🔄 HOW IT WORKS

```
┌─────────────────────────────────────────────────────────┐
│  LAWYER SUBSCRIBES (Pays once, forget about it)        │
│  1. Pays $299/month via Stripe                         │
│  2. Enters keywords: "W.P. 12345/2024", "Justice X"   │
│  3. Gives phone number for SMS                         │
│  4. DONE - System takes over                           │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  SYSTEM WORKS 24/7 (Zero effort from lawyer)           │
│  Every 6 hours:                                        │
│  ✓ Download latest PDFs from court                     │
│  ✓ Parse all cases                                     │
│  ✓ Check: Does this case match lawyer's keywords?     │
│  ✓ If YES → Create notification schedule              │
│  ✓ Send notifications at scheduled times:             │
│    - 7 days before: "Hearing coming"                  │
│    - 3 days before: "Hearing in 3 days"              │
│    - 1 day before: "Hearing tomorrow"                │
│    - Day of: "Hearing TODAY!"                        │
│  ✓ Log everything for audit                          │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  LAWYER GETS ALERTS (No effort needed)                 │
│  12 March 10 AM: Email + SMS "Hearing in 3 days"      │
│  14 March 10 AM: Email + SMS "Hearing tomorrow"       │
│  15 March 9 AM: Email + SMS "Hearing TODAY!"          │
│  Result: Fully prepared, never misses hearing 🎉       │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 DATABASE

```
Collection: subscriptions
├─ user_id, tier, status (active/cancelled)
├─ stripe_subscription_id
└─ current_period_end

Collection: lawyer_preferences  
├─ user_id
├─ watched_case_numbers: ["W.P. 12345/2024"]
├─ watched_judges: ["Justice Karia"]
├─ watched_parties: ["XYZ Corp"]
├─ notification_channels: ["email", "sms"]
├─ notify_at_time: "10:00 AM"
└─ timezone: "Asia/Kolkata"

Collection: auto_tracked_cases
├─ case_id, lawyer_id (who it matched)
├─ case_no, hearing_date, judge, court_no
├─ notification_schedule: [
│   {scheduled_for: "08.03 10:00", status: "sent"},
│   {scheduled_for: "12.03 10:00", status: "sent"},
│   {scheduled_for: "15.03 09:00", status: "pending"}
│  ]

Collection: notification_logs
├─ user_id, case_id
├─ channel (email/sms/push)
├─ scheduled_for, sent_at, status
└─ metadata (case details)
```

---

## 🛠️ WHAT TO BUILD (In Order)

### **Step 1: Stripe Integration** (Week 1)
```python
- Add Stripe to payment page
- Create subscription tiers in Stripe
- Handle payment success/failure
- Store subscription in MongoDB
- Webhook for payment events
```

### **Step 2: Lawyer Keywords** (Week 1-2)
```python
- UI: Lawyer enters keywords to track
  ✓ Case numbers
  ✓ Judge names
  ✓ Party names
  ✓ Court numbers
- Save to lawyer_preferences collection
- Ability to add/remove keywords anytime
```

### **Step 3: Auto-Tracking** (Week 2-3)
```python
- Cron job: Download PDFs every 6 hours
- Use existing parser on downloaded PDFs
- For each case: Check lawyer_preferences
  IF case matches keywords AND lawyer subscribed:
    → Create auto_tracked_case entry
    → Schedule notifications
- Store in auto_tracked_cases collection
```

### **Step 4: Notification Sender** (Week 3-4)
```python
- Cron job: Check every 6 hours
- Find notifications scheduled for NOW
- Check subscription tier for allowed channels
- Send via Email (SendGrid) + SMS (Twilio)
- Log in notification_logs
- If fails: Retry with exponential backoff
```

### **Step 5: Lawyer Dashboard** (Week 4-5)
```typescript
- View: Active cases being tracked
- View: Notifications sent history
- View: Subscription status & renewal date
- Ability: Add/remove keywords
- Ability: Change notification preferences
- Ability: Upgrade/downgrade tier
- Ability: Cancel subscription
```

---

## 🎯 EXAMPLE: LAWYER HARISH

**Subscribes:** Professional ($299/month)

**Tracks:**
- Case number: W.P.(C) 16325/2024
- Judge: Justice Tejas Karia
- Party: "XYZ Corporation"

**Timeline (No effort from Harish):**

```
05 March: Harish sleeps, works on other cases
06 March, 6 AM: System downloads new PDFs
06 March, 6:10 AM: Parser processes PDFs
06 March, 6:15 AM: Case W.P.(C) 16325/2024 found!
              Hearing date: 15 March 2026
              Creates notifications:
              ├─ 08 March 10 AM
              ├─ 12 March 10 AM
              ├─ 14 March 10 AM
              └─ 15 March 09 AM

08 March, 10 AM: 📧 Email "Hearing on 15 March"
                 📱 SMS to +91-98765-43210

12 March, 10 AM: 📧 Email "Hearing in 3 days"
                 📱 SMS "Hearing 15.03 - Court 01"

14 March, 10 AM: 📧 Email "Hearing tomorrow!"
                 📱 SMS "Prepare: Hearing 15.03"

15 March, 9 AM:  📧 Email "Hearing TODAY!"
                 📱 SMS "Be at court: Hearing 10 AM"

15 March, 10 AM: Harish walks into court
                 FULLY PREPARED ✅
                 Wins the case 🎉
```

---

## 💵 REVENUE POTENTIAL

```
Example: 500 subscribed lawyers

Breakdown:
├─ 200 Starter ($99/mo) = $19,800
├─ 250 Professional ($299/mo) = $74,750
└─ 50 Enterprise ($999/mo) = $49,950

Monthly: $144,500
Annual: $1,734,000 💰

This is HUGE for a startup serving many lawyers!
```

---

## 🚀 READY TO BUILD?

What do you want me to implement first?

**Option A:** Stripe subscription integration (payment system)
**Option B:** Lawyer keyword preferences (tracking setup)
**Option C:** PDF auto-download & notification scheduling (automation)
**Option D:** Lawyer dashboard (UI to manage everything)

My recommendation: Start with **A + B**, then add **C**.

Let me know! 🎯
