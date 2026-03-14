# LexVert Full-Stack Integration Guide

## Project Structure

```
lexvert/
├── frontend/          # Next.js app (current directory)
├── backend/           # Python FastAPI service
├── .env.local         # Frontend env vars
└── ...
```

## Running Both Services

### 1. Start the Backend

```bash
cd backend

# Create virtual environment
python -m venv .venv
.venv\Scripts\activate       # Windows
# source .venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Copy env config
copy .env.example .env       # Windows
# cp .env.example .env       # Linux/Mac

# Run server
python run.py
```

Backend runs at: **http://localhost:8000**
- API Docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

### 2. Start the Frontend

```bash
cd ..  # Go back to project root

npm install
npm run dev
```

Frontend runs at: **http://localhost:3000**

---

## API Integration

### Configure Frontend

Add to `.env.local`:

```env
NEXT_PUBLIC_BACKEND_API=http://localhost:8000
```

### Use in Frontend Components

Example: Upload PDF file to parser

```typescript
// app/api/parse-pdf/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_BACKEND_API}/api/v1/parse`,
    {
      method: 'POST',
      body: formData,
    }
  );
  
  return NextResponse.json(await response.json());
}
```

### Available Backend Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/parse` | Upload & parse PDF file |
| POST | `/api/v1/parse/path` | Parse PDF from server path |
| GET | `/health` | Health check |

---

## Database

Both services can connect to MongoDB:

**Backend**: `.env` (backend folder)
```
MONGODB_URI=mongodb://localhost:27017/lexvert
MONGODB_DB=lexvert
```

---

## Deployment

### Docker Support

Backend includes `Dockerfile`. Deploy as microservice:

```bash
cd backend
docker build -t lexvert-backend .
docker run -p 8000:8000 -e MONGODB_URI=... lexvert-backend
```

### Production Configuration

Update backend `app/config.py` and frontend `.env.local`:

```env
# Frontend
NEXT_PUBLIC_BACKEND_API=https://api.lexvert.com

# Backend .env
HOST=0.0.0.0
PORT=8000
CORS_ORIGINS=["https://lexvert.com", "https://www.lexvert.com"]
```

---

## Case Tracking & Notifications

Cases parsed by backend can be:
- Stored in MongoDB
- Queried by frontend for case tracking
- Used for notification scheduling (dates, status updates)

See [app/api/cases/](app/api/cases/) for case tracking API routes.
