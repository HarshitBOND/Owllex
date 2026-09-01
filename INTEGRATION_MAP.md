# Backend Integration Map

## 📁 Project Structure

```
ravenslaw/
├── backend/                          # Python FastAPI service (renamed from ravenslaw_backend_parser)
│   ├── app/
│   │   ├── main.py                 # FastAPI app entry point
│   │   ├── routes.py               # API endpoints: POST /api/v1/parse
│   │   ├── parser.py               # PDF parsing logic
│   │   ├── models.py               # Response models
│   │   ├── db.py                   # MongoDB integration
│   │   └── config.py               # Settings
│   ├── run.py                       # Start server
│   ├── requirements.txt             # Python dependencies
│   ├── Dockerfile                   # Containerization
│   └── README.md
│
├── frontend/                         # Next.js app
│   ├── app/
│   │   ├── api/
│   │   │   └── parser/
│   │   │       └── parse/
│   │   │           └── route.ts    # [NEW] Proxy to backend
│   │   ├── case-tracking/
│   │   └── ...other pages
│   │
│   ├── components/
│   │   └── parser/
│   │       └── PDFParser.tsx       # [NEW] UI component
│   │
│   ├── lib/
│   │   ├── backendClient.ts        # [NEW] Backend API client
│   │   └── utils.ts
│   │
│   └── .env.local                   # Frontend config (add NEXT_PUBLIC_BACKEND_API)
│
├── .env.backend.example             # [NEW] Backend config template
├── BACKEND_INTEGRATION.md           # [NEW] Integration docs
└── INTEGRATION_MAP.md               # [THIS FILE] Integration guide

```

---

## 🔗 Service Communication Flow

```
User Browser (http://localhost:3000)
    ↓
Next.js Frontend
    ↓
Frontend Components (e.g., PDFParser.tsx)
    ↓
Backend Client (lib/backendClient.ts)
    ↓
API Route (app/api/parser/parse/route.ts)  ← Optional proxy layer
    ↓
Python Backend Service (http://localhost:8000)
    ↓
Parser Logic (backend/app/parser.py)
    ↓
MongoDB (optional, if save_to_db=true)
```

---

## 📡 Available Endpoints

### Frontend Uses These:

| Route | Method | Purpose | File |
|-------|--------|---------|------|
| `/api/parser/parse` | POST | Upload PDF → Parse → Return cases | `app/api/parser/parse/route.ts` |
| Backend direct | POST | Use backend client directly | `lib/backendClient.ts` |

### Backend Provides These:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/parse` | POST | Upload & parse PDF file |
| `/api/v1/parse/path` | POST | Parse PDF from server path |
| `/health` | GET | Health check |

---

## 🚀 How to Use

### 1. In a React Component

```typescript
import { PDFParser } from '@/components/parser/PDFParser';

export default function CaseTrackingPage() {
  const handleCasesParsed = (cases) => {
    console.log('Parsed cases:', cases);
    // Save to database, update state, etc.
  };

  return <PDFParser onCasesParsed={handleCasesParsed} />;
}
```

### 2. Directly with Backend Client

```typescript
import { parsePDFFile } from '@/lib/backendClient';

const file = event.target.files[0];
const result = await parsePDFFile(file);
console.log(`Parsed ${result.total_cases} cases`);
```

### 3. Via API Route

```typescript
const formData = new FormData();
formData.append('file', pdfFile);

const response = await fetch('/api/parser/parse', {
  method: 'POST',
  body: formData,
});

const result = await response.json();
```

---

## ⚙️ Configuration

### Frontend `.env.local`

```env
# Backend service URL
NEXT_PUBLIC_BACKEND_API=http://localhost:8000

# For production
# NEXT_PUBLIC_BACKEND_API=https://api.ravenslaw.com
```

### Backend `backend/.env`

```env
HOST=localhost
PORT=8000
DEBUG=true
CORS_ORIGINS=["http://localhost:3000"]

# Optional MongoDB
MONGODB_URI=mongodb://localhost:27017/ravenslaw
MONGODB_DB=ravenslaw

# Upload settings
MAX_PDF_SIZE_MB=50
UPLOAD_DIR=uploads/
```

---

## 📊 Data Flow for Case Tracking & Notifications

```
1. User uploads PDF
        ↓
2. Backend parses into structured cases
        ↓
3. Cases stored in MongoDB (if enabled)
        ↓
4. Frontend retrieves parsed cases
        ↓
5. Frontend stores in state/database
        ↓
6. Notification system monitors case dates
        ↓
7. Send alerts when hearings approach
```

---

## 🔄 Integration Checklist

- [x] Backend folder renamed to `backend/`
- [x] Created `lib/backendClient.ts` - Backend API client utility
- [x] Created `app/api/parser/parse/route.ts` - Frontend API proxy
- [x] Created `components/parser/PDFParser.tsx` - Reusable UI component
- [x] Created `BACKEND_INTEGRATION.md` - Integration documentation
- [x] Created `.env.backend.example` - Config template

**Next Steps:**
- [ ] Add `NEXT_PUBLIC_BACKEND_API` to your `.env.local`
- [ ] Start backend service (`cd backend && python run.py`)
- [ ] Start frontend (`npm run dev`)
- [ ] Import `PDFParser` in your case tracking page
- [ ] Test PDF upload and parsing

---

## 📝 Example: Case Tracking Page Integration

```typescript
// app/case-tracking/page.tsx
'use client';

import { useState } from 'react';
import { PDFParser } from '@/components/parser/PDFParser';

interface CaseItem {
  case_number: string;
  hearing_date: string;
  petitioner: string;
  respondent: string;
}

export default function CaseTrackingPage() {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [error, setError] = useState<string>('');

  const handleCasesParsed = (parsedCases: CaseItem[]) => {
    setCases(parsedCases);
    setError('');
    // TODO: Save to database
    // TODO: Setup notification dates
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Case Tracking</h1>
      
      <PDFParser onCasesParsed={handleCasesParsed} onError={setError} />
      
      {error && <div className="text-red-600 mt-4">{error}</div>}
      
      {cases.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">
            Tracked Cases ({cases.length})
          </h2>
          <div className="grid gap-4">
            {cases.map((c) => (
              <div key={c.case_number} className="p-4 border rounded">
                <h3 className="font-bold">{c.case_number}</h3>
                <p>📅 Hearing: {c.hearing_date}</p>
                <p>👤 {c.petitioner}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## 🐛 Troubleshooting

### Backend Connection Failed
- Check backend is running: `python run.py` in `backend/` folder
- Backend should be at `http://localhost:8000`
- Check `NEXT_PUBLIC_BACKEND_API` in `.env.local`

### CORS Errors
- Make sure backend includes frontend URL in `CORS_ORIGINS`
- Restart backend after changing config

### File Upload Size
- Max file size in backend: 50MB (configured in `MAX_PDF_SIZE_MB`)
- Increase in `backend/.env` if needed

---

## 📚 References

- [Backend API Docs](http://localhost:8000/docs) (when backend running)
- [BACKEND_INTEGRATION.md](BACKEND_INTEGRATION.md)
- [PDFParser Component](components/parser/PDFParser.tsx)
- [Backend Client](lib/backendClient.ts)
