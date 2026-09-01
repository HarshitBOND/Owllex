# Ravenslaw Delhi High Court Cause List Parser API

Production-ready backend service that parses Delhi High Court cause list PDFs into structured JSON data.

## Quick Start

```bash
cd ravenslaw_backend

# Install dependencies (creates .venv automatically, pinned to Python 3.11)
uv sync

# Copy env config
copy .env.example .env       # Windows
# cp .env.example .env       # Linux/Mac

# Run server
uv run python run.py
```

Requires [uv](https://docs.astral.sh/uv/getting-started/installation/). No manual venv setup needed `uv sync` creates `.venv` and installs the exact locked versions from `uv.lock`.

Server starts at **http://localhost:8000**

- API Docs: http://localhost:8000/docs
- Health Check: http://localhost:8000/health

## API Endpoints

### `POST /api/v1/parse` Parse uploaded PDF

Upload a cause list PDF file and get structured data back.

```bash
curl -X POST http://localhost:8000/api/v1/parse \
  -F "file=@combined_adv_04.02.2026.pdf"
```

**Response:**
```json
{
  "success": true,
  "filename": "combined_adv_04.02.2026.pdf",
  "total_cases": 2016,
  "cases": [
    {
      "list_type": "COMBINED CAUSE LIST",
      "list_date": "04.02.2026",
      "court_no": "01",
      "bench": "DIVISION BENCH",
      "judge": "HON'BLE MR.JUSTICE VIBHU BAKHRU; HON'BLE MR.JUSTICE TUSHAR RAO GEDELA",
      "section": "FOR ADMISSION",
      "item_no": "1",
      "main_case_no": "W.P.(C) 16325/2024",
      "linked_cases": ["CM APPL. 79765/2025"],
      "petitioner": "DR SATENDRA SINGH & ANR.",
      "respondent": "UNION OF INDIA & ORS.",
      "advocate_petitioner": "MAYANK SAPRA",
      "advocate_respondent": "HARISH VAIDYANATHAN SHANKAR",
      "raw_parties": "DR SATENDRA SINGH & ANR. V/s UNION OF INDIA & ORS.",
      "source_pdf": "combined_adv_04.02.2026.pdf"
    }
  ]
}
```

### `GET /health` Health check

```json
{"status": "ok", "version": "1.0.0", "mongodb": "not configured"}
```

## Frontend Integration (JavaScript)

```javascript
// Upload and parse a PDF
async function parseCauseList(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("http://localhost:8000/api/v1/parse", {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  console.log(`Parsed ${data.total_cases} cases`);
  return data.cases;
}
```

## Configuration

All settings via environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `RAVENSLAW_HOST` | `0.0.0.0` | Server bind host |
| `RAVENSLAW_PORT` | `8000` | Server port |
| `PORT` | *(empty)* | Platform-injected runtime port (Render/Heroku style) |
| `RAVENSLAW_DEBUG` | `false` | Enable debug mode + auto-reload |
| `ENABLE_SCRAPER_SCHEDULER` | `false` | Enable scheduler only on one dedicated instance |
| `RAVENSLAW_UPLOAD_DIR` | `./uploads` | Temp PDF upload directory |
| `RAVENSLAW_MAX_PDF_SIZE_MB` | `50` | Max upload file size |
| `MONGODB_URI` | *(empty)* | MongoDB connection string (optional) |
| `MONGODB_DB` | `cause_list_db` | MongoDB database name |
| `RAVENSLAW_CORS_ORIGINS` | *(required in production)* | Allowed CORS origins (comma-separated, no wildcard in production) |
| `RAVENSLAW_TRUSTED_HOSTS` | `localhost,127.0.0.1,*.onrender.com` | Trusted host header values |
| `RAVENSLAW_RATE_LIMIT_WINDOW_SECONDS` | `60` | Rate limit time window in seconds |
| `RAVENSLAW_RATE_LIMIT_MAX_REQUESTS` | `120` | Max requests per IP per window |
| `RAVENSLAW_MAX_CONCURRENT_BULK_IMPORTS` | `1` | Maximum parallel bulk import sessions |
| `RAVENSLAW_IMPORT_PROGRESS_TTL_SECONDS` | `86400` | Retention for completed import progress data |
| `RAVENSLAW_INTERNAL_TOKEN` | *(required)* | Shared internal token expected in `x-internal-token` header |

## Docker

```bash
docker build -t ravenslaw .
docker run -p 8000:8000 ravenslaw
```

## Supported PDF Formats

- Combined Cause List (`combined_adv_DD.MM.YYYY.pdf`)
- Advance Cause List (`adv_DD.MM.YYYY.pdf`)
- Supplementary Cause List (`supp_DD.MM.YYYY.pdf`)
- Daily Cause List (`c_DDMMYYYY.pdf`)
- Regular Cause List (`regular_DD.MM.YYYY.pdf`)
- Pronouncement List

## Accuracy

Tested across 11 real DHC PDFs (11,854 cases):

| Metric | Score |
|--------|-------|
| Core Perfect (all fields except adv_respondent) | **99.3%** |
| Full Perfect (all fields) | **80.8%** |
| Valid case numbers | **100%** |
| Petitioner extracted | **100%** |
| Respondent extracted | **100%** |

## Project Structure

```
ravenslaw_backend/
├── app/
│   ├── __init__.py      # Version
│   ├── main.py          # FastAPI app + middleware
│   ├── config.py        # Environment settings
│   ├── models.py        # Data models (CaseEntry + Pydantic)
│   ├── parser.py        # PDF parsing engine (core logic)
│   ├── routes.py        # API endpoints
│   └── db.py            # MongoDB operations (optional)
├── tests/
│   ├── __init__.py
│   └── test_parser.py   # Accuracy tests
├── pyproject.toml
├── uv.lock
├── .env.example
├── .gitignore
├── Dockerfile
├── README.md
└── run.py               # Quick start
```
