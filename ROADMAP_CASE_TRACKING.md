# LexVert Case Tracking & Notification System - Roadmap

## 🎯 Vision
Lawyers upload court PDFs → System automatically tracks cases → Clients get proactive notifications about upcoming hearings without touching messy PDFs.

---

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                      │
│  ┌──────────────────┐  ┌────────────────┐  ┌──────────────────┐│
│  │  Lawyer Panel    │  │ Client Portal  │  │ Notification     ││
│  │  - Upload PDF    │  │ - Dashboard    │  │ Settings         ││
│  │  - Manage cases  │  │ - View cases   │  │ - Email/SMS/Push ││
│  │  - Set alerts    │  │ - Get alerts   │  │ - Timing         ││
│  └──────────────────┘  └────────────────┘  └──────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND API (Python/FastAPI)                 │
│  ┌───────────────┐  ┌────────────────┐  ┌──────────────────────┐│
│  │ PDF Parser    │  │ Case Tracker   │  │ Notification Engine  ││
│  │ (existing)    │  │ (new)          │  │ (new)                ││
│  │ - Extract     │  │ - Store cases  │  │ - Schedule alerts    ││
│  │ - Normalize   │  │ - Link clients │  │ - Send via channels  ││
│  │ - Validate    │  │ - Track status │  │ - Log & retry        ││
│  └───────────────┘  └────────────────┘  └──────────────────────┘│
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                 CRON JOBS (Background Tasks)                 ││
│  │ - Check upcoming hearings every 6 hours                      ││
│  │ - Send notifications at scheduled times                      ││
│  │ - Retry failed notifications                                 ││
│  │ - Sync with court APIs (future)                              ││
│  └──────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                       DATABASE (MongoDB)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐│
│  │ Users    │  │ Cases    │  │ Clients  │  │ Notifications    ││
│  │ (Lawyers)│  │ (parsed) │  │ (linked) │  │ (sent/scheduled) ││
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  NOTIFICATION CHANNELS                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐│
│  │ Email    │  │ SMS      │  │ Push     │  │ In-App (WebSocket)││
│  │ (SendGrid)  │(Twilio)  │  │Notification│ │ Real-time alerts ││
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## 🗂️ Database Schema

### **1. Lawyer Account** (Already exists via Clerk)
```
users (Clerk handles)
├── id: clerk_user_id
├── email: string
├── name: string
├── phone: string
├── bar_license: string
└── notification_preferences: object
    ├── email_enabled: bool
    ├── sms_enabled: bool
    ├── push_enabled: bool
    └── timezone: string
```

### **2. Clients** (New collection)
```
clients
├── _id: ObjectId
├── lawyer_id: string (clerk_user_id)
├── name: string
├── email: string
├── phone: string
├── case_ids: [ObjectId] (array of case references)
├── notification_preferences: object
│   ├── days_before_hearing: int (default: 3, 1, 0)
│   ├── notify_at_time: string (default: "10:00 AM")
│   └── preferred_channels: [string] (["email", "sms", "push"])
├── created_at: datetime
└── updated_at: datetime
```

### **3. Cases** (New - extend existing parser model)
```
cases
├── _id: ObjectId
├── lawyer_id: string (Clerk user_id who uploaded)
├── client_ids: [ObjectId] (linked clients)
├── source_pdf: string (filename)
├── parsed_at: datetime
├── 
├── ─── PARSED DATA (from parser) ───
├── main_case_no: string (W.P.(C) 16325/2024)
├── case_type: string (Writ / Appeal / etc)
├── court_no: string (COURT NO. 01)
├── judge: string (HON'BLE MR.JUSTICE TEJAS KARIA)
├── section: string (FOR ADMISSION / AFTER NOTICE / etc)
├── petitioner: string
├── respondent: string
├── advocates: object
│   ├── petitioner: string
│   └── respondent: string
├── 
├── ─── CASE TRACKING (new) ───
├── hearing_date: datetime (extracted from list_date + other sources)
├── next_hearing_date: datetime (user can update if new date found)
├── court_location: string (Delhi High Court)
├── case_status: enum ["hearing_scheduled", "adjourned", "disposal_pending", "completed"]
├── case_priority: enum ["high", "medium", "low"] (user set)
├── tags: [string] (["urgent", "appeal", "bail"] etc)
├── notes: string (internal notes from lawyer)
├── 
├── ─── PROCEDURAL TRACKING ───
├── last_hearing_date: datetime
├── next_expected_hearing_date: datetime
├── days_until_hearing: int (calculated)
├── hearings: array
│   ├── hearing_id: string
│   ├── date: datetime
│   ├── outcome: string (adjourned, next date, etc)
│   └── notes: string
├── 
├── created_at: datetime
├── updated_at: datetime
└── last_sync: datetime
```

### **4. Notifications Sent** (New - audit trail)
```
notifications
├── _id: ObjectId
├── case_id: ObjectId
├── client_id: ObjectId
├── lawyer_id: string
├── notification_type: enum ["hearing_reminder", "date_change", "status_update"]
├── channel: enum ["email", "sms", "push", "in_app"]
├── scheduled_for: datetime
├── sent_at: datetime (null if not yet sent)
├── status: enum ["pending", "sent", "failed", "read"]
├── recipient: string (email/phone/user_id)
├── subject: string
├── body: string
├── retry_count: int (default: 0)
├── error_message: string (if failed)
├── metadata: object
│   ├── days_before: int
│   ├── hearing_date: datetime
│   └── case_number: string
└── created_at: datetime
```

### **5. Case-Client Mapping** (Junction table)
```
case_client_mapping
├── _id: ObjectId
├── case_id: ObjectId
├── client_id: ObjectId
├── lawyer_id: string
├── role: enum ["petitioner", "respondent", "interested_party"]
├── added_at: datetime
└── client_type: enum ["individual", "company", "organization"]
```

---

## 🛣️ Phase 1: Foundation (Weeks 1-2)

### Backend Updates

#### 1.1 Extend Database Models
```python
# app/models.py - Add new data classes

@dataclass
class ClientEntry:
    lawyer_id: str
    name: str
    email: str
    phone: str
    preferred_notify_days: List[int] = field(default_factory=lambda: [3, 1, 0])
    notify_at_time: str = "10:00 AM"
    preferred_channels: List[str] = field(default_factory=lambda: ["email"])

@dataclass
class CaseTrackingEntry:
    case_id: str
    lawyer_id: str
    client_ids: List[str]
    hearing_date: str  # "DD.MM.YYYY HH:MM"
    case_status: str  # "hearing_scheduled" | "adjourned" | etc
    next_hearing_date: Optional[str]
    case_priority: str  # "high" | "medium" | "low"
    notes: str = ""

@dataclass
class NotificationEntry:
    case_id: str
    client_id: str
    notification_type: str
    channel: str
    scheduled_for: str  # ISO datetime
    recipient: str
    body: str
    status: str = "pending"
```

#### 1.2 New Database Layer
```python
# app/db.py - Add new methods

class MongoDB:
    def create_client(self, lawyer_id, client_data) -> str:
        """Create a client, return client_id"""
    
    def link_case_to_client(self, case_id, client_id, lawyer_id):
        """Link a parsed case to a client"""
    
    def get_upcoming_cases(self, lawyer_id, days_ahead=7):
        """Get all cases with hearings in next N days"""
    
    def schedule_notification(self, case_id, client_id, days_before, time):
        """Schedule a notification for X days before hearing"""
    
    def log_notification(self, notification_data):
        """Log sent notification for audit"""
```

#### 1.3 Case Date Extraction (Parser Enhancement)
```python
# app/parser.py - Add hearing date detection

def extract_hearing_date(case_text: str, pdf_header_date: str) -> Optional[str]:
    """
    Extract actual hearing date from case entry.
    DHC PDFs show hearing date in list header, use that.
    """
    # The list header has format: "04.02.2026" 
    # This is the hearing date for all cases in that section
    return pdf_header_date

def extract_dates_from_case_details(case_text: str) -> Dict[str, str]:
    """Extract all dates: next hearing, last hearing, adjourn date, etc"""
    dates = {}
    dates['hearing_date'] = extract_hearing_date(case_text, ...)
    dates['next_date'] = re.search(r'next date[:]?\s+(\d{1,2}[./-]\d{1,2}[./-]\d{4})', case_text)
    return dates
```

### Frontend Components

#### 1.4 Lawyer Dashboard - Case Upload & Link
```typescript
// app/dashboard/lawyer/components/CaseUploadForm.tsx
// - Upload PDF
// - Auto-parse cases
// - Show parsed cases list
// - Link each case to clients (dropdown)
// - Set case priority & tags
// - Configure notification timing
```

#### 1.5 Client Management UI
```typescript
// app/dashboard/lawyer/components/ClientManager.tsx
// - Add new client
// - View all clients
// - Edit client notification preferences
// - See which cases linked to which clients
```

---

## 🛣️ Phase 2: Notification Engine (Weeks 3-4)

### Backend: Notification Service

#### 2.1 Notification Scheduler
```python
# app/services/notification_scheduler.py

class NotificationScheduler:
    def schedule_hearing_notifications(self, case_id: str, hearing_date: str):
        """
        Given a case and hearing date, create scheduled notifications.
        Example:
          - 3 days before: "Your hearing is coming in 3 days"
          - 1 day before: "Tomorrow is your hearing"
          - 0 days before (morning of): "Your hearing is TODAY at 10:00 AM"
        """
        
    def get_notifications_due_now(self) -> List[Notification]:
        """Get all notifications that should be sent right now"""
        
    def mark_sent(self, notification_id: str, sent_at: datetime):
        """Mark notification as successfully sent"""
```

#### 2.2 Multi-Channel Sender
```python
# app/services/notification_sender.py

class NotificationSender:
    async def send_email(self, recipient: str, subject: str, body: str):
        """Send via SendGrid"""
        
    async def send_sms(self, phone: str, message: str):
        """Send via Twilio"""
        
    async def send_push(self, user_id: str, title: str, body: str):
        """Send browser/mobile push notification"""
        
    async def send_in_app(self, user_id: str, notification: dict):
        """Save to database, deliver via WebSocket"""
        
    async def send(self, notification: NotificationEntry):
        """Smart router - send via preferred channels"""
```

#### 2.3 Cron Job for Notifications
```python
# app/jobs/notification_cron.py

async def check_and_send_notifications():
    """
    Run every 6 hours:
    1. Find all notifications scheduled for "now"
    2. Send via configured channels
    3. Log results
    4. Retry failed ones with exponential backoff
    """
```

#### 2.4 API Endpoints
```python
# app/routes.py - New endpoints

POST /api/v1/cases/upload-and-link
    # Upload PDF, parse, link to clients
    body: {
        "file": File,
        "client_ids": [str],
        "case_priority": "high" | "medium" | "low"
    }

POST /api/v1/clients/{client_id}/preferences
    # Update client notification settings
    body: {
        "notify_days_before": [3, 1, 0],
        "notify_at_time": "10:00 AM",
        "preferred_channels": ["email", "sms", "push"],
        "timezone": "Asia/Kolkata"
    }

GET /api/v1/cases/upcoming
    # Get upcoming cases for lawyer
    params: ?days=7, ?lawyer_id=xxx

POST /api/v1/cases/{case_id}/reschedule
    # Lawyer found new hearing date
    body: {
        "new_hearing_date": "DD.MM.YYYY"
    }

GET /api/v1/notifications/history
    # View all sent notifications
    params: ?case_id=, ?client_id=, ?status=

POST /api/v1/notifications/{notif_id}/retry
    # Manually retry failed notification
```

### Frontend: Client Portal

#### 2.5 Client Dashboard
```typescript
// app/dashboard/client/page.tsx
// - Show my upcoming hearings (next 30 days)
// - Timeline: "3 days before" → notification sent
// - View past notifications got
// - Update preferences (email/SMS/push, time, days)
```

#### 2.6 Notification Settings UI
```typescript
// components/NotificationPreferences.tsx
// Toggles:
// ☐ Email notifications
// ☐ SMS notifications  
// ☐ Push notifications
// ☐ In-app notifications
//
// Sliders:
// Days before hearing: [●●●] [●] [●] (3 days, 1 day, today)
// Time: [HH:MM] picker
// Timezone: Dropdown
```

---

## 🛣️ Phase 3: Advanced Features (Weeks 5-6)

### 3.1 Case Status Tracking
```python
# Case status transitions:
"hearing_scheduled" → "adjourned" (with new date)
"hearing_scheduled" → "disposal_pending" 
"disposal_pending" → "completed"

# When status changes, notify client:
# "Your case hearing has been adjourned to 15.03.2026"
```

### 3.2 Real-Time Notifications (WebSocket)
```typescript
// components/NotificationToast.tsx
// WebSocket listener receives:
{
  "type": "hearing_reminder",
  "case": "W.P.(C) 16325/2024",
  "message": "Your hearing is in 3 days - Court No. 01",
  "timestamp": "2026-03-08T10:00:00Z"
}

// Toast slides in, plays sound, persists in notification center
```

### 3.3 Bulk PDF Import
```
- Upload ZIP with 10 PDFs at once
- Parse all concurrently
- Auto-link to clients by case numbers
- Preview before confirming
```

### 3.4 Case Analytics
```typescript
// app/dashboard/lawyer/analytics/page.tsx
- Total cases tracked
- Cases by status (hearing_scheduled vs completed)
- Most active judges
- Courts with most cases
- Notification delivery rates
- Client engagement metrics
```

### 3.5 Email Template System
```html
<!-- Subject: Your Hearing is in 3 Days -->
Dear [Client Name],

Your case [Case No] has a hearing on [Date] at Court No. [X].

Judge: [Judge Name]
Court: Delhi High Court
Advocated by: [Your Lawyer Name]

🔗 [View Full Case Details]

Don't forget to prepare! 📋

---
Change notification preferences: [Link to settings]
```

### 3.6 Integration with Court APIs (Future)
```
- Subscribe to Delhi HC case status API
- Auto-detect new dates and notify
- Fetch judgments automatically
```

---

## 📱 Tech Stack Recommendations

| Layer | Current | Add |
|-------|---------|-----|
| **Frontend** | Next.js 14 | Zustand (state), React Query |
| **Backend** | FastAPI | APScheduler (cron), Celery (async jobs) |
| **Database** | MongoDB | Add Redis (caching, queues) |
| **Auth** | Clerk | Already integrated ✓ |
| **Email** | None | SendGrid |
| **SMS** | None | Twilio |
| **Push** | None | Firebase Cloud Messaging |
| **Real-time** | None | WebSocket (Socket.io or native) |

---

## 🔌 Integration Points

### Between Frontend & Backend
```
Upload PDF
  ↓ (POST /api/v1/cases/upload-and-link)
Parse & Store
  ↓ (Return ParseResponse + case_ids)
Link to Clients
  ↓ (POST /api/v1/cases/{case_id}/link-client)
Schedule Notifications
  ↓ (Auto - background job)
Send Alerts
  ↓ (Every 6 hours, cron checks)
Client receives notification
  ↓
Client views case in dashboard
```

---

## 📋 Notification Flow Example

**Step 1: Lawyer uploads PDF on 08.03.2026**
```
PDF: "combined_adv_15.03.2026.pdf"
Cases: [W.P.(C) 16325/2024, W.P.(C) 5000/2024, ...]
Hearing Date: 15.03.2026
```

**Step 2: Lawyer links to client**
```
POST /api/v1/cases/upload-and-link
{
  "file": <PDF>,
  "client_ids": ["client_xyz"],
  "case_priority": "high"
}
```

**Step 3: System schedules notifications**
```
TODAY (08.03): [no notification - more than 3 days away]
12.03 (3-days before): Queue "Your hearing in 3 days" at 10:00 AM
14.03 (1-day before): Queue "Hearing tomorrow" at 10:00 AM  
15.03 (today): Queue "Hearing TODAY - Court No. 01" at 9:00 AM
```

**Step 4: Scheduler runs every 6 hours**
```
Check: What time is it? 12.03.2026, 10:15 AM
Match: Found notification scheduled for 12.03, 10:00 AM
Send: Email + SMS + Push notification
Log: notification_id=xyz, status=sent, sent_at=12.03 10:15 AM
```

**Step 5: Client receives**
```
📧 Email: "Your case W.P.(C) 16325/2024 hearing in 3 days"
📱 SMS: "Lexvert: Hearing in 3 days - W.P.(C) 16325/2024"
🔔 Push: "Hearing reminder from your lawyer"
💬 In-app: Toast notification + notification center
```

**Step 6: Client dashboard shows**
```
UPCOMING HEARINGS:
├─ W.P.(C) 16325/2024  
│  📅 15 March 2026
│  🏛️ Court No. 01, Delhi High Court
│  ⏰ Hearing in 3 days
│  ✓ Notified (Email, SMS sent)
│  📊 Status: Hearing Scheduled
```

---

## 🎯 Success Metrics

By end of implementation:
- [ ] Lawyers can upload PDFs and auto-parse cases
- [ ] Cases auto-linked to clients with 2 clicks
- [ ] Notifications sent on schedule 99.9% of the time
- [ ] Clients never miss a hearing
- [ ] Dashboard shows real-time case status
- [ ] < 500ms response time for all API calls
- [ ] Email delivery rate > 95%
- [ ] SMS delivery rate > 98%

---

## 🚚 Deployment

### Docker Compose
```yaml
version: '3.8'
services:
  frontend:
    build: .
    image: lexvert-frontend
    
  backend:
    build: ./backend
    image: lexvert-backend
    environment:
      MONGODB_URI: mongodb://mongo:27017
      REDIS_URL: redis://redis:6379
      SENDGRID_API_KEY: xxx
      TWILIO_ACCOUNT_SID: xxx
    depends_on:
      - mongo
      - redis
      
  mongo:
    image: mongo:7
    volumes:
      - mongo_data:/data/db
      
  redis:
    image: redis:latest
```

### Cron Jobs (Production)
```bash
# In Docker container, using APScheduler
# Run notification scheduler every 6 hours
# Run case sync every 24 hours
# Run cleanup (old notifications) every 7 days
```

---

## 📞 Next Steps

What would you like me to implement first?

1. **Database Schema** - Create MongoDB collections
2. **Backend Models** - Add CaseTracking, Client, Notification data classes
3. **Case Upload Endpoint** - POST /api/v1/cases/upload-and-link
4. **Lawyer Dashboard** - UI for uploading and managing cases
5. **Notification Scheduler** - Cron logic to schedule alerts
6. **Client Portal** - Show upcoming cases
7. **Notification Sender** - Email/SMS integration
8. **Full Integration** - Wire everything together

I recommend starting with **#1 (Database)** and **#2 (Models)**, then **#3 (Upload endpoint)**.

Which phase/feature would you like to tackle first? 🚀
