import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { timesheetRouter } from '../server/src/routes/timesheet';
import { downloadRouter } from '../server/src/routes/download';
import { employeesRouter } from '../server/src/routes/employees';
import { adminRouter } from '../server/src/routes/admin';
import { initDataStore, saveHolidays, saveEmployeesExcelRaw, saveMonthData } from '../server/src/services/dataStore';
import { isBlobEnabled, inputBlobExists } from '../server/src/services/blobStore';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Possible locations for bundled seed data
function findBundledDataDir(): string {
  const candidates = [
    path.join(process.cwd(), 'server/data'),
    path.join(__dirname, '../server/data'),
    path.join(__dirname, '../../server/data'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      console.log('Found bundled data at:', dir);
      return dir;
    }
  }
  console.warn('No bundled data directory found. Tried:', candidates);
  return candidates[0];
}

// Initialize data store on cold start
let initialized = false;
async function ensureInitialized() {
  if (initialized) return;

  console.log('Initializing... BLOB_READ_WRITE_TOKEN set:', !!process.env.BLOB_READ_WRITE_TOKEN);
  console.log('__dirname:', __dirname, 'cwd:', process.cwd());

  await initDataStore();

  // Seed data to Vercel Blob if not already present
  if (isBlobEnabled()) {
    try {
      const exists = await inputBlobExists('MBRDI_TIMESHEET_PORTAL_INPUT.XLSX');
      if (!exists) {
        const bundledDataDir = findBundledDataDir();
        const xlsxSrc = path.join(bundledDataDir, 'MBRDI_TIMESHEET_PORTAL_INPUT.XLSX');
        if (fs.existsSync(xlsxSrc)) {
          const buffer = fs.readFileSync(xlsxSrc);
          await saveEmployeesExcelRaw(buffer);
          console.log('Seeded MBRDI_TIMESHEET_PORTAL_INPUT.XLSX to blob');
        }
        const holSrc = path.join(bundledDataDir, 'holidays.json');
        if (fs.existsSync(holSrc)) {
          const data = JSON.parse(fs.readFileSync(holSrc, 'utf-8'));
          await saveHolidays(data);
          console.log('Seeded holidays.json to blob');
        }
        const srcTimesheets = path.join(bundledDataDir, 'timesheets');
        if (fs.existsSync(srcTimesheets)) {
          for (const f of fs.readdirSync(srcTimesheets)) {
            const data = JSON.parse(fs.readFileSync(path.join(srcTimesheets, f), 'utf-8'));
            const monthKey = f.replace('.json', '');
            await saveMonthData(monthKey, data);
          }
          console.log('Seeded timesheets to blob');
        }
      } else {
        console.log('Blob data already exists, skipping seed');
      }
    } catch (seedErr) {
      console.error('Seeding failed (non-fatal):', seedErr);
      // Don't block the app — data can be uploaded via admin
    }
  }

  initialized = true;
}

// Ensure initialization before handling any request
app.use(async (req: Request, res: Response, next: NextFunction) => {
  // Let the health check bypass initialization
  if (req.path === '/api/health') return next();
  try {
    await ensureInitialized();
    next();
  } catch (err: any) {
    console.error('Initialization error:', err);
    res.status(500).json({ error: 'Server initialization failed', details: err?.message || String(err) });
  }
});

// Health/diagnostic endpoint — tests blob connectivity
app.get('/api/health', async (req: Request, res: Response) => {
  const { put, list } = await import('@vercel/blob');
  const info: any = {
    blobTokenSet: !!process.env.BLOB_READ_WRITE_TOKEN,
    blobEnabled: isBlobEnabled(),
    cwd: process.cwd(),
    dirname: __dirname,
    nodeVersion: process.version,
  };

  // Check bundled data paths
  const candidates = [
    path.join(process.cwd(), 'server/data'),
    path.join(__dirname, '../server/data'),
    path.join(__dirname, '../../server/data'),
  ];
  info.dataPaths = candidates.map(p => ({ path: p, exists: fs.existsSync(p) }));

  // Test blob read/write if token is set
  if (info.blobTokenSet) {
    try {
      await put('_health-check.txt', 'ok', { access: 'public', addRandomSuffix: false, allowOverwrite: true });
      const { blobs } = await list({ prefix: '_health-check' });
      info.blobWrite = 'OK';
      info.blobRead = blobs.length > 0 ? 'OK' : 'NO BLOBS FOUND';
      info.blobList = blobs.map((b: any) => b.pathname);
    } catch (err: any) {
      info.blobError = err?.message || String(err);
    }
  }

  res.json(info);
});

// API routes
app.use('/api/employees', employeesRouter);
app.use('/api/timesheet', timesheetRouter);
app.use('/api/download', downloadRouter);
app.use('/api/admin', adminRouter);

export default app;
