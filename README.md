timesheetupdater/
├── client/                          # React SPA (Vite + TypeScript + MUI)
│   ├── src/
│   │   ├── App.tsx                  # Root with auth & routing
│   │   ├── components/
│   │   │   ├── Layout.tsx           # App shell (nav drawer, header)
│   │   │   └── CalendarGrid.tsx     # Day-by-day grid (mobile responsive)
│   │   ├── pages/
│   │   │   ├── TimesheetPage.tsx    # Fill timesheet (auto-saves)
│   │   │   ├── DownloadPage.tsx     # Download Excel
│   │   │   └── AdminPage.tsx        # Admin panel
│   │   └── services/api.ts          # Axios API client
├── api/                             # Vercel Serverless Function (Express)
│   └── index.ts                     # API handler (wraps Express app)
├── server/                          # Express + TypeScript API (shared source)
│   ├── src/
│   │   ├── index.ts                 # Local dev entry point
│   │   ├── routes/
│   │   │   ├── employees.ts         # GET /api/employees
│   │   │   ├── timesheet.ts         # GET/PUT /api/timesheet/:month/:empId
│   │   │   ├── download.ts          # GET /api/download/:month → .xlsx
│   │   │   └── admin.ts             # Admin routes (upload, manage)
│   │   ├── services/
│   │   │   ├── dataStore.ts         # JSON file read/write + blob storage
│   │   │   ├── blobStore.ts         # Azure Blob Storage adapter
│   │   │   └── excelExport.ts       # ExcelJS workbook generation
│   │   └── scripts/seedEmployees.ts # Import from Excel
│   ├── data/                        # Seeded data (bundled for initial deploy)
├── vercel.json                      # Vercel deployment configuration
└── package.json                     # Root scripts


## Local Development

```bash
npm run install:all
npm run dev
```

## Deploy to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket
2. Import the project in [Vercel Dashboard](https://vercel.com/new)
3. Set environment variables in Vercel project settings:
   - `BLOB_READ_WRITE_TOKEN` — Required for persistent data storage (from Vercel Blob store)
4. Deploy — Vercel will auto-detect the configuration from `vercel.json`

### Important Notes

- **Data persistence**: Vercel serverless functions have a read-only filesystem. You MUST create a Vercel Blob store and set `BLOB_READ_WRITE_TOKEN` for production use.
- **Local dev** still uses the filesystem under `server/data/` by default (when `BLOB_READ_WRITE_TOKEN` is not set).
- The `api/index.ts` serverless function wraps the Express app and is the single entry point for all `/api/*` requests.

## Architecture

┌─────────────────────────────────────────────────────┐
│  Vercel Blob: input/ prefix (READ-ONLY)             │
│  └── input/MBRDI_TIMESHEET_PORTAL_INPUT.XLSX        │
│      ├── May'26 sheet  ─┐                           │
│      ├── Jun'26 sheet   │ Parsed on upload          │
│      └── ... (has Emp Id headers + day columns)     │
└─────────────────────────────────────────────────────┘
                    │ Upload parses:
                    │ 1. Employee roster (last sheet with "Emp Id")
                    │ 2. Timesheet data from month-named sheets
                    ▼
┌─────────────────────────────────────────────────────┐
│  Vercel Blob: output/ prefix (READ-WRITE)           │
│  ├── output/employee-overrides.json                 │
│  ├── output/timesheets/2026-05.json                 │
│  ├── output/timesheets/2026-06.json                 │
│  └── output/holidays.json                           │
└─────────────────────────────────────────────────────┘
                    │
                    ▼ Download any month
┌─────────────────────────────────────────────────────┐
│  Generated Excel (matches input format exactly)     │
│  Cols A-I: Employee metadata from input Excel       │
│  Cols J-Q: Formulas (Allocated Days, Billed, etc.)  │
│  Cols R-U: Tracker flags from timesheet JSON        │
│  Cols V+:  Day columns (1, H, L, NB, HDL)          │
└─────────────────────────────────────────────────────┘