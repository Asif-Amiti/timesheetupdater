import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { timesheetRouter } from './routes/timesheet';
import { downloadRouter } from './routes/download';
import { employeesRouter } from './routes/employees';
import { adminRouter } from './routes/admin';
import { initDataStore, saveHolidays, loadEmployees, saveEmployeesExcelRaw } from './services/dataStore';
import { isBlobEnabled, blobExists, inputBlobExists } from './services/blobStore';

dotenv.config();

async function start() {
  // Initialize data store (blob or local)
  await initDataStore();

  // Seed data: copy bundled data to storage if not present
  const bundledDataDir = path.join(__dirname, '../data');

  if (isBlobEnabled()) {
    // Seed to blob storage if MBRDI_TIMESHEET_PORTAL_INPUT.XLSX doesn't exist there yet
    const exists = await inputBlobExists('MBRDI_TIMESHEET_PORTAL_INPUT.XLSX');
    if (!exists) {
      // Seed employees from bundled XLSX or JSON
      const xlsxSrc = path.join(bundledDataDir, 'MBRDI_TIMESHEET_PORTAL_INPUT.XLSX');
      if (fs.existsSync(xlsxSrc)) {
        const buffer = fs.readFileSync(xlsxSrc);
        await saveEmployeesExcelRaw(buffer);
        console.log('Seeded MBRDI_TIMESHEET_PORTAL_INPUT.XLSX to blob storage');
      }
      // Seed holidays
      const holSrc = path.join(bundledDataDir, 'holidays.json');
      if (fs.existsSync(holSrc)) {
        const data = JSON.parse(fs.readFileSync(holSrc, 'utf-8'));
        await saveHolidays(data);
        console.log('Seeded holidays.json to blob storage');
      }
      // Seed timesheets
      const srcTimesheets = path.join(bundledDataDir, 'timesheets');
      if (fs.existsSync(srcTimesheets)) {
        const { saveMonthData } = await import('./services/dataStore');
        for (const f of fs.readdirSync(srcTimesheets)) {
          const data = JSON.parse(fs.readFileSync(path.join(srcTimesheets, f), 'utf-8'));
          const monthKey = f.replace('.json', '');
          await saveMonthData(monthKey, data);
        }
        console.log('Seeded timesheets to blob storage');
      }
    }
  } else {
    // Local filesystem seeding (existing behavior)
    const dataDir = process.env.DATA_DIR || path.join(__dirname, '../data');
    if (dataDir !== bundledDataDir) {
      if (!fs.existsSync(path.join(dataDir, 'MBRDI_TIMESHEET_PORTAL_INPUT.XLSX')) && !fs.existsSync(path.join(dataDir, 'employees.json'))) {
        fs.mkdirSync(dataDir, { recursive: true });
        for (const file of ['employees.json', 'holidays.json']) {
          const src = path.join(bundledDataDir, file);
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(dataDir, file));
            console.log(`Seeded ${file} to ${dataDir}`);
          }
        }
        const srcTimesheets = path.join(bundledDataDir, 'timesheets');
        const destTimesheets = path.join(dataDir, 'timesheets');
        if (fs.existsSync(srcTimesheets)) {
          fs.mkdirSync(destTimesheets, { recursive: true });
          for (const f of fs.readdirSync(srcTimesheets)) {
            fs.copyFileSync(path.join(srcTimesheets, f), path.join(destTimesheets, f));
          }
          console.log(`Seeded timesheets to ${destTimesheets}`);
        }
      }
    }
  }

  const app = express();
  const PORT = process.env.PORT || 3001;

  app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
  }));
  app.use(express.json());

  // API routes (no auth required)
  app.use('/api/employees', employeesRouter);
  app.use('/api/timesheet', timesheetRouter);
  app.use('/api/download', downloadRouter);
  app.use('/api/admin', adminRouter);

  // Serve React static files in production
  const clientBuildPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientBuildPath, 'index.html'));
    }
  });

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default {};
