import express from 'express';
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

// Initialize data store on cold start
let initialized = false;
async function ensureInitialized() {
  if (initialized) return;
  await initDataStore();

  const bundledDataDir = path.join(__dirname, '../server/data');

  if (isBlobEnabled()) {
    const exists = await inputBlobExists('MBRDI_TIMESHEET_PORTAL_INPUT.XLSX');
    if (!exists) {
      const xlsxSrc = path.join(bundledDataDir, 'MBRDI_TIMESHEET_PORTAL_INPUT.XLSX');
      if (fs.existsSync(xlsxSrc)) {
        const buffer = fs.readFileSync(xlsxSrc);
        await saveEmployeesExcelRaw(buffer);
      }
      const holSrc = path.join(bundledDataDir, 'holidays.json');
      if (fs.existsSync(holSrc)) {
        const data = JSON.parse(fs.readFileSync(holSrc, 'utf-8'));
        await saveHolidays(data);
      }
      const srcTimesheets = path.join(bundledDataDir, 'timesheets');
      if (fs.existsSync(srcTimesheets)) {
        for (const f of fs.readdirSync(srcTimesheets)) {
          const data = JSON.parse(fs.readFileSync(path.join(srcTimesheets, f), 'utf-8'));
          const monthKey = f.replace('.json', '');
          await saveMonthData(monthKey, data);
        }
      }
    }
  }

  initialized = true;
}

// Ensure initialization before handling any request
app.use(async (req, res, next) => {
  try {
    await ensureInitialized();
    next();
  } catch (err) {
    console.error('Initialization error:', err);
    res.status(500).json({ error: 'Server initialization failed' });
  }
});

// API routes
app.use('/api/employees', employeesRouter);
app.use('/api/timesheet', timesheetRouter);
app.use('/api/download', downloadRouter);
app.use('/api/admin', adminRouter);

export default app;
