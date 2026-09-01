# Ravenslaw - Automated PDF Scraper & Parser Workflow

## 🎯 Workflow Overview

Your system will work like this:

```
┌─────────────────────────────────────────────────────────────────┐
│              AUTOMATED PDF SCRAPER WORKFLOW                     │
└─────────────────────────────────────────────────────────────────┘

STEP 1: SCHEDULER 
   ↓
   Time trigger: Every day at 6:00 AM
   (Configured via cron: 0 6 * * *)
   
STEP 2: CHECK WHAT'S NEW
   ↓
   Query MongoDB collection: "downloaded_pdfs"
   Get list of PDFs we've already processed
   Compare with new PDFs on court website
   Filter out old PDFs (only get NEW ones)
   
STEP 3: DOWNLOAD NEW PDFs ONLY
   ↓
   Loop through each NEW PDF found:
   └─ Download from: https://delhihighcourt.nic.in/web/cause-lists/cause-list
   └─ Save to: /backend/uploads/temp/
   └─ Record metadata: 
      ├─ Filename
      ├─ Download date/time
      ├─ File size
      └─ URL source
   
STEP 4: PARSE EACH NEW PDF
   ↓
   For each downloaded PDF:
   └─ Use existing parser: POST /api/v1/parse
   └─ Extract case information:
      ├─ Case number (W.P. 12345/2024)
      ├─ Petitioner name
      ├─ Respondent name
      ├─ Judge name
      ├─ Court number
      ├─ Hearing date
      ├─ Hearing status
      └─ Other details
   
STEP 5: SAVE TO DATABASE
   ↓
   Store extracted data:
   ├─ Collection: "cases"
      ├─ Case details (from parser)
      ├─ Source PDF name
      ├─ Parsed date
      └─ Status: "extracted"
   │
   └─ Collection: "downloaded_pdfs"
      ├─ Filename
      ├─ Download date
      ├─ Parse status: "completed"
      └─ Processed: true
   
STEP 6: CLEANUP - DELETE PDF
   ↓
   Delete the PDF file from disk:
   └─ rm /backend/uploads/temp/{filename}.pdf
   └─ Free up storage space ✓
   
STEP 7: LOG & NOTIFY
   ↓
   Record in MongoDB:
   ├─ Collection: "scraper_logs"
      ├─ Run date
      ├─ PDFs found
      ├─ PDFs downloaded
      ├─ Cases extracted
      ├─ Status: "success" / "failed"
      └─ Error (if any)
   
   Send admin notification (via SendGrid):
   └─ "6 new PDFs processed, 42 new cases found"

REPEAT DAILY ↻
   ↓
   Next day at 6 AM, scheduler runs again
   Process only NEW PDFs since yesterday
```

---

## 📊 Database Collections

### **1. downloaded_pdfs** (Tracks what we've downloaded)
```javascript
{
  _id: ObjectId,
  filename: "cause_list_09_03_2026.pdf",
  download_url: "https://delhihighcourt.nic.in/web/cause-lists/cause-list",
  downloaded_at: ISODate("2026-03-09T06:15:30Z"),
  file_size_bytes: 2048576,
  file_hash: "abc123def456", // To detect duplicate PDFs
  parse_status: "completed", // pending, completed, failed
  cases_extracted: 42,
  processed: true,
  deleted_at: ISODate("2026-03-09T06:45:30Z"), // When PDF was deleted
  error_message: null
}
```

### **2. cases** (Extracted case data - already exists)
```javascript
{
  _id: ObjectId,
  case_number: "W.P.(C) 16325/2024",
  petitioner: "John Doe",
  respondent: "XYZ Corporation",
  judge: "Hon'ble Mr. Justice Tejas Karia",
  court_number: "COURT NO. 01",
  hearing_date: ISODate("2026-03-15T10:00:00Z"),
  hearing_status: "Scheduled",
  source_pdf: "cause_list_09_03_2026.pdf",
  parsed_at: ISODate("2026-03-09T06:20:45Z"),
  status: "extracted"
}
```

### **3. scraper_logs** (Activity log)
```javascript
{
  _id: ObjectId,
  run_date: ISODate("2026-03-09T06:00:00Z"),
  pdfs_found: 8,
  pdfs_downloaded: 6, // Only new ones
  pdfs_skipped: 2, // Already downloaded
  cases_extracted: 42,
  execution_time_seconds: 45,
  status: "success", // success, partial, failed
  error_message: null,
  admin_notified: true
}
```

---

## ⚙️ How We Detect "NEW" PDFs

### **Method 1: File Hash Comparison** ✅ (PRIMARY)
```
1. Download each PDF from court website
2. Calculate MD5/SHA256 hash of file content
3. Check if hash exists in downloaded_pdfs collection
4. IF EXISTS = Same PDF, skip it
5. IF NOT EXISTS = New PDF, process it
```

### **Method 2: Filename + Date Comparison** (SECONDARY)
```
1. Extract date from PDF filename: "cause_list_09_03_2026.pdf"
2. Check if this date exists in downloaded_pdfs
3. IF EXISTS = Likely same PDF, skip it
4. IF NOT EXISTS = Likely new PDF, download it
```

### **Method 3: Last Download Timestamp** (FALLBACK)
```
1. Store last_successful_run in database
2. Only download PDFs modified AFTER last_successful_run
3. Example: Last run was 08-Mar, only check PDFs from 09-Mar onwards
```

---

## 🔄 Processing Pipeline

```
DOWNLOAD LOOP:
┌──────────────────────────────────────────────────────┐
│ For each PDF on court website:                       │
│                                                      │
│ 1. Check file hash against database                 │
│    ├─ Already processed? → SKIP ✓                  │
│    └─ New? → DOWNLOAD                              │
│                                                      │
│ 2. Save to temp folder:                             │
│    └─ /backend/uploads/temp/{timestamp}_{filename}  │
│                                                      │
│ 3. Record in downloaded_pdfs:                        │
│    └─ filename, url, hash, timestamp                │
│                                                      │
│ 4. Call PDF Parser API:                             │
│    └─ POST /api/v1/parse/path                       │
│    └─ Pass file path                                │
│                                                      │
│ 5. Extract cases:                                    │
│    └─ Get JSON response from parser                 │
│    └─ Get array of case objects                     │
│                                                      │
│ 6. Store in "cases" collection:                      │
│    └─ Save each case with source PDF ref            │
│                                                      │
│ 7. Update downloaded_pdfs status:                    │
│    └─ Set parse_status = "completed"                │
│    └─ Set cases_extracted = count                   │
│                                                      │
│ 8. DELETE the PDF file:                              │
│    └─ rm /backend/uploads/temp/{filename}           │
│    └─ Update deleted_at timestamp                   │
│    └─ Free up disk space ✓                          │
│                                                      │
│ 9. Log to scraper_logs:                              │
│    └─ Increment counters                            │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## 🛠️ Implementation Details

### **Scheduler Setup** (Backend)
```python
# backend/app/scheduler.py
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = BackgroundScheduler()

# Run every day at 6:00 AM
scheduler.add_job(
    func=run_pdf_scraper,
    trigger=CronTrigger(hour=6, minute=0),
    id='daily_pdf_scraper',
    name='Download and parse court PDFs',
    replace_existing=True
)

scheduler.start()
```

### **PDF Download & Processing** (Backend)
```python
# backend/app/routes/scraper.py

async def run_pdf_scraper():
    """
    1. Fetch list of PDFs from court website
    2. Check which are new (not in downloaded_pdfs collection)
    3. Download new ones
    4. Parse each
    5. Delete file
    6. Log results
    """
    
    logs = {
        'pdfs_found': 0,
        'pdfs_downloaded': 0,
        'pdfs_skipped': 0,
        'cases_extracted': 0,
        'errors': []
    }
    
    # Step 1: Get list of PDFs from court website
    pdfs_on_site = await fetch_pdfs_from_court()
    logs['pdfs_found'] = len(pdfs_on_site)
    
    for pdf_info in pdfs_on_site:
        filename = pdf_info['filename']
        url = pdf_info['url']
        
        # Step 2: Check if we already have this PDF
        existing = await db.downloaded_pdfs.find_one({'file_hash': pdf_info['hash']})
        
        if existing:
            logs['pdfs_skipped'] += 1
            continue  # Skip, we already processed this
        
        # Step 3: Download new PDF
        pdf_path = await download_pdf(url, filename)
        logs['pdfs_downloaded'] += 1
        
        # Step 4: Parse using existing parser
        cases = await parse_pdf(pdf_path)
        logs['cases_extracted'] += len(cases)
        
        # Step 5: Save to database
        await db.cases.insert_many(cases)
        await db.downloaded_pdfs.insert_one({
            'filename': filename,
            'download_url': url,
            'downloaded_at': datetime.now(),
            'parse_status': 'completed',
            'cases_extracted': len(cases)
        })
        
        # Step 6: Delete the PDF file
        os.remove(pdf_path)
        await db.downloaded_pdfs.update_one(
            {'filename': filename},
            {'$set': {'deleted_at': datetime.now()}}
        )
    
    # Step 7: Log to database
    await db.scraper_logs.insert_one(logs)
    
    # Step 8: Send admin email
    await send_email_to_admin(logs)
    
    return logs
```

---

## 📧 Admin Notification Email

**Subject**: "Daily PDF Parser Report - 6 PDFs Processed, 42 Cases Found"

**Content**:
```
Ravenslaw Daily Scraper Report
============================

Run Date: 09-Mar-2026 06:00 AM to 06:45 AM

📊 Summary:
  ✓ PDFs Found on Court Website: 8
  ✓ New PDFs Downloaded: 6
  ⊘ PDFs Skipped (already processed): 2
  ✓ Cases Extracted: 42
  ⏱️ Execution Time: 45 seconds

📜 Processed PDFs:
  1. cause_list_09_03_2026.pdf (12 cases)
  2. new_c_09032026.pdf (15 cases)
  3. adv_09_03_2026.pdf (8 cases)
  ... [and 3 more]

❌ Errors: None

💾 Storage Impact:
  Downloaded: 15.2 MB
  Deleted: 15.2 MB
  Net change: 0 MB ✓

✅ Status: SUCCESS
```

---

## 🔒 Safety Features

### **1. Duplicate Prevention**
- File hash comparison ensures we never process same PDF twice
- Even if filename changes, hash will remain same

### **2. Disk Space Management**
- Delete PDF immediately after parsing ✓
- No accumulation of files ✓
- Keeps only extracted data (lightweight) in database

### **3. Error Handling**
- If parsing fails, mark as 'failed' in database
- Don't delete PDF on error (for manual review)
- Retry on next run
- Log all errors

### **4. Rate Limiting**
- Add delays between downloads (to not overload court server)
- Max 10 concurrent downloads
- Retry failed downloads up to 3 times

---

## 📋 What Gets Stored vs. What Gets Deleted

### **KEPT IN DATABASE** ✅
```
- Case information (case number, parties, judge, dates, etc.)
- Metadata (source PDF name, parse date, status)
- Hearing information (dates, times, locations)
- Scraper logs (what was processed, when, stats)
```

### **DELETED FROM DISK** 🗑️
```
- Original PDF files (after parsing)
- Temporary files
- Cache files
```

---

## 🚀 Step-by-Step Setup

### **1. Update .env (Backend)**
```env
# Scheduler
PDF_DOWNLOAD_SCHEDULE=0 6 * * *  # Daily at 6 AM
PDF_DOWNLOAD_ENABLED=true

# Storage
UPLOADS_TEMP_DIR=/backend/uploads/temp
UPLOADS_MAX_SIZE_MB=1000  # Max PDF file size

# Court Website
COURT_WEBSITE_URL=https://delhihighcourt.nic.in/web/cause-lists/cause-list

# Email Notifications
ADMIN_EMAIL=admin@ravenslaw.com
ENABLE_SCRAPER_NOTIFICATIONS=true
```

### **2. Create Database Index**
```javascript
// Speed up file hash lookups
db.downloaded_pdfs.createIndex({ file_hash: 1 }, { unique: true })
db.downloaded_pdfs.createIndex({ downloaded_at: -1 })
db.scraper_logs.createIndex({ run_date: -1 })
```

### **3. Install Dependencies**
```bash
pip install APScheduler requests beautifulsoup4 selenium  # For web scraping
```

---

## 🔍 Monitoring & Debugging

### **Check Recent Runs**
```javascript
// MongoDB
db.scraper_logs.find().sort({ run_date: -1 }).limit(10)
```

### **Check Failed PDFs**
```javascript
db.downloaded_pdfs.find({ parse_status: 'failed' })
```

### **Manually Trigger Scraper** (For testing)
```
POST /api/v1/admin/scraper/run-now
```

### **View Scraper Status**
```
GET /api/v1/admin/scraper/status
```

---

## ✅ Verification Checklist

- [ ] Scheduler runs daily at 6 AM
- [ ] Only NEW PDFs downloaded (old ones skipped)
- [ ] PDFs parsed using existing parser
- [ ] Cases stored in MongoDB
- [ ] PDF files deleted after processing
- [ ] Admin gets daily email report
- [ ] Error handling works (logs failures)
- [ ] No disk space accumulation
- [ ] Logs stored for auditing

---

## 🎯 Success Criteria

**Day 1 (Morning):**
- Scheduler triggers at 6 AM ✓
- 6 new PDFs found and downloaded ✓
- 42 cases extracted and stored ✓
- PDFs deleted from disk ✓
- Admin email received ✓

**Day 2 (Morning):**
- Scheduler triggers at 6 AM ✓
- Only new PDFs downloaded (old ones skipped) ✓
- 5 new cases found (new hearing dates) ✓
- No duplicates in database ✓

---

## 📌 Summary

Your workflow:
1. **6:00 AM Daily**: Scheduler wakes up ⏰
2. **Checks Database**: What PDFs have we processed? 📋
3. **Downloads New**: Only grab what's new from court website 📥
4. **Parses Immediately**: Extract case data using parser 🔍
5. **Saves to DB**: Store extracted cases 💾
6. **Cleans Up**: Delete PDF file to save space 🗑️
7. **Reports**: Send admin a summary email 📧

**Result: Zero manual work, automatic case tracking, zero disk waste!** 🎉

---

**Status**: Ready to implement when you confirm ✅
