import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { loadEmployees, loadEmployeesForMonth, loadMonthData, addEmployeeOverride, deleteEmployeeOverride, saveEmployeesExcelRaw, saveHolidays, validateInputHeaders, importTimesheetsFromWorkbook, Employee } from '../services/dataStore';

export const adminRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Wrap multer to catch busboy/multipart errors gracefully
function handleUpload(fieldName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    upload.single(fieldName)(req, res, (err: any) => {
      if (err) {
        console.error('Upload middleware error:', err.message);
        res.status(400).json({ error: `Upload error: ${err.message}` });
        return;
      }
      next();
    });
  };
}

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin';

// Simple admin auth middleware (checks Authorization header with base64)
function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
  const [user, pass] = decoded.split(':');
  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    next();
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
}

// Login endpoint - validates credentials
adminRouter.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Upload Excel to update employee metadata (MBRDI_TIMESHEET_PORTAL_INPUT.XLSX)
adminRouter.post('/upload-employees', adminAuth, handleUpload('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      res.status(400).json({ error: 'No worksheet found in uploaded file' });
      return;
    }

    // Validate expected columns
    const validation = validateInputHeaders(workbook);
    if (!validation.valid) {
      res.status(400).json({
        error: `Missing required columns: ${validation.missing.join(', ')}. Expected: Emp Id, Emp Name, Emp Client ID, Fractal Email ID, Client email ID, Allocation Start Date, Allocation End Date, Alloc %`
      });
      return;
    }

    // Store the raw uploaded Excel as MBRDI_TIMESHEET_PORTAL_INPUT.XLSX
    await saveEmployeesExcelRaw(req.file.buffer);

    // Import timesheet data from month sheets (e.g., May'26, Jun'26)
    const importedMonths = await importTimesheetsFromWorkbook(workbook);

    // Count employees for response
    const employees = await loadEmployees();
    const monthInfo = importedMonths.length > 0 ? ` Imported timesheet data for: ${importedMonths.join(', ')}.` : '';
    res.json({ message: `Successfully uploaded MBRDI_TIMESHEET_PORTAL_INPUT.XLSX with ${employees.length} employees.${monthInfo}`, count: employees.length, importedMonths });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to process uploaded file' });
  }
});

// Get current employees list (for admin view)
// Accepts optional ?month=YYYY-MM query param to scope to a specific month's sheet
adminRouter.get('/employees', adminAuth, async (req: Request, res: Response) => {
  const month = req.query.month as string | undefined;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const employees = await loadEmployeesForMonth(month);
    res.json(employees);
  } else {
    const employees = await loadEmployees();
    res.json(employees);
  }
});

// Add or update an employee
adminRouter.post('/employees', adminAuth, async (req: Request, res: Response) => {
  const { empId, empName, empClientId, email, clientEmail, allocationStartDate, allocationEndDate, allocationPercent } = req.body;
  const missing: string[] = [];
  if (!empId) missing.push('Emp Id');
  if (!empName) missing.push('Emp Name');
  if (!email) missing.push('Fractal Email ID');
  if (!allocationStartDate) missing.push('Allocation Start Date');
  if (!allocationEndDate) missing.push('Allocation End Date');
  if (allocationPercent == null || allocationPercent === '') missing.push('Alloc %');
  if (missing.length > 0) {
    res.status(400).json({ error: `Required fields missing: ${missing.join(', ')}` });
    return;
  }
  const newEmp: Employee = {
    empId, empName,
    empClientId: empClientId || '',
    email: email || '',
    clientEmail: clientEmail || '',
    allocationStartDate: allocationStartDate || '',
    allocationEndDate: allocationEndDate || '',
    allocationPercent: allocationPercent || 100,
  };
  // addEmployeeOverride handles both new and existing (upsert)
  await addEmployeeOverride(newEmp);
  res.json({ message: 'Employee saved', employee: newEmp });
});

// Delete an employee
adminRouter.delete('/employees/:empId', adminAuth, async (req: Request, res: Response) => {
  const { empId } = req.params;
  const employees = await loadEmployees();
  if (!employees.find(e => e.empId === empId)) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }
  await deleteEmployeeOverride(empId);
  res.json({ message: 'Employee deleted' });
});

// Get timesheet fill status for a given month
adminRouter.get('/timesheet-status/:month', adminAuth, async (req: Request, res: Response) => {
  const { month } = req.params;
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: 'Invalid month format. Use YYYY-MM' });
    return;
  }
  const employees = await loadEmployeesForMonth(month);
  const monthData = await loadMonthData(month);

  const statuses: {
    empId: string; empName: string; filled: boolean;
    updatedTracker: boolean; updatedClient: boolean; updatedWorkday: boolean;
  }[] = [];

  for (const emp of employees) {
    const entry = monthData.entries[emp.empId];
    const updatedTracker = entry?.updatedTracker ?? false;
    const updatedClient = entry?.updatedClient ?? false;
    const updatedWorkday = entry?.updatedWorkday ?? false;
    const filled = updatedTracker && updatedClient && updatedWorkday;
    statuses.push({ empId: emp.empId, empName: emp.empName, filled, updatedTracker, updatedClient, updatedWorkday });
  }

  const filledCount = statuses.filter(s => s.filled).length;
  const pendingCount = statuses.length - filledCount;

  res.json({ month, totalEmployees: employees.length, filledCount, pendingCount, statuses });
});

// Download timesheet status as Excel
adminRouter.get('/timesheet-status/:month/download', adminAuth, async (req: Request, res: Response) => {
  const { month } = req.params;
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: 'Invalid month format. Use YYYY-MM' });
    return;
  }
  const employees = await loadEmployeesForMonth(month);
  const monthData = await loadMonthData(month);

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Timesheet Status');

  ws.columns = [
    { header: 'Emp Id', key: 'empId', width: 12 },
    { header: 'Emp Name', key: 'empName', width: 25 },
    { header: 'Updated Tracker', key: 'updatedTracker', width: 18 },
    { header: 'Updated Client Timesheet', key: 'updatedClient', width: 26 },
    { header: 'Updated Workday', key: 'updatedWorkday', width: 18 },
    { header: 'Filled', key: 'filled', width: 10 },
  ];

  for (const emp of employees) {
    const entry = monthData.entries[emp.empId];
    const updatedTracker = entry?.updatedTracker ?? false;
    const updatedClient = entry?.updatedClient ?? false;
    const updatedWorkday = entry?.updatedWorkday ?? false;
    const filled = updatedTracker && updatedClient && updatedWorkday;
    ws.addRow({
      empId: emp.empId,
      empName: emp.empName,
      updatedTracker: updatedTracker ? 'Yes' : 'No',
      updatedClient: updatedClient ? 'Yes' : 'No',
      updatedWorkday: updatedWorkday ? 'Yes' : 'No',
      filled: filled ? 'Yes' : 'No',
    });
  }

  // Style header
  ws.getRow(1).font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=Timesheet_Status_${month}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
});

// Upload holidays Excel
adminRouter.post('/upload-holidays', adminAuth, handleUpload('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      res.status(400).json({ error: 'No worksheet found' });
      return;
    }

    const holidays: { [month: string]: number[] } = {};

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header
      const month = String(row.getCell(1).value || '').trim(); // e.g. "2026-01"
      const day = Number(row.getCell(2).value);
      if (/^\d{4}-\d{2}$/.test(month) && day >= 1 && day <= 31) {
        if (!holidays[month]) holidays[month] = [];
        holidays[month].push(day);
      }
    });

    await saveHolidays(holidays);

    res.json({ message: 'Holidays updated successfully', holidays });
  } catch (err) {
    console.error('Holiday upload error:', err);
    res.status(500).json({ error: 'Failed to process holidays file' });
  }
});
