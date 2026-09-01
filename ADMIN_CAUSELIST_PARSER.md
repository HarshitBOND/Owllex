# Admin Panel: Automated Cause List PDF Scraper & Parser

## 📋 Overview

This document describes the implementation of an **Admin Panel button** that automates the complete workflow of:
1. Downloading PDFs from Delhi High Court cause list
2. Parsing all cases from those PDFs
3. Tracking the last processed PDF to avoid re-processing
4. Deleting PDFs after extraction (to save storage)
5. Initially importing data from the last 3 days for testing

---

## 🎯 Requirements

### Frontend Requirements (Admin Panel)

**Location:** `app/admin/dashboard/page.tsx`

Create a new button/section in the admin dashboard called **"Cause List Parser"** with:

1. **Main Button: "Start Cause List Import"**
   - Triggers the backend to start the scraping and parsing process
   - Shows a loading state while processing
   - Displays real-time progress updates

2. **Status Display Card** showing:
   - Last import timestamp
   - Number of PDFs processed in this run
   - Number of cases parsed
   - Success/error count
   - Current operation status (Downloading PDFs... → Parsing... → Cleaning up...)

3. **Configuration Options:**
   - "Import Last 3 Days" checkbox (for initial testing)
   - "Auto-delete PDFs after parsing" checkbox (enabled by default)

4. **Progress Log:**
   - Real-time log of operations
   - Shows which PDF is being processed
   - Shows parsing results per PDF

---

## 🔧 Backend Requirements (Python/FastAPI)

### Database Schema

**Collection: `pdf_tracking`** (Track latest processed PDF)
```javascript
{
  _id: ObjectId,
  last_processed_pdf_url: String,        // URL of the last PDF processed
  last_processed_timestamp: DateTime,    // When it was processed
  source: String,                        // "cause_list" 
  checkpoint_identifier: String,         // Unique ID to identify the PDF
  created_at: DateTime,
  updated_at: DateTime
}
```

**Collection: `downloaded_pdfs`** (Already exists, add/update fields)
```javascript
{
  _id: ObjectId,
  filename: String,
  url: String,                      // Original URL from court website
  download_timestamp: DateTime,     // When downloaded
  download_date_str: String,        // Date string from website (2024-01-15)
  file_size: Number,
  file_hash: String,               // SHA-256 for duplicate detection
  parse_status: String,            // "pending", "completed", "failed"
  cases_extracted: Number,
  errors: Array,
  deleted_at: DateTime,            // Timestamp when file was deleted
  created_at: DateTime,
  updated_at: DateTime
}
```

**Collection: `scraped_cases`** (Already exists)
```javascript
{
  _id: ObjectId,
  case_number: String,
  petitioner: String,
  respondent: String,
  judge: String,
  court_number: String,
  bench: String,
  hearing_date: DateTime,
  hearing_status: String,
  case_type: String,
  pdf_filename: String,           // Reference to source PDF
  pdf_date: Date,                 // Date of the cause list PDF
  extracted_at: DateTime,
  created_at: DateTime
}
```

### API Endpoints to Implement

#### 1. **POST /api/scraper/parse-causelist-bulk**

Triggers the complete workflow:

**Request:**
```json
{
  "days_back": 3,              // How many days back to import (optional, default 3)
  "auto_delete_pdfs": true,    // Auto-delete after parsing (optional, default true)
  "start_from_checkpoint": true // Only fetch after last processed PDF (required)
}
```

**Response:**
```json
{
  "success": true,
  "import_id": "uuid-string",  // Unique ID for this import session
  "status": "started",
  "message": "Import process started. Subscribe to WebSocket for real-time updates."
}
```

#### 2. **WebSocket /ws/scraper/progress/{import_id}**

Real-time progress updates:

**Messages sent to client:**
```json
{
  "type": "status_update",
  "status": "fetching_pdfs | downloading | parsing | cleaning | completed | error",
  "message": "Fetching PDFs from court website...",
  "data": {
    "pdfs_found": 5,
    "pdfs_downloaded": 2,
    "pdfs_processed": 1,
    "cases_parsed": 45,
    "current_file": "causelist_2024_01_15.pdf",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

#### 3. **GET /api/scraper/causelist-status**

Get current status and last import information:

**Response:**
```json
{
  "success": true,
  "last_import": {
    "import_id": "uuid",
    "timestamp": "2024-01-15T10:30:00Z",
    "status": "completed",
    "pdfs_processed": 5,
    "cases_parsed": 125,
    "errors": 0
  },
  "last_checkpoint": {
    "pdf_url": "https://...",
    "pdf_date": "2024-01-15",
    "processed_at": "2024-01-15T09:00:00Z"
  },
  "current_session": null  // null if no import running, or object if running
}
```

---

## 🔄 Workflow Logic

### Phase 1: Fetch PDF URLs from Delhi High Court

```
1. Visit: https://delhihighcourt.nic.in/web/cause-lists/cause-list
2. Use Selenium/BeautifulSoup to scrape all PDF links
3. Extract PDF date from filename/metadata
4. Check `pdf_tracking` collection for last_processed_timestamp
5. Filter PDFs: Only PDFs downloaded AFTER the checkpoint
6. Send progress: "Found X new PDFs to process"
```

**Important:** The checkpoint should be based on the actual PDF's date/identifier on the website, not just timestamps.

### Phase 2: Download PDFs

```
1. For each new PDF URL:
   a. Download to temp folder: backend/uploads/temp/
   b. Calculate SHA-256 file hash
   c. Check against existing PDFs (avoid duplicates)
   d. Save metadata to `downloaded_pdfs` collection
   e. Send progress update: "Downloaded X of Y PDFs"
2. If download fails, log error and continue with next
```

### Phase 3: Parse PDFs

```
1. For each downloaded PDF:
   a. Call existing parser: parse_pdf(filepath)
   b. Extract all cases
   c. Store in `scraped_cases` collection
   d. Update `downloaded_pdfs`: parse_status = "completed", cases_extracted = count
   e. Send progress: "Parsed X cases from PDF Y"
2. If parsing fails, update parse_status = "failed", log error
```

### Phase 4: Cleanup (Delete PDFs)

```
1. For each successfully parsed PDF:
   a. If auto_delete_pdfs is true:
      - Delete from disk: backend/uploads/temp/
      - Update `downloaded_pdfs`: deleted_at = now()
      - Send progress: "Deleted file to save storage"
2. Update `pdf_tracking` checkpoint:
   - last_processed_pdf_url = last PDF's URL
   - last_processed_timestamp = now()
   - checkpoint_identifier = PDF's unique identifier
```

### Phase 5: Final Status

```
1. Compile summary:
   - Total PDFs processed
   - Total cases parsed
   - Total errors
   - Time taken
2. Store in scraper_logs or session collection
3. Send final WebSocket message with summary
```

---

## 🌐 Frontend Implementation Details

### Admin Dashboard Changes

**File:** `app/admin/dashboard/page.tsx`

Add a new section/card:

```tsx
<div className="admin-section">
  <h2>Cause List Parser</h2>
  
  {/* Last Import Status */}
  <ImportStatusCard lastImport={status.last_import} />
  
  {/* Control Panel */}
  <div className="parser-controls">
    <label>
      <input type="checkbox" checked={autoDelete} onChange={...} />
      Auto-delete PDFs after parsing (saves storage)
    </label>
    <label>
      <input type="checkbox" checked={importLast3Days} onChange={...} />
      Import last 3 days (initial testing)
    </label>
    <Button 
      onClick={handleStartParsing}
      disabled={isRunning}
    >
      {isRunning ? "Running..." : "Start Cause List Import"}
    </Button>
  </div>
  
  {/* Real-time Progress */}
  {isRunning && <ProgressLog messages={progressMessages} />}
</div>
```

### WebSocket Connection

```tsx
useEffect(() => {
  if (!importId) return;
  
  const ws = new WebSocket(`/ws/scraper/progress/${importId}`);
  ws.onmessage = (e) => {
    const update = JSON.parse(e.data);
    setProgressMessages(prev => [...prev, update]);
    setCurrentStatus(update.data);
  };
  
  return () => ws.close();
}, [importId]);
```

---

## 📊 Initial Testing (3-Day Import)

For the first run:

1. **Automatically import PDFs from last 3 days**
   - Scrape all cause list PDFs from the last 3 days
   - Parse all of them in a single batch
   - This tests if everything works correctly

2. **Future runs:**
   - Use checkpoint to only fetch NEW PDFs
   - Only PDFs after the last processed one will be scraped
   - This ensures no re-processing

---

## 🛠️ Implementation Checklist

### Backend (Python/FastAPI):
- [ ] Update MongoDB schema: `pdf_tracking` collection
- [ ] Implement `parse_causelist_bulk()` function
  - [ ] Web scraping: Get PDF URLs from Delhi HC
  - [ ] Filter by checkpoint
  - [ ] Download PDFs
  - [ ] Parse using existing parser
  - [ ] Delete PDFs after parsing
  - [ ] Update tracking
- [ ] Create POST endpoint: `/api/scraper/parse-causelist-bulk`
  - [ ] Generate unique import_id
  - [ ] Start async task
  - [ ] Return immediately
- [ ] Create WebSocket endpoint: `/ws/scraper/progress/{import_id}`
  - [ ] Send real-time updates
  - [ ] Clean up on disconnect
- [ ] Create GET endpoint: `/api/scraper/causelist-status`
  - [ ] Return last import info
  - [ ] Return checkpoint
  - [ ] Return current session (if running)

### Frontend (Next.js/React):
- [ ] Add "Cause List Parser" section to admin dashboard
- [ ] Create ImportStatusCard component
- [ ] Create ParserControlPanel component
- [ ] Create ProgressLog component
- [ ] Implement WebSocket connection logic
- [ ] Handle loading states
- [ ] Show real-time progress
- [ ] Display errors gracefully
- [ ] Auto-refresh status when not running

---

## 🔍 Key Implementation Details

### PDF Checkpoint Tracking

**Problem:** Don't re-process PDFs we've already parsed.

**Solution:**
1. Store the URL/identifier of the last processed PDF in `pdf_tracking`
2. When fetching new PDFs, only download those after this checkpoint
3. Update checkpoint after each successful batch

**Example:**
```
First run: Import PDFs from 2024-01-01 to 2024-01-15
  → Last PDF: "causelist_2024_01_15.pdf"
  → Store checkpoint

Next run: Only fetch PDFs AFTER "causelist_2024_01_15.pdf"
  → Skip all old PDFs automatically
```

### PDF Deletion Logic

**When to delete:**
- After parsing is complete (parse_status = "completed")
- Only if auto_delete_pdfs = true (configurable)
- Record deletion timestamp in database

**Why delete:**
- PDFs can be large (10+ MB each)
- We've already extracted all data
- Can re-scrape if needed (data is in database)

### Duplicate Detection

- Use SHA-256 file hash to detect identical PDFs
- Even if filename changes, we won't re-process
- Skip file if hash matches existing entry in `downloaded_pdfs`

---

## 📝 Expected Output / Behavior

### When Admin Clicks "Start Cause List Import":

1. Button becomes disabled, shows "Running..."
2. Real-time progress appears:
   ```
   ✓ Fetching PDF list from Delhi High Court...
   → Found 5 new PDFs to process
   ✓ Downloaded 1/5: causelist_2024_01_15.pdf
   → Parsing cases...
   ✓ Extracted 25 cases from causelist_2024_01_15.pdf
   → Deleting temporary file...
   ✓ Cleaned up causelist_2024_01_15.pdf
   [... repeats for other PDFs ...]
   
   ✅ IMPORT COMPLETE
   - 5 PDFs processed
   - 125 cases extracted
   - Completed in 2m 34s
   ```

3. Status card updates with:
   - Last import timestamp
   - "125 cases found in 5 PDFs"
   - No button remains disabled (re-enable for next run)

---

## 🚨 Error Handling

**If PDF download fails:**
- Log error
- Mark in `downloaded_pdfs` as failed
- Continue with next PDF
- Show warning in UI

**If parsing fails:**
- Log error with PDF filename
- Mark parse_status = "failed"
- Continue with next PDF
- Show error count in UI

**If WebSocket disconnects:**
- Reconnect automatically
- Resume from last progress point

---

## 🔗 Related Files

- `backend/app/scraper.py` Existing PDF parser logic
- `backend/app/scraper_routes.py` Existing scraper endpoints
- `app/admin/dashboard/page.tsx` Admin panel (add new section here)
- `PDF_SCRAPER_WORKFLOW.md` Original workflow documentation
- `lib/backendClient.ts` Existing backend client (reuse for new endpoints)

---

## 📞 Questions for Implementation

1. **How to detect new PDFs on the court website?**
   - Are they date-based (causelist_2024_01_15.pdf)?
   - Or does the page show a list with dates?
   - Scraping example needed

2. **What's the URL structure for Delhi HC cause list?**
   - Currently: `https://delhihighcourt.nic.in/web/cause-lists/cause-list`
   - Are PDFs linked directly or behind JavaScript?

3. **Storage constraints?**
   - Max PDFs to keep in server storage before deletion?
   - Current temp folder size limit?

---

## 🎯 Success Criteria

✅ Admin can click one button to parse all new cause lists
✅ System downloads PDFs from court website automatically
✅ Parser extracts all case data
✅ PDFs are deleted after parsing (storage optimized)
✅ No duplicate processing (checkpoint tracking)
✅ Real-time progress visible in admin UI
✅ Initial 3-day import works correctly
✅ Subsequent imports only process new PDFs
✅ Error handling is robust

---

**Ready to be assigned to Claude Opus for implementation!**
