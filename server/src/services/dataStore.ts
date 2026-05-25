import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import {
  isBlobEnabled, readBlob, writeBlob, ensureContainer,
  readInputBlobBuffer, writeInputBlobBuffer, readOutputBlob, writeOutputBlob,
  inputBlobExists, listOutputBlobs
} from './blobStore';

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');

export function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const timesheetsDir = path.join(DATA_DIR, 'timesheets');
  if (!fs.existsSync(timesheetsDir)) {
    fs.mkdirSync(timesheetsDir, { recursive: true });
  }
}

export function getDataDir(): string {
  return DATA_DIR;
}

export function getTimesheetsDir(): string {
  return path.join(DATA_DIR, 'timesheets');
}

export interface Employee {
  empId: string;
  empName: string;
  empClientId: string;
  email: string;
  clientEmail: string;
  allocationStartDate: string;
  allocationEndDate: string;
  allocationPercent: number;
}

export interface DayEntry {
  [day: string]: string; // "1": "H", "2": "", "3": "L", etc.
}

export interface TimesheetEntry {
  empId: string;
  empName: string;
  days: DayEntry;
  reason: string;
  updatedTracker: boolean;
  updatedClient: boolean;
  updatedWorkday: boolean;
  lastModified: string;
}

export interface MonthData {
  month: string;
  entries: { [empId: string]: TimesheetEntry };
}

// --- Initialization ---
export async function initDataStore(): Promise<void> {
  if (isBlobEnabled()) {
    try {
      await ensureContainer();
      console.log('Data store: Azure Blob Storage');
    } catch (err) {
      console.error('Failed to connect to Azure Blob Storage:', err);
      throw err;
    }
  } else {
    ensureDataDir();
    console.log('Data store: Local filesystem');
  }
}

const EMPLOYEES_BLOB = 'MBRDI_TIMESHEET_PORTAL_INPUT.XLSX';
const EMPLOYEES_XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Expected header columns in the input Excel
const INPUT_HEADERS = [
  'Emp Id', 'Emp Name', 'Emp Client ID', 'Fractal Email ID', 'Client email ID',
  'Allocation Start Date', 'Allocation End Date', 'Alloc %', 'Allocated Days',
  'Billed Days for current month', 'Adj for past month', 'Revenue cnf days',
  'Timesheet days', 'Diff', 'Unbilled Days', 'Total Leave Days',
];

// Max columns to scan for headers (avoids out-of-bounds on sheets with large cellCount)
const MAX_HEADER_COLS = 50;

// Find the worksheet that contains employee data (has 'Emp Id' header)
// Uses the FIRST matching sheet (master employee list) since later sheets are month-specific
function findDataSheet(workbook: ExcelJS.Workbook): { worksheet: ExcelJS.Worksheet; headerRow: number } | null {
  for (const ws of workbook.worksheets) {
    const headerRow = findHeaderRow(ws);
    if (headerRow) return { worksheet: ws, headerRow };
  }
  return null;
}

// Find the header row by looking for 'Emp Id'
function findHeaderRow(worksheet: ExcelJS.Worksheet): number {
  let headerRowNum = 0;
  worksheet.eachRow((row, rowNumber) => {
    if (headerRowNum) return;
    const limit = Math.min(row.cellCount || 0, MAX_HEADER_COLS);
    for (let c = 1; c <= limit; c++) {
      const val = String(row.getCell(c).value || '').trim();
      if (val === 'Emp Id') { headerRowNum = rowNumber; return; }
    }
  });
  return headerRowNum;
}

// Format cell value — handles Date objects and formula results
function cellStr(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return '';
  if (v instanceof Date) {
    // Format date as YYYY-MM-DD
    return v.toISOString().split('T')[0];
  }
  if (typeof v === 'object' && 'result' in v) {
    // Formula cell — use the cached result
    const r = (v as any).result;
    if (r instanceof Date) return r.toISOString().split('T')[0];
    return String(r ?? '');
  }
  return String(v).trim();
}

// Parse employees from a single worksheet given its header row
function parseEmployeesFromSheet(worksheet: ExcelJS.Worksheet, headerRowNum: number): Employee[] {
  const headerRow = worksheet.getRow(headerRowNum);
  const colMap: { [key: string]: number } = {};
  const colLimit = Math.min(headerRow.cellCount || 0, MAX_HEADER_COLS);
  for (let c = 1; c <= colLimit; c++) {
    const val = String(headerRow.getCell(c).value || '').trim();
    if (val) colMap[val] = c;
  }

  const employees: Employee[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNum) return;
    const empIdCol = colMap['Emp Id'];
    if (!empIdCol) return;
    const empId = cellStr(row.getCell(empIdCol));
    const empName = cellStr(row.getCell(colMap['Emp Name'] || empIdCol + 1));
    if (!empId || !empName) return;
    // Skip rows where empId is just a number (formula helper rows)
    if (/^\d+$/.test(empId)) return;
    const empClientId = colMap['Emp Client ID'] ? cellStr(row.getCell(colMap['Emp Client ID'])) : '';
    const email = colMap['Fractal Email ID'] ? cellStr(row.getCell(colMap['Fractal Email ID'])) : '';
    const clientEmail = colMap['Client email ID'] ? cellStr(row.getCell(colMap['Client email ID'])) : '';
    const allocationStartDate = colMap['Allocation Start Date'] ? cellStr(row.getCell(colMap['Allocation Start Date'])) : '';
    const allocationEndDate = colMap['Allocation End Date'] ? cellStr(row.getCell(colMap['Allocation End Date'])) : '';
    const allocRaw = colMap['Alloc %'] ? row.getCell(colMap['Alloc %']).value : 100;
    const allocationPercent = typeof allocRaw === 'number' ? allocRaw : parseInt(String(allocRaw || '100')) || 100;
    employees.push({ empId, empName, empClientId, email, clientEmail, allocationStartDate, allocationEndDate, allocationPercent });
  });
  return employees;
}

// Parse employees from an ExcelJS workbook
// Scans ALL sheets with 'Emp Id' header to build the union of employees
// Later sheets take priority for duplicate empIds (more recent allocation data)
function parseEmployeesFromWorkbook(workbook: ExcelJS.Workbook): Employee[] {
  const employeeMap: { [empId: string]: Employee } = {};

  for (const ws of workbook.worksheets) {
    const headerRowNum = findHeaderRow(ws);
    if (!headerRowNum) continue;
    const sheetEmployees = parseEmployeesFromSheet(ws, headerRowNum);
    for (const emp of sheetEmployees) {
      employeeMap[emp.empId] = emp; // Later sheet overwrites earlier
    }
  }

  return Object.values(employeeMap);
}

// Validate that uploaded workbook has expected headers
export function validateInputHeaders(workbook: ExcelJS.Workbook): { valid: boolean; missing: string[] } {
  const found = findDataSheet(workbook);
  if (!found) return { valid: false, missing: ['No worksheet with "Emp Id" header found'] };
  const headerRow = found.worksheet.getRow(found.headerRow);
  const foundHeaders = new Set<string>();
  const vLimit = Math.min(headerRow.cellCount || 0, MAX_HEADER_COLS);
  for (let c = 1; c <= vLimit; c++) {
    foundHeaders.add(String(headerRow.getCell(c).value || '').trim());
  }
  const required = ['Emp Id', 'Emp Name'];
  const missing = required.filter(h => !foundHeaders.has(h));
  return { valid: missing.length === 0, missing };
}

// --- Employee Overrides ---
// Overrides track manual additions and deletions without modifying the input Excel
interface EmployeeOverrides {
  added: Employee[];    // Employees added via admin UI
  deleted: string[];    // empIds removed via admin UI
}

const OVERRIDES_BLOB = 'employee-overrides.json';
const OVERRIDES_LOCAL = 'employee-overrides.json';

async function loadOverrides(): Promise<EmployeeOverrides> {
  const defaults: EmployeeOverrides = { added: [], deleted: [] };
  if (isBlobEnabled()) {
    const data = await readOutputBlob(OVERRIDES_BLOB);
    if (!data) return defaults;
    return JSON.parse(data);
  } else {
    const filePath = path.join(DATA_DIR, OVERRIDES_LOCAL);
    if (!fs.existsSync(filePath)) return defaults;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
}

async function saveOverrides(overrides: EmployeeOverrides): Promise<void> {
  const json = JSON.stringify(overrides, null, 2);
  if (isBlobEnabled()) {
    await writeOutputBlob(OVERRIDES_BLOB, json);
  } else {
    fs.writeFileSync(path.join(DATA_DIR, OVERRIDES_LOCAL), json, 'utf-8');
  }
}

// --- Employees ---
// Loads base employees from input Excel, then applies overrides (adds/deletes)
export async function loadEmployees(): Promise<Employee[]> {
  let baseEmployees: Employee[] = [];

  if (isBlobEnabled()) {
    const buf = await readInputBlobBuffer(EMPLOYEES_BLOB);
    if (buf) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buf as any);
      baseEmployees = parseEmployeesFromWorkbook(workbook);
    }
  } else {
    const xlsxPath = path.join(DATA_DIR, EMPLOYEES_BLOB);
    if (fs.existsSync(xlsxPath)) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(xlsxPath);
      baseEmployees = parseEmployeesFromWorkbook(workbook);
    } else {
      // Legacy JSON fallback
      const jsonPath = path.join(DATA_DIR, 'employees.json');
      if (fs.existsSync(jsonPath)) {
        baseEmployees = (JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as any[]).map((e: any) => ({
          empId: e.empId || '', empName: e.empName || '', empClientId: e.empClientId || '',
          email: e.email || '', clientEmail: e.clientEmail || '',
          allocationStartDate: e.allocationStartDate || '', allocationEndDate: e.allocationEndDate || '',
          allocationPercent: e.allocationPercent || 100,
        }));
      }
    }
  }

  // Apply overrides
  const overrides = await loadOverrides();
  // Remove deleted employees
  let employees = baseEmployees.filter(e => !overrides.deleted.includes(e.empId));
  // Add manually added employees (avoid duplicates)
  const existingIds = new Set(employees.map(e => e.empId));
  for (const added of overrides.added) {
    if (!existingIds.has(added.empId)) {
      employees.push(added);
    }
  }

  return employees.sort((a, b) => a.empName.localeCompare(b.empName, undefined, { numeric: true, sensitivity: 'base' }));
}

// Add a new employee (stores in overrides, does NOT modify input Excel)
export async function addEmployeeOverride(emp: Employee): Promise<void> {
  const overrides = await loadOverrides();
  // If this employee was previously deleted, un-delete them
  overrides.deleted = overrides.deleted.filter(id => id !== emp.empId);
  // Add to overrides (replace if already in added list)
  overrides.added = overrides.added.filter(e => e.empId !== emp.empId);
  overrides.added.push(emp);
  await saveOverrides(overrides);
}

// Delete an employee (stores in overrides, does NOT modify input Excel)
// Also removes their timesheet entries so re-adding starts fresh
export async function deleteEmployeeOverride(empId: string): Promise<void> {
  const overrides = await loadOverrides();
  // If it was manually added, just remove from added list
  const wasAdded = overrides.added.find(e => e.empId === empId);
  if (wasAdded) {
    overrides.added = overrides.added.filter(e => e.empId !== empId);
  } else {
    // It came from the input Excel — mark as deleted
    if (!overrides.deleted.includes(empId)) {
      overrides.deleted.push(empId);
    }
  }
  await saveOverrides(overrides);

  // Clean up timesheet data for this employee across all months
  if (isBlobEnabled()) {
    const blobs = await listOutputBlobs('timesheets/');
    for (const blobName of blobs) {
      if (!blobName.endsWith('.json')) continue;
      const data = await readBlob(blobName);
      if (!data) continue;
      const monthData: MonthData = JSON.parse(data);
      if (monthData.entries[empId]) {
        delete monthData.entries[empId];
        await writeBlob(blobName, JSON.stringify(monthData, null, 2));
      }
    }
  } else {
    const timesheetsDir = path.join(DATA_DIR, 'timesheets');
    if (fs.existsSync(timesheetsDir)) {
      for (const file of fs.readdirSync(timesheetsDir)) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(timesheetsDir, file);
        const monthData: MonthData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (monthData.entries[empId]) {
          delete monthData.entries[empId];
          fs.writeFileSync(filePath, JSON.stringify(monthData, null, 2), 'utf-8');
        }
      }
    }
  }
}

// Save raw uploaded Excel directly to input container (admin bulk upload)
export async function saveEmployeesExcelRaw(buffer: Buffer): Promise<void> {
  // Load existing overrides before saving new Excel
  const oldOverrides = await loadOverrides();

  if (isBlobEnabled()) {
    await writeInputBlobBuffer(EMPLOYEES_BLOB, buffer, EMPLOYEES_XLSX_CONTENT_TYPE);
  } else {
    const xlsxPath = path.join(DATA_DIR, EMPLOYEES_BLOB);
    fs.writeFileSync(xlsxPath, buffer);
  }

  // Parse new Excel to see which employees are now in it
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const newExcelEmployees = parseEmployeesFromWorkbook(workbook);
  const newExcelIds = new Set(newExcelEmployees.map(e => e.empId));

  // Keep manually-added employees that are NOT in the new Excel
  // (if they're now in the Excel, the override is no longer needed)
  const preservedAdded = oldOverrides.added.filter(e => !newExcelIds.has(e.empId));

  // Clear deleted list (new Excel is the source of truth)
  await saveOverrides({ added: preservedAdded, deleted: [] });
}

// Legacy saveEmployees — kept for backward compat but now uses overrides
export async function saveEmployees(employees: Employee[]): Promise<void> {
  // This is now a no-op; use addEmployeeOverride/deleteEmployeeOverride instead
  // Kept to avoid breaking other code paths
}

// Load employees for a specific month from the input Excel's corresponding sheet
// Falls back to full employee list if no sheet matches the month
export async function loadEmployeesForMonth(month: string): Promise<Employee[]> {
  let workbook: ExcelJS.Workbook | null = null;

  if (isBlobEnabled()) {
    const buf = await readInputBlobBuffer(EMPLOYEES_BLOB);
    if (buf) {
      workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buf as any);
    }
  } else {
    const xlsxPath = path.join(DATA_DIR, EMPLOYEES_BLOB);
    if (fs.existsSync(xlsxPath)) {
      workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(xlsxPath);
    }
  }

  if (!workbook) return loadEmployees();

  // Find the sheet that matches the requested month
  for (const ws of workbook.worksheets) {
    const sheetMonth = parseSheetNameToMonth(ws.name);
    if (sheetMonth === month) {
      const headerRowNum = findHeaderRow(ws);
      if (headerRowNum) {
        const employees = parseEmployeesFromSheet(ws, headerRowNum);
        if (employees.length > 0) {
          // Apply overrides (adds/deletes)
          const overrides = await loadOverrides();
          let result = employees.filter(e => !overrides.deleted.includes(e.empId));
          const existingIds = new Set(result.map(e => e.empId));
          for (const added of overrides.added) {
            if (!existingIds.has(added.empId)) {
              result.push(added);
            }
          }
          return result.sort((a, b) => a.empName.localeCompare(b.empName, undefined, { numeric: true, sensitivity: 'base' }));
        }
      }
    }
  }

  // No matching sheet found — fall back to full employee list
  return loadEmployees();
}

// --- Import timesheet data from multi-sheet Excel ---
// Parses sheets named like "May'26", "Jun'26" etc. and extracts day-by-day entries

const MONTH_NAME_MAP: { [key: string]: string } = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function parseSheetNameToMonth(sheetName: string): string | null {
  // Matches patterns like "May'26", "Jun'26", "May 26", "Jun 26"
  // Handles various apostrophe characters: ' ' ' ʼ ʻ and also space as separator
  const normalized = sheetName.trim().replace(/[\u2018\u2019\u2032\u02BC\u02BB]/g, "'");
  const match = normalized.match(/^([A-Za-z]{3})[' ](\d{2})$/);
  if (!match) return null;
  const monthStr = MONTH_NAME_MAP[match[1].toLowerCase()];
  if (!monthStr) return null;
  const year = `20${match[2]}`;
  return `${year}-${monthStr}`;
}

function parseTimesheetFromSheet(worksheet: ExcelJS.Worksheet): { [empId: string]: TimesheetEntry } {
  const entries: { [empId: string]: TimesheetEntry } = {};

  // Find header row (contains "Emp Id")
  const headerRowNum = findHeaderRow(worksheet);
  if (!headerRowNum) return entries;

  const headerRow = worksheet.getRow(headerRowNum);
  const colMap: { [key: string]: number } = {};
  const colLimit = Math.min(headerRow.cellCount || 0, MAX_HEADER_COLS);
  for (let c = 1; c <= colLimit; c++) {
    const val = String(headerRow.getCell(c).value || '').trim();
    if (val) colMap[val] = c;
  }

  // Find day columns (headers that are numbers 1-31)
  const dayColumns: { day: number; col: number }[] = [];
  const totalCols = headerRow.cellCount || 0;
  for (let c = 1; c <= totalCols; c++) {
    const val = String(headerRow.getCell(c).value || '').trim();
    const num = parseInt(val);
    if (num >= 1 && num <= 31 && String(num) === val) {
      dayColumns.push({ day: num, col: c });
    }
  }

  // Find reason and tracker columns
  const reasonCol = colMap['Reason for Non-Billing/Comments'] || 0;

  // Look for tracker columns by partial match
  let trackerCol = 0, clientCol = 0, workdayCol = 0;
  for (let c = 1; c <= totalCols; c++) {
    const val = String(headerRow.getCell(c).value || '').trim().toLowerCase();
    if (val.includes('updated') && val.includes('tracker') && !trackerCol) trackerCol = c;
    else if (val.includes('updated') && val.includes('client') && !clientCol) clientCol = c;
    else if (val.includes('updated') && val.includes('workday') && !workdayCol) workdayCol = c;
  }

  const empIdCol = colMap['Emp Id'];
  const empNameCol = colMap['Emp Name'];
  if (!empIdCol) return entries;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNum) return;
    const empId = cellStr(row.getCell(empIdCol));
    const empName = cellStr(row.getCell(empNameCol || empIdCol + 1));
    if (!empId || !empName) return;
    if (/^\d+$/.test(empId)) return; // Skip serial number rows

    const days: DayEntry = {};
    for (const { day, col } of dayColumns) {
      let val = cellStr(row.getCell(col));
      // Map Excel "1" to app "W" (working)
      if (val === '1') val = 'W';
      // Keep H, L, NB, HDL as-is; empty stays empty
      if (['W', 'H', 'L', 'NB', 'HDL'].includes(val)) {
        days[String(day)] = val;
      } else {
        days[String(day)] = '';
      }
    }

    const reason = reasonCol ? cellStr(row.getCell(reasonCol)) : '';
    // Tracker flags are managed by the app only — never import from Excel
    // The Excel may have stale/incorrect values
    entries[empId] = {
      empId,
      empName,
      days,
      reason,
      updatedTracker: false,
      updatedClient: false,
      updatedWorkday: false,
      lastModified: new Date().toISOString(),
    };
  });

  return entries;
}

// Parse all month sheets from workbook and save as timesheet JSON data
// Only imports entries for employees that DON'T already have data (preserves user-filled entries)
export async function importTimesheetsFromWorkbook(workbook: ExcelJS.Workbook): Promise<string[]> {
  const importedMonths: string[] = [];
  const processedMonths = new Set<string>();

  console.log('Sheets found in workbook:', workbook.worksheets.map(ws => `"${ws.name}"`).join(', '));

  for (const worksheet of workbook.worksheets) {
    const monthKey = parseSheetNameToMonth(worksheet.name);
    if (!monthKey) {
      console.log(`  Skipping sheet "${worksheet.name}" (not a month sheet)`);
      continue;
    }

    // Skip duplicate month sheets (e.g., "Jun'26" and "Jun 26" both map to 2026-06)
    if (processedMonths.has(monthKey)) {
      console.log(`  Skipping sheet "${worksheet.name}" (duplicate for ${monthKey})`);
      continue;
    }

    const entries = parseTimesheetFromSheet(worksheet);
    if (Object.keys(entries).length === 0) continue;

    // Merge: existing user-filled entries take priority over imported data
    const existing = await loadMonthData(monthKey);
    const merged: MonthData = {
      month: monthKey,
      entries: { ...entries, ...existing.entries },
    };
    await saveMonthData(monthKey, merged);
    importedMonths.push(monthKey);
    processedMonths.add(monthKey);
  }

  return importedMonths;
}

// --- Month Data (Timesheets) ---
export async function loadMonthData(month: string): Promise<MonthData> {
  if (isBlobEnabled()) {
    const data = await readBlob(`timesheets/${month}.json`);
    if (!data) return { month, entries: {} };
    return JSON.parse(data);
  } else {
    const filePath = path.join(DATA_DIR, 'timesheets', `${month}.json`);
    if (!fs.existsSync(filePath)) {
      return { month, entries: {} };
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
}

export async function saveMonthData(month: string, data: MonthData): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  if (isBlobEnabled()) {
    await writeBlob(`timesheets/${month}.json`, json);
  } else {
    ensureDataDir();
    const filePath = path.join(DATA_DIR, 'timesheets', `${month}.json`);
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, json, 'utf-8');
    fs.renameSync(tempPath, filePath);
  }
}

// --- Holidays ---
export async function loadHolidays(): Promise<{ [month: string]: number[] }> {
  if (isBlobEnabled()) {
    const data = await readBlob('holidays.json');
    return data ? JSON.parse(data) : {};
  } else {
    const filePath = path.join(DATA_DIR, 'holidays.json');
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
}

export async function saveHolidays(holidays: { [month: string]: number[] }): Promise<void> {
  const json = JSON.stringify(holidays, null, 2);
  if (isBlobEnabled()) {
    await writeBlob('holidays.json', json);
  } else {
    const filePath = path.join(DATA_DIR, 'holidays.json');
    fs.writeFileSync(filePath, json, 'utf-8');
  }
}
