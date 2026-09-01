# Ravenslaw - Complete Legal Workbench Platform

## 📋 Table of Contents
1. [Product Overview](#product-overview)
2. [System Architecture](#system-architecture)
3. [Feature Set](#feature-set)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Frontend Components](#frontend-components)
7. [User Flows](#user-flows)
8. [Payment & Subscription](#payment--subscription)
9. [Implementation Roadmap](#implementation-roadmap)
10. [Technical Stack](#technical-stack)

---

## 🎯 Product Overview

### The Problem
Lawyers waste hours:
- Downloading and opening messy court PDFs daily
- Manually tracking case hearing dates
- Remembering to notify clients about upcoming hearings
- Managing multiple clients and their cases in scattered systems
- No unified workspace for case, contact, and payment management

### The Solution
**Ravenslaw** - A complete legal workbench where:
- System **automatically tracks court cases** via PDF parsing
- Lawyers manage **all client information in one place**
- **Automated notifications** to clients before hearings
- **Payments, contacts, files, and case details all integrated**
- Lawyers focus on law, not administration

### Business Model
**Subscription-based SaaS** with 3 tiers:
- **STARTER** ($99/mo): 5 cases, email alerts
- **PROFESSIONAL** ($299/mo): 50 cases, email+SMS, client portal
- **ENTERPRISE** ($999/mo): Unlimited cases, all channels, advanced features

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              LAWYER/FIRM                               │
│  Logs in → Dashboard → Manages everything at one place                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 14)                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐│
│  │  Dashboard   │  │ My Clients   │  │   My Cases   │  │  Payments  ││
│  │              │  │              │  │              │  │            ││
│  │ - Overview   │  │ - List       │  │ - Upload PDF │  │ - Billing  ││
│  │ - Stats      │  │ - Add/Edit   │  │ - Track case │  │ - Invoices ││
│  │ - Settings   │  │ - Contacts   │  │ - Hearings   │  │ - History  ││
│  │              │  │ - Files      │  │ - Linked     │  │ - Cancel   ││
│  │              │  │ - Linked     │  │   clients    │  │            ││
│  │              │  │   cases      │  │              │  │            ││
│  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘│
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐│
│  │   Settings   │  │ Preferences  │  │ Integrations │  │  Support   ││
│  │              │  │              │  │              │  │            ││
│  │ - Profile    │  │ - Alerts     │  │ - Calendars  │  │ - Help     ││
│  │ - Security   │  │ - Notifications
 │  │ - CRM       │  │ - Docs      ││
│  │ - Team       │  │ - Timezone  │  │ - Cloud      │  │ - Contact  ││
│  │              │  │ - Language   │  │ - Storage    │  │            ││
│  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘│
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                     BACKEND API (FastAPI/Python)                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  PDF PARSER          CASE TRACKER         NOTIFICATION         PAYMENT │
│  ├─ Download PDFs    ├─ Store cases       ├─ Schedule alerts   ├─ Stripe│
│  ├─ Extract cases    ├─ Link clients      ├─ Send Email        ├─ Invoices
│  ├─ Normalize data   ├─ Track hearings    ├─ Send SMS          ├─ Receipts
│  └─ Validate         └─ Update status     └─ Send Push         └─ History│
│                                                                         │
│  FILE MANAGER        CLIENT MANAGER       AUTH              SCHEDULER  │
│  ├─ Upload files     ├─ CRUD clients      ├─ Clerk           ├─ Cron jobs
│  ├─ Store S3         ├─ Verify data       ├─ JWT tokens      ├─ Every 6hrs
│  ├─ Generate links   ├─ Fuzzy matching    ├─ Role-based       ├─ Notifications
│  └─ Delete files     └─ Bulk import       └─ Permissions      └─ Case sync
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    DATABASE (MongoDB Atlas)                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  users          subscriptions       clients         clients_contact   │
│  ├─ Profile    ├─ Tier             ├─ Name         ├─ Email           │
│  ├─ Email      ├─ Status           ├─ Email        ├─ Phone           │
│  ├─ Photo      ├─ Stripe ID        ├─ Phone        ├─ Address         │
│  └─ Firm       └─ Period           ├─ Firm         └─ Notes           │
│                                     └─ Linked cases │
│  cases                  cases_hearing          notifications          │
│  ├─ Case No    cases_client_map           ├─ Type                   │
│  ├─ Date       ├─ case_id            ├─ Channel                │
│  ├─ Parties    ├─ client_id          ├─ Status                 │
│  ├─ Judge      ├─ role               ├─ Sent at                │
│  ├─ Details    └─ added_by           └─ Log data               │
│  ├─ Files      │                                                │
│  └─ Status     lawyer_preferences                  files       │
│                ├─ Tier              ├─ Name   │
│                ├─ Watch keywords    ├─ Case   │
│                ├─ Alert timing      ├─ Type   │
│                └─ Channels          ├─ S3 URL │
│                                     └─ Metadata
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Stripe          SendGrid          Twilio           Firebase    AWS S3 │
│  ├─ Payments    ├─ Email alerts   ├─ SMS alerts    ├─ Push    ├─ Files│
│  ├─ Billing     └─ Templates      └─ Voice calls   └─ Real-time└─ CDN  │
│  └─ Webhooks                                                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Feature Set

### 1. **Authentication & Multi-Tenancy**
- Clerk setup for secure authentication
- Support for individual lawyers & law firms
- Role-based access control (Admin, Partner, Associate, Intern)
- Invitation system for team members

### 2. **Case Management**
- **Upload court PDFs** (daily cause lists)
- **Auto-parse cases** using existing parser
- **Manual case addition** (case number, parties, dates)
- **Link multiple clients** to one case
- **Track case status** (Hearing Scheduled → Adjourned → Disposed)
- **Add internal notes** and case strategy
- **Attach files** (judgments, documents, research)
- **Search & filter** by date, judge, party, court

### 3. **Client Management**
- **Add clients** with email, phone, address
- **Link clients to cases**
- **Bulk import** clients from CSV
- **Client portal** (read-only access to their cases)
- **Communication history** (emails sent to client)
- **View on map** (client locations, court addresses)

### 4. **Hearing Notifications**
- **Automatic scheduling** (No manual setup)
- **Multi-channel delivery** (Email, SMS, Push)
- **Custom timing** (Notify 7 days, 3 days, 1 day, day-of)
- **Client notifications** sent automatically
- **Custom messages** with case details
- **Delivery tracking** & retry logic
- **Delivery reports** (sent, failed, read)

### 5. **Payment & Billing**
- **Stripe integration** for card payments
- **Subscription management** (upgrade/downgrade/cancel)
- **Automatic billing** on renewal date
- **Invoice generation** (PDF)
- **Payment history** with receipts
- **Free trial** (14 days)
- **Dunning management** (failed payments)
- **Team billing** (per-user add-ons)

### 6. **Files & Case Documents**
- **Upload documents** (judgments, affidavits, PDFs)
- **Organize by case** (automatic grouping)
- **Full-text search** in documents
- **Version control** (track changes)
- **Share links** (secure, password-protected)
- **Auto-backup** to cloud storage
- **Storage tracking** (used vs limit)

### 7. **Analytics & Reports**
- **Dashboard metrics**:
  - Total active cases
  - Upcoming hearings (next 7, 14, 30 days)
  - Cases by status
  - Clients served
  - Notifications sent
- **Monthly reports** (email digest)
- **Notification delivery rate** (%)
- **Most active judges** & courts
- **Case resolution trends**

### 8. **Integrations**
- **Google Calendar** (sync hearing dates)
- **Outlook Calendar** (sync hearing dates)
- **Zoom** (for video consultations)
- **WhatsApp** (notifications + communication)
- **Dropbox** (auto-backup files)
- **Slack** (send urgent alerts)
- **Microsoft Teams** (team collaboration)

### 9. **Mobile App (Future)**
- View upcoming hearings
- Receive notifications
- Manage clients
- Upload documents
- View case details

---

## 💾 Database Schema

### **1. users** (Clerk Auth + Custom Data)
```javascript
{
  _id: ObjectId,
  clerk_id: "user_123", // From Clerk
  email: "harish@ravenslaw.com",
  name: "Harish Kumar",
  phone: "+91-98765-43210",
  profile_photo: "https://s3.../photo.jpg",
  
  firm: {
    id: ObjectId, // Reference to law firm (if team)
    name: "Kumar & Associates",
    address: "Delhi High Court Complex",
    phone: "+91-11-2340-5678"
  },
  
  role: "admin", // admin | partner | associate | intern
  permissions: ["cases:read", "cases:write", "clients:read", "payments:read"],
  
  subscription_id: ObjectId, // Reference
  is_subscription_active: true,
  
  preferences: {
    timezone: "Asia/Kolkata",
    language: "en",
    email_digest: true, // Weekly/Monthly reports
    digest_day: "monday"
  },
  
  created_at: ISODate("2026-01-15"),
  updated_at: ISODate("2026-03-08"),
  last_login: ISODate("2026-03-08T10:30:00Z"),
  is_deleted: false
}
```

### **2. subscriptions**
```javascript
{
  _id: ObjectId,
  user_id: ObjectId,
  tier: "professional", // starter | professional | enterprise
  status: "active", // active | trial | cancelled | paused
  
  stripe: {
    customer_id: "cus_123456",
    subscription_id: "sub_123456",
    payment_method_id: "pm_123456"
  },
  
  pricing: {
    amount: 29900, // In cents ($299)
    currency: "USD",
    billing_cycle: "monthly" // monthly | yearly
  },
  
  period: {
    current_start: ISODate("2026-03-01"),
    current_end: ISODate("2026-04-01"),
    trial_end: null // ISODate if trial
  },
  
  limits: {
    case_limit: 50, // Based on tier
    storage_gb: 100,
    team_members: 5,
    api_calls_per_month: 10000
  },
  
  usage: {
    cases_created: 12,
    storage_used_gb: 2.5,
    notifications_sent: 145,
    team_members_active: 2
  },
  
  billing_history: [
    {
      date: ISODate("2026-03-01"),
      amount: 29900,
      status: "paid",
      receipt_url: "https://receipts.stripe.com/...",
      invoice_id: "inv_123"
    }
  ],
  
  auto_renew: true,
  next_billing_date: ISODate("2026-04-01"),
  cancelled_at: null,
  
  created_at: ISODate("2026-01-15"),
  updated_at: ISODate("2026-03-08")
}
```

### **3. lawyer_preferences**
```javascript
{
  _id: ObjectId,
  user_id: ObjectId,
  
  // CASE TRACKING KEYWORDS
  watched: {
    case_numbers: ["W.P.(C) 12345/2024", "W.P.(C) 5000/2024"],
    petitioners: ["Dr Satendra Singh", "XYZ Corporation"],
    respondents: ["Union of India", "Ministry of Defence"],
    judges: ["Justice Tejas Karia", "Justice Vipal Bakhru"],
    court_numbers: ["COURT NO. 01", "COURT NO. 02"],
    case_types: ["W.P.(C)", "CRL.M.", "FAO"]
  },
  
  // NOTIFICATION SETTINGS
  notifications: {
    enabled: true,
    channels: ["email", "sms", "push"],
    timing_days: [7, 3, 1, 0], // Notify 7 days, 3 days, 1 day, day-of
    notify_at_time: "10:00 AM",
    timezone: "Asia/Kolkata",
    
    // SMS
    sms_enabled: true,
    phone_for_sms: "+91-98765-43210",
    skip_weekends: false,
    
    // Email
    email_enabled: true,
    email_address: "harish@ravenslaw.com",
    
    // Push
    push_enabled: true,
    
    // Client notifications
    auto_notify_clients: true,
    client_notification_days: [1, 0], // Notify clients 1 day & day-of only
    
    // Do not disturb
    dnd_enabled: false,
    dnd_start: "22:00",
    dnd_end: "08:00"
  },
  
  // CASE MANAGEMENT
  case_settings: {
    auto_link_clients: true, // Auto-match party names to client names
    mark_adjourned_auto: false, // Auto-mark as adjourned when new date found
    color_coding: true, // Color cases by priority
    show_linked_cases: true // Show related/connected cases
  },
  
  // CLIENT PORTAL
  client_portal: {
    enabled: true,
    allow_document_share: true,
    allow_payment_view: false // Clients don't see payments
  },
  
  // INTEGRATIONS
  integrations: {
    google_calendar: { connected: false, access_token: null },
    outlook_calendar: { connected: false, access_token: null },
    slack: { connected: false, webhook_url: null },
    whatsapp: { connected: false, api_key: null }
  },
  
  created_at: ISODate("2026-01-15"),
  updated_at: ISODate("2026-03-08")
}
```

### **4. clients**
```javascript
{
  _id: ObjectId,
  user_id: ObjectId, // Lawyer who added this client
  
  // BASIC INFO
  name: "Raj Kumar",
  email: "raj@example.com",
  phone: "+91-97654-32109",
  
  contact: {
    address: "123 MG Road, Delhi",
    city: "Delhi",
    state: "Delhi",
    pincode: "110001",
    country: "India",
    coordinates: { latitude: 28.6139, longitude: 77.2090 } // For map view
  },
  
  // CLIENT RELATIONSHIP
  client_type: "individual", // individual | company | organization
  company_name: "ABC Corporation", // If company
  company_registration: "CIN123456",
  gstin: "29AABCT1234A1Z0", // For invoices
  pan: "AAAPA1234K",
  
  firm_relationship: {
    referred_by: "Direct", // Direct | Referral | Previous Client
    referred_by_person: null,
    primary_lawyer: ObjectId, // Who is the main contact
    since_date: ISODate("2025-06-01")
  },
  
  // CASE LINKAGE
  linked_cases: [
    {
      case_id: ObjectId,
      role: "petitioner", // petitioner | respondent | interested_party
      added_at: ISODate("2026-01-15")
    }
  ],
  
  // COMMUNICATION HISTORY
  communications: [
    {
      type: "email", // email | sms | whatsapp | call | meeting | other
      date: ISODate("2026-03-08T10:30:00Z"),
      subject: "Hearing reminder for W.P.(C) 12345/2024",
      notes: "Client confirmed receipt",
      status: "completed"
    }
  ],
  
  // FILES
  files: [
    {
      name: "Affidavit.pdf",
      type: "affidavit", // affidavit | agreement | judgment | other
      s3_url: "https://s3.../affidavit.pdf",
      uploaded_at: ISODate("2026-02-10"),
      uploaded_by: ObjectId
    }
  ],
  
  // BILLING
  billing: {
    total_billed: 50000, // in rupees
    total_paid: 35000,
    outstanding: 15000,
    preferred_payment_method: "bank_transfer" // bank_transfer | upi | check
  },
  
  // NOTES
  notes: "VIP client, handles large cases, prefers morning meetings",
  tags: ["priority", "corporate", "repeat_client"],
  
  status: "active", // active | inactive | moved | deceased
  
  created_at: ISODate("2026-01-15"),
  updated_at: ISODate("2026-03-08"),
  is_deleted: false
}
```

### **5. cases**
```javascript
{
  _id: ObjectId,
  user_id: ObjectId, // Lawyer who added this case
  
  // CASE IDENTIFICATION
  case_number: "W.P.(C) 16325/2024",
  case_type: "Writ Petition - Civil", // From parser or manual
  case_year: 2024,
  
  // PARTIES
  petitioner: "Dr Satendra Singh & ANR.",
  respondent: "Union of India & ORS.",
  petitioner_advocates: ["Mayank Sapra", "Priya Sharma"],
  respondent_advocates: ["Government Counsel"],
  
  // COURT DETAILS
  court: "Delhi High Court",
  court_location: "New Delhi",
  bench: "SINGLE BENCH",
  judge: "Hon'ble Mr. Justice Tejas Karia",
  court_no: "COURT NO. 01",
  court_room: "101", // Physical room number
  
  // HEARING SCHEDULE
  hearing: {
    date_scheduled: ISODate("2026-03-15T10:00:00Z"),
    date_str: "15.03.2026",
    time: "10:00 AM",
    section: "FOR ADMISSION", // FROM ADMISSION | AFTER NOTICE | etc
    item_no: 5 // Position in cause list
  },
  
  // CASE TRACKING
  status: "hearing_scheduled", // hearing_scheduled | adjourned | part_heard | disposal_pending | disposed | stayed
  next_date: ISODate("2026-04-15T10:00:00Z"), // If adjourned
  last_hearing_date: ISODate("2026-02-15"),
  adjournment_reason: "Arguments not completed",
  
  // CASE DETAILS
  description: "PIL regarding environmental pollution in Delhi",
  facts: "Detailed case facts and circumstances...",
  law_points: ["Right to clean air", "Constitutional rights"],
  relief_sought: "Writ of Mandamus to shut down polluting factories",
  
  // LINKED CASES
  linked_cases: [
    {
      case_number: "CM APPL. 79765/2025",
      link_type: "interim_application", // interim_application | connected_matter | appeal_case
      status: "pending"
    }
  ],
  
  // CLIENT LINKAGE
  clients: [
    {
      client_id: ObjectId,
      role: "petitioner", // petitioner | respondent | interested_party
      added_at: ISODate("2026-01-20")
    }
  ],
  
  // FILES
  files: [
    {
      name: "Petition.pdf",
      type: "petition", // petition | affidavit | judgment | order | reply | written_submission
      s3_url: "https://s3.../petition.pdf",
      uploaded_at: ISODate("2026-01-15"),
      size_mb: 2.5
    }
  ],
  
  // INTERNAL NOTES
  lawyer_notes: [
    {
      added_by: ObjectId,
      date: ISODate("2026-03-08T09:30:00Z"),
      note: "Justice Karia asked about environmental audit. Need to file additional affidavit.",
      is_private: false // Others on team can see
    }
  ],
  
  // FINANCIAL
  fees: {
    total_fee: 100000,
    fee_agreement_date: ISODate("2026-01-15"),
    payment_schedule: "upon disposal",
    amount_received: 50000,
    outstanding: 50000
  },
  
  // PRIORITY & TAGS
  priority: "high", // low | medium | high | urgent
  classification: "civil", // civil | criminal | constitutional
  tags: ["important", "high_profile", "environmental"],
  color: "#FF5733", // For UI organization
  
  // SOURCE
  source: "pdf_parser", // pdf_parser | manual_entry | court_api | bulk_import
  pdf_source: "combined_adv_15.03.2026.pdf",
  
  // METADATA
  created_at: ISODate("2026-01-15"),
  updated_at: ISODate("2026-03-08"),
  case_opened_date: ISODate("2026-01-15"),
  case_closed_date: null,
  is_deleted: false,
  deleted_at: null
}
```

### **6. cases_client_mapping** (M-to-M relationship)
```javascript
{
  _id: ObjectId,
  case_id: ObjectId,
  client_id: ObjectId,
  user_id: ObjectId, // Who created this mapping
  
  role: "petitioner", // petitioner | respondent | interested_party | co-respondent
  relationship_type: "individual", // individual | company | organization
  
  // NOTIFICATION SETTINGS (per client-case combination)
  notifications: {
    enabled: true,
    custom_days_before: [3, 1, 0], // Override default
    channels: ["email", "sms"],
    custom_time: "09:00 AM", // Override default
    skip_weekends: false,
    receive_status_updates: true // Notify of case status changes
  },
  
  // RESPONSIBILITY
  primary_contact: true, // Main contact for this case
  responsible_lawyer: ObjectId, // Who is managing client in this case
  
  added_at: ISODate("2026-01-20"),
  added_by: ObjectId,
  
  created_at: ISODate("2026-01-20"),
  updated_at: ISODate("2026-03-08")
}
```

### **7. auto_tracked_cases**
```javascript
{
  _id: ObjectId,
  user_id: ObjectId, // Lawyer who matched
  
  // CASE DATA
  case_number: "W.P.(C) 12345/2024",
  case_id: ObjectId, // Reference to cases collection if created
  
  // PARSER DATA
  petitioner: "XYZ Corporation",
  respondent: "Union of India",
  court_no: "COURT NO. 01",
  judge: "Justice Karia",
  section: "FOR ADMISSION",
  hearing_date: ISODate("2026-03-15T10:00:00Z"),
  
  // MATCHING
  matched_on: "case_number", // What field matched
  match_confidence: 0.95, // 0.0 - 1.0
  matched_keywords: ["W.P.(C) 12345/2024"],
  
  // NOTIFICATION QUEUE
  notifications: [
    {
      scheduled_for: ISODate("2026-03-08T10:00:00Z"),
      days_before: 7,
      status: "sent", // pending | sent | failed | skipped
      sent_at: ISODate("2026-03-08T10:05:00Z"),
      channels: ["email", "sms", "push"],
      error: null
    },
    {
      scheduled_for: ISODate("2026-03-12T10:00:00Z"),
      days_before: 3,
      status: "pending",
      sent_at: null,
      channels: ["email", "sms", "push"],
      error: null
    }
  ],
  
  source_pdf: "combined_adv_15.03.2026.pdf",
  parsed_at: ISODate("2026-03-06T06:15:00Z"),
  
  created_at: ISODate("2026-03-06T06:15:00Z"),
  updated_at: ISODate("2026-03-08T10:05:00Z")
}
```

### **8. notifications_log**
```javascript
{
  _id: ObjectId,
  user_id: ObjectId,
  case_id: ObjectId,
  client_id: ObjectId,
  
  notification_type: "hearing_reminder", // hearing_reminder | status_change | document_upload | payment_due
  
  channel: "email", // email | sms | push | in_app | whatsapp
  
  // SCHEDULING
  scheduled_for: ISODate("2026-03-12T10:00:00Z"),
  sent_at: ISODate("2026-03-12T10:05:30Z"),
  
  status: "sent", // pending | sent | failed | skipped | read | clicked
  
  // CONTENT
  recipient: "raj@example.com", // email or phone
  subject: "Hearing reminder - W.P.(C) 12345/2024",
  body: "Your case hearing is scheduled for March 15, 2026...",
  template_used: "hearing_reminder_3days",
  
  // METADATA
  metadata: {
    case_number: "W.P.(C) 12345/2024",
    hearing_date: "15.03.2026",
    days_before: 3,
    court_no: "COURT NO. 01",
    judge: "Justice Karia"
  },
  
  // ERROR TRACKING
  error: null,
  error_code: null, // If failed
  error_message: null,
  
  // RETRY
  retry_count: 0,
  next_retry: null,
  
  // ENGAGEMENT
  opened_at: null, // For email with tracking pixel
  clicked_at: null,
  
  created_at: ISODate("2026-03-08T10:00:00Z")
}
```

### **9. files** (Case documents)
```javascript
{
  _id: ObjectId,
  user_id: ObjectId,
  case_id: ObjectId,
  
  name: "Affidavit.pdf",
  type: "affidavit", // petition | affidavit | judgment | order | reply | written_submission | research | other
  
  file_info: {
    original_name: "Affidavit_Dr_Singh.pdf",
    mime_type: "application/pdf",
    size_bytes: 2500000, // 2.5 MB
    extension: "pdf"
  },
  
  storage: {
    s3_bucket: "ravenslaw-cases",
    s3_key: "user_123/case_456/affidavit.pdf",
    s3_url: "https://s3.../affidavit.pdf",
    cdn_url: "https://cdn.ravenslaw.com/...", // Faster delivery
    access_level: "private" // private | team | client
  },
  
  metadata: {
    uploaded_by: ObjectId,
    uploaded_at: ISODate("2026-02-10T14:30:00Z"),
    
    // For searchability
    text_extracted: "Full text content for search...",
    last_modified: ISODate("2026-02-10"),
    version: 1, // Track versions
    
    tags: ["evidence", "technical"],
    description: "Technical affidavit with Lab reports"
  },
  
  // SHARING
  shared_with: [
    {
      client_id: ObjectId,
      shared_at: ISODate("2026-02-10"),
      shared_by: ObjectId,
      shared_until: null, // null = permanent
      access_token: "token_xyz" // For secure sharing
    }
  ],
  
  // ARCHIVAL
  is_archived: false,
  archived_at: null,
  is_deleted: false,
  deleted_at: null,
  
  created_at: ISODate("2026-02-10"),
  updated_at: ISODate("2026-02-10")
}
```

---

## 🔌 API Endpoints

### **Base URL:** `http://localhost:8000/api/v2`

### **Authentication**
```
All endpoints require:
Header: Authorization: Bearer {clerk_jwt_token}
```

---

## **CASES ENDPOINTS**

### `POST /cases` - Create case (manual)
```
Request:
{
  "case_number": "W.P.(C) 16325/2024",
  "case_type": "Writ Petition - Civil",
  "petitioner": "Dr Satendra Singh",
  "respondent": "Union of India",
  "hearing_date": "2026-03-15T10:00:00Z",
  "judge": "Justice Tejas Karia",
  "court_no": "COURT NO. 01",
  "client_ids": ["client_id_1", "client_id_2"]
}

Response:
{
  "success": true,
  "case_id": "case_123",
  "message": "Case created successfully"
}
```

### `POST /cases/upload-pdf` - Upload PDF & auto-parse
```
Request: FormData
{
  "file": <PDF file>,
  "auto_link_clients": true,
  "auto_create_cases": true
}

Response:
{
  "success": true,
  "pdf_id": "pdf_123",
  "cases_parsed": 124,
  "cases": [
    {
      "case_number": "W.P.(C) 12345/2024",
      "petitioner": "...",
      "hearing_date": "...",
      "auto_linked_clients": ["client_id_1"]
    }
  ]
}
```

### `GET /cases` - List all cases for lawyer
```
Query params:
  ?status=hearing_scheduled
  ?priority=high
  ?judge=Justice+Karia
  ?from_date=2026-03-01&to_date=2026-03-31
  ?search=case_number
  ?page=1&limit=20

Response:
{
  "success": true,
  "total": 45,
  "page": 1,
  "cases": [...]
}
```

### `GET /cases/{case_id}` - Get case details
```
Response:
{
  "success": true,
  "case": {
    "case_number": "...",
    "parties": {...},
    "hearing": {...},
    "clients_linked": [...],
    "files": [...],
    "notes": [...],
    "notifications_sent": [...]
  }
}
```

### `PUT /cases/{case_id}` - Update case
```
Request:
{
  "hearing_date": "2026-03-20T10:00:00Z",
  "status": "adjourned",
  "next_date": "2026-04-15T10:00:00Z",
  "notes": "Argument postponed due to..."
}

Response:
{
  "success": true,
  "case": {...}
}
```

### `DELETE /cases/{case_id}` - Soft delete case
```
Response:
{
  "success": true,
  "message": "Case deleted"
}
```

### `GET /cases/upcoming` - Get upcoming hearings
```
Query params:
  ?days=7 (default: 30)
  ?sort=date_asc

Response:
{
  "success": true,
  "hearings_count": 12,
  "hearings": [
    {
      "case_number": "...",
      "hearing_date": "2026-03-12T10:00:00Z",
      "days_until": 4,
      "clients_linked": [...]
    }
  ]
}
```

### `POST /cases/{case_id}/link-client` - Link case to client
```
Request:
{
  "client_id": "client_id_1",
  "role": "petitioner"
}

Response:
{
  "success": true,
  "message": "Client linked"
}
```

### `POST /cases/{case_id}/upload-file` - Upload case document
```
Request: FormData
{
  "file": <PDF/DOC>,
  "type": "judgment",
  "access_level": "private"
}

Response:
{
  "success": true,
  "file_id": "file_123",
  "file_url": "https://s3.../file.pdf"
}
```

---

## **CLIENTS ENDPOINTS**

### `POST /clients` - Create client
```
Request:
{
  "name": "Raj Kumar",
  "email": "raj@example.com",
  "phone": "+91-97654-32109",
  "client_type": "individual",
  "address": "123 MG Road, Delhi",
  "tags": ["vip", "repeat_client"]
}

Response:
{
  "success": true,
  "client_id": "client_123",
  "client": {...}
}
```

### `GET /clients` - List all clients
```
Query params:
  ?search=name
  ?tag=vip
  ?status=active
  ?page=1&limit=20

Response:
{
  "success": true,
  "total": 87,
  "clients": [...]
}
```

### `GET /clients/{client_id}` - Get client details
```
Response:
{
  "success": true,
  "client": {
    "name": "Raj Kumar",
    "email": "...",
    "phone": "...",
    "linked_cases": [...],
    "files": [...],
    "communications": [...],
    "billing": {
      "total_billed": 50000,
      "total_paid": 35000,
      "outstanding": 15000
    }
  }
}
```

### `PUT /clients/{client_id}` - Update client
```
Request:
{
  "name": "Rajesh Kumar",
  "email": "rajesh@example.com",
  "tags": ["vip", "priority"]
}

Response:
{
  "success": true,
  "client": {...}
}
```

### `DELETE /clients/{client_id}` - Soft delete client
```
Response:
{
  "success": true,
  "message": "Client deleted"
}
```

### `GET /clients/{client_id}/cases` - Get all cases for client
```
Response:
{
  "success": true,
  "total": 5,
  "cases": [...]
}
```

### `POST /clients/bulk-import` - Bulk import clients from CSV
```
Request: FormData
{
  "file": <CSV file>
}

CSV format:
name,email,phone,client_type,address,tags
Raj Kumar,raj@example.com,+91-97654-32109,individual,"Delhi",vip

Response:
{
  "success": true,
  "imported": 45,
  "errors": 2,
  "error_details": [...]
}
```

---

## **SUBSCRIPTION ENDPOINTS**

### `GET /subscription/status` - Get subscription details
```
Response:
{
  "success": true,
  "subscription": {
    "tier": "professional",
    "status": "active",
    "current_period_end": "2026-04-01T00:00:00Z",
    "limits": {
      "cases_limit": 50,
      "cases_used": 12
    },
    "next_billing_date": "2026-04-01",
    "auto_renew": true
  }
}
```

### `GET /subscription/checkout` - Get Stripe checkout link
```
Query params:
  ?tier=professional

Response:
{
  "success": true,
  "checkout_url": "https://checkout.stripe.com/..."
}
```

### `POST /subscription/upgrade` - Upgrade tier
```
Request:
{
  "new_tier": "enterprise"
}

Response:
{
  "success": true,
  "message": "Upgrade scheduled for next billing cycle"
}
```

### `POST /subscription/cancel` - Cancel subscription
```
Request:
{
  "reason": "Too expensive",
  "feedback": ""
}

Response:
{
  "success": true,
  "message": "Subscription will be cancelled at end of current period",
  "cancellation_date": "2026-04-01"
}
```

---

## **NOTIFICATIONS ENDPOINTS**

### `GET /notifications/upcoming` - Get scheduled notifications
```
Query params:
  ?case_id=case_123
  ?days=7

Response:
{
  "success": true,
  "scheduled": [
    {
      "notification_id": "notif_123",
      "case_number": "W.P.(C) 12345/2024",
      "client_name": "Raj Kumar",
      "scheduled_for": "2026-03-12T10:00:00Z",
      "days_before": 3,
      "channels": ["email", "sms"],
      "status": "pending"
    }
  ]
}
```

### `GET /notifications/history` - Get sent notifications log
```
Query params:
  ?status=sent
  ?month=2026-03
  ?case_id=case_123
  ?channel=email
  ?page=1&limit=50

Response:
{
  "success": true,
  "total": 145,
  "notifications": [...]
}
```

### `POST /notifications/{notif_id}/retry` - Retry failed notification
```
Response:
{
  "success": true,
  "message": "Notification queued for retry"
}
```

---

## **PREFERENCES ENDPOINTS**

### `GET /preferences` - Get lawyer preferences
```
Response:
{
  "success": true,
  "preferences": {
    "watched": {
      "case_numbers": [...],
      "judges": [...]
    },
    "notifications": {
      "enabled": true,
      "channels": ["email", "sms"],
      "timing_days": [7, 3, 1, 0]
    }
  }
}
```

### `PUT /preferences` - Update preferences
```
Request:
{
  "watched.judges": ["Justice Karia", "Justice Bakhru"],
  "notifications.timing_days": [5, 2, 1, 0],
  "notifications.notify_at_time": "09:00 AM"
}

Response:
{
  "success": true,
  "preferences": {...}
}
```

---

## **DASHBOARD ENDPOINTS**

### `GET /dashboard` - Get dashboard stats
```
Response:
{
  "success": true,
  "stats": {
    "total_cases": 45,
    "active_cases": 38,
    "upcoming_hearings_7_days": 5,
    "upcoming_hearings_30_days": 12,
    "total_clients": 87,
    "notifications_sent_month": 145,
    "subscription_tier": "professional",
    "cases_used_of_limit": "12/50"
  },
  "recent_cases": [...],
  "upcoming_hearings": [...],
  "recent_communications": [...]
}
```

---

## 🎨 Frontend Components

### **Pages (Next.js)**

#### 1. **app/dashboard/page.tsx** - Main Dashboard
```typescript
// Shows:
- Stats cards (cases, hearings, clients, quota)
- Upcoming hearings (next 7 days)
- Recent cases
- Quick actions
- Subscription status
```

#### 2. **app/dashboard/my-clients/page.tsx** - Clients Management
```typescript
// Shows:
- Searchable client list
- Filter by tag/status
- Add/Edit/Delete clients
- View client details panel
- Bulk import button
- Client cards with linked cases count
```

#### 3. **app/dashboard/my-cases/page.tsx** - Cases Management
```typescript
// Shows:
- Cases table (case #, parties, judge, hearing date)
- Filter by status/priority/date
- Upload PDF button
- Create case button
- Advanced search
- Bulk actions
```

#### 4. **app/dashboard/cases/[case_id]/page.tsx** - Case Details
```typescript
// Shows:
- Case header (case #, parties, judge)
- Hearing details (date, court, section)
- Timeline (last hearing, next hearing)
- Linked clients
- Related documents
- Internal notes
- Notification history
- Actions (edit, delete, add note, upload file, link client)
```

#### 5. **app/dashboard/clients/[client_id]/page.tsx** - Client Details
```typescript
// Shows:
- Client info (contact details)
- Linked cases
- Communication history
- Uploaded files
- Billing info (total billed, paid, outstanding)
- Notes
- Actions (edit, add note, upload file, send message)
```

#### 6. **app/subscription/page.tsx** - Subscription & Billing
```typescript
// Shows:
- Current subscription tier
- Features included
- Billing date
- Upgrade/Downgrade options
- Invoice history
- Payment method
- Cancel subscription
```

#### 7. **app/settings/preferences/page.tsx** - Notification Preferences
```typescript
// Shows:
- Case tracking keywords form
- Notification channel toggles
- Notification timing sliders
- Timezone selector
- Email/Phone settings
- Do Not Disturb settings
```

#### 8. **app/parser/upload/page.tsx** - PDF Upload (New)
```typescript
// Shows:
- Drag-drop PDF upload
- Auto-parse preview
- Parsed cases list
- Link clients option
- Bulk import preparation
```

---

## 🔄 User Flows

### **Flow 1: Lawyer Subscribes**
```
1. Visit ravenslaw.com/subscribe
2. Select tier (Professional)
3. Click "Subscribe Now"
4. Stripe payment page
5. Enter card details
6. Payment successful
7. Subscription activated
8. Redirected to dashboard
9. Onboarding: "Set your tracking keywords"
```

### **Flow 2: Lawyer Tracks Cases (Automatic)**
```
1. Lawyer enters keywords:
   - Case number: W.P.(C) 12345/2024
   - Judge: Justice Karia
   
2. Every 6 hours, system:
   - Downloads latest court PDFs
   - Parses 2000+ cases
   - Checks: Does case match keywords?
   - YES? → Create auto_tracked_case entry
   
3. System schedules notifications:
   - 7 days before: "Hearing coming"
   - 3 days before: "3 days left"
   - 1 day before: "Tomorrow"
   - Day of: "TODAY!"
   
4. Notifications sent automatically
   - Email + SMS (based on tier)
   - Lawyer receives alerts

5. Lawyer views in dashboard:
   - See upcoming case
   - Click to view full details
   - No effort needed
```

### **Flow 3: Lawyer Manually Adds Client**
```
1. Dashboard → My Clients
2. Click "Add Client"
3. Fill form:
   - Name
   - Email
   - Phone
   - Address
   - Type (individual/company)
   - Tags (vip, priority, etc)
4. Save
5. Client created
6. Can now link to cases
```

### **Flow 4: Link Case to Client**
```
1. In Case Details page
2. Scroll to "Linked Clients"
3. Click "Link Client"
4. Select from dropdown or search
5. Choose role (petitioner/respondent)
6. Save
7. Client automatically gets notifications (based on preferences)
```

### **Flow 5: Client Receives Notification**
```
Day 1 (7 days before):
  System checks: Case has hearing?
  Check: Should notify client?
  Create notification for 12.03 @ 10 AM
  
Day 2 (6 days before):
  Cron job runs at 6 AM
  Notification due? No
  Wait...
  
Day 6 (3 days before, 12.03):
  Cron runs at 10:05 AM
  Notification due? YES
  Check subscription tier: Professional
  Channels: email, sms, push
  
  Send:
  ├─ Email: "Your case hearing on 15 March"
  ├─ SMS: "Hearing 15.03 - Court 01"
  └─ Push notification
  
  Log in database: status = "sent"
  
Day 8 (1 day before, 14.03):
  Repeat notification process
  
Day 9 (day of, 15.03):
  Morning reminder: "Hearing TODAY!"
  
Result: Client is fully prepared ✅
```

### **Flow 6: Upload PDF & Auto-Parse**
```
1. Dashboard → My Cases
2. Click "Upload PDF"
3. Select file: combined_adv_15.03.2026.pdf
4. Click "Parse"
5. System:
   - Uploads to backend
   - Parser extracts cases
   - Shows preview of parsed cases
6. Option: "Link to Clients"
   - Auto-match party names to clients
7. Review & Save
8. Cases created in database
9. Notifications automatically scheduled
```

---

## 💳 Payment & Subscription

### **Stripe Integration**

#### Event Handlers (Webhooks)
```python
@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    # Event: checkout.session.completed
    # → Create subscription
    
    # Event: invoice.payment_succeeded
    # → Update subscription status
    
    # Event: customer.subscription.deleted
    # → Mark subscription as cancelled
    
    # Event: invoice.payment_failed
    # → Send retry email
```

#### Subscription Life Cycle
```
Free → Trial (14 days) → Paid
                    ↓
              Active subscription
                    ↓
    Upgrade/Downgrade/Renew
                    ↓
         Cancelled (retains data for 30 days)
```

---

## 🚀 Implementation Roadmap

### **Phase 1: Foundation (Weeks 1-2)**
- [ ] Database setup (MongoDB collections)
- [ ] Clerk authentication integration
- [ ] Basic CRUD for cases & clients
- [ ] Stripe subscription setup
- [ ] API endpoints (v0.1)

### **Phase 2: Core Features (Weeks 3-4)**
- [ ] PDF upload & parsing integration
- [ ] Auto-tracking logic
- [ ] Notification scheduling
- [ ] Dashboard UI
- [ ] Cases & Clients management pages

### **Phase 3: Notifications (Weeks 5-6)**
- [ ] Email sending (SendGrid)
- [ ] SMS sending (Twilio)
- [ ] Push notifications (Firebase)
- [ ] Notification history & logs
- [ ] Cron jobs setup

### **Phase 4: Polish & Testing (Week 7)**
- [ ] UI/UX refinement
- [ ] End-to-end testing
- [ ] Security audit
- [ ] Performance optimization
- [ ] Production deployment

---

## 🛠️ Technical Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14, React, TypeScript, TailwindCSS |
| **Backend** | FastAPI, Python 3.11 |
| **Database** | MongoDB Atlas |
| **Auth** | Clerk |
| **Payments** | Stripe |
| **File Storage** | AWS S3 + CloudFront CDN |
| **Email** | SendGrid |
| **SMS** | Twilio |
| **Push** | Firebase Cloud Messaging |
| **Scheduling** | APScheduler (Cron) |
| **Async Jobs** | Celery + Redis |
| **Deployment** | Docker + Docker Compose |

---

## 📊 Success Criteria

By end of implementation:
- [ ] Lawyers can subscribe & pay via Stripe
- [ ] PDFs auto-download & parse every 6 hours
- [ ] Cases auto-tracked without manual setup
- [ ] Notifications sent 99.9% on time
- [ ] Dashboard shows all case info in one place
- [ ] Clients linked to cases seamlessly
- [ ] Files organize automatically
- [ ] < 500ms API response times
- [ ] 99.99% uptime
- [ ] No lawyer does manual case tracking

---

## 📝 Summary

**You now have:**
1. Complete database schema
2. All API endpoints defined
3. UI component structure
4. User flows documented
5. Payment integration plan
6. 4-phase implementation roadmap
7. Technical stack defined

**This README is ready to show to another developer who can:**
- [ ] Understand the complete product
- [ ] Build each component step-by-step
- [ ] Implement without needing clarification
- [ ] Deploy a full production system

**Ready to implement? Start with Phase 1! 🚀**
