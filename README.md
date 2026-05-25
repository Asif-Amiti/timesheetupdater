timesheetupdater/
├── client/                          # React SPA (Vite + TypeScript + MUI)
│   ├── src/
│   │   ├── App.tsx                  # Root with auth & routing
│   │   ├── auth/msalConfig.ts       # Azure AD / MSAL config
│   │   ├── components/
│   │   │   ├── Layout.tsx           # App shell (nav drawer, header)
│   │   │   └── CalendarGrid.tsx     # Day-by-day grid (mobile responsive)
│   │   ├── pages/
│   │   │   ├── TimesheetPage.tsx    # Fill timesheet (auto-saves)
│   │   │   ├── DownloadPage.tsx     # Download Excel
│   │   │   └── LoginPage.tsx        # Microsoft login
│   │   └── services/api.ts          # Axios API client
│   └── .env                         # Vite env vars
├── server/                          # Express + TypeScript API
│   ├── src/
│   │   ├── index.ts                 # Entry point
│   │   ├── auth/entraAuth.ts        # JWT validation (dev bypass included)
│   │   ├── routes/
│   │   │   ├── employees.ts         # GET /api/employees
│   │   │   ├── timesheet.ts         # GET/PUT /api/timesheet/:month/:empId
│   │   │   └── download.ts          # GET /api/download/:month → .xlsx
│   │   ├── services/
│   │   │   ├── dataStore.ts         # JSON file read/write (atomic)
│   │   │   └── excelExport.ts       # ExcelJS workbook generation
│   │   └── scripts/seedEmployees.ts # Import from Excel
│   ├── data/                        # Seeded data (91 employees, 6 months)
│   └── .env
├── .github/workflows/deploy.yml     # CI/CD to Azure App Service
└── package.json                     # Root scripts


run: 
npm install; npm run dev

Deploy:
<!-- az webapp up --name ihc-time-app --resource-group mbmdp-e-d-x2e-appservice1-rg --runtime "NODE:24-lts"

az webapp up --name ihc-time-app --resource-group mbmdp-e-d-x2e-appservice1-rg --subscription 6936d4f0-fc5f-4dbd-b78a-f69d7ebca218 -->

"c:\Users\maasifk\Documents\CodeBase\timesheetupdater\server"; npm install; npm run build; npm install --omit=dev; cd ..; npm run build:client; Remove-Item app.zip -Force -ErrorAction SilentlyContinue; tar -acf app.zip package.json server/dist server/package.json server/node_modules server/data server/.env client/dist; az webapp deploy --name ihc-time-app --resource-group mbmdp-e-d-x2e-appservice1-rg --src-path app.zip --type zip --clean true

az webapp deploy --name ihc-time-app --resource-group mbmdp-e-d-x2e-appservice1-rg --subscription 6936d4f0-fc5f-4dbd-b78a-f69d7ebca218 --src-path app.zip --type zip --clean true

┌─────────────────────────────────────────────────────┐
│  timesheet-input container (READ-ONLY)              │
│  └── MBRDI_TIMESHEET_PORTAL_INPUT.XLSX              │
│      ├── May'26 sheet  ─┐                           │
│      ├── Jun'26 sheet   │ Parsed on upload          │
│      └── ... (has Emp Id headers + day columns)     │
└─────────────────────────────────────────────────────┘
                    │ Upload parses:
                    │ 1. Employee roster (last sheet with "Emp Id")
                    │ 2. Timesheet data from month-named sheets
                    ▼
┌─────────────────────────────────────────────────────┐
│  timesheet-output container (READ-WRITE)            │
│  ├── employee-overrides.json  (add/delete overlay)  │
│  ├── timesheets/2026-05.json  (May timesheet data)  │
│  ├── timesheets/2026-06.json  (Jun timesheet data)  │
│  └── holidays.json                                  │
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