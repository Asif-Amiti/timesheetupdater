import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';

const EXCEL_PATH = path.join(__dirname, '../../../MBRDI leave tracker- 2026.xlsx');
const DATA_DIR = path.join(__dirname, '../../data');

interface Employee {
  empId: string;
  empName: string;
  email: string;
  allocationPercent: number;
}

async function seedEmployees() {
  console.log('Reading Excel file:', EXCEL_PATH);

  if (!fs.existsSync(EXCEL_PATH)) {
    console.error('Excel file not found at:', EXCEL_PATH);
    process.exit(1);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_PATH);

  const employees: Map<string, Employee> = new Map();

  // Parse from monthly sheets to collect all employees
  const monthSheets = ["Jan'26", "Feb'26", "Mar'26", "Apr'26", "May 26", "Jun 26"];

  for (const sheetName of monthSheets) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) continue;

    // Data starts at row 5 (rows 1-4 are headers)
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber < 5) return;

      const empId = String(row.getCell(2).value || '').trim();
      const empName = String(row.getCell(3).value || '').trim();
      const email = String(row.getCell(5).value || '').trim();

      if (empId && empId.startsWith('F') && empName) {
        if (!employees.has(empId)) {
          employees.set(empId, {
            empId,
            empName,
            email: email || `${empName.toLowerCase().replace(/\s+/g, '.')}@fractal.ai`,
            allocationPercent: 100
          });
        }
        // Update email if found in a later sheet
        if (email && !employees.get(empId)!.email.includes('@')) {
          employees.get(empId)!.email = email;
        }
      }
    });
  }

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const timesheetsDir = path.join(DATA_DIR, 'timesheets');
  if (!fs.existsSync(timesheetsDir)) {
    fs.mkdirSync(timesheetsDir, { recursive: true });
  }

  // Save employees
  const employeeList = Array.from(employees.values()).sort((a, b) => a.empName.localeCompare(b.empName));
  const employeesPath = path.join(DATA_DIR, 'employees.json');
  fs.writeFileSync(employeesPath, JSON.stringify(employeeList, null, 2));
  console.log(`Saved ${employeeList.length} employees to ${employeesPath}`);

  // Also seed existing timesheet data from the Excel
  const monthCodes: { [key: string]: string } = {
    "Jan'26": "2026-01",
    "Feb'26": "2026-02",
    "Mar'26": "2026-03",
    "Apr'26": "2026-04",
    "May 26": "2026-05",
    "Jun 26": "2026-06"
  };

  for (const sheetName of monthSheets) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) continue;

    const monthKey = monthCodes[sheetName];
    if (!monthKey) continue;

    const monthData: any = { month: monthKey, entries: {} };

    // Find where day columns start (column 22 onwards typically)
    // Row 3 has dates in the format "2026-01-01 00:00:00"
    const dateRow = sheet.getRow(3);
    let dayStartCol = -1;
    const dayColumns: { [col: number]: number } = {}; // col -> day number

    for (let col = 1; col <= sheet.columnCount; col++) {
      const cellVal = String(dateRow.getCell(col).value || '');
      const dateMatch = cellVal.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (dateMatch && dateMatch[2] === monthKey.split('-')[1]) {
        const dayNum = parseInt(dateMatch[3]);
        dayColumns[col] = dayNum;
        if (dayStartCol === -1) dayStartCol = col;
      }
    }

    // Parse employee rows (starting from row 5)
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber < 5) return;

      const empId = String(row.getCell(2).value || '').trim();
      if (!empId || !empId.startsWith('F')) return;

      const empName = String(row.getCell(3).value || '').trim();
      const reason = String(row.getCell(18).value || '').trim();

      // Read update flags
      const updatedTracker = String(row.getCell(19).value || '').toLowerCase() === 'yes';
      const updatedClient = String(row.getCell(20).value || '').toLowerCase() === 'yes';
      const updatedWorkday = String(row.getCell(21).value || '').toLowerCase() === 'yes';

      // Read days
      const days: { [key: string]: string } = {};
      for (const [colStr, dayNum] of Object.entries(dayColumns)) {
        const col = parseInt(colStr);
        const cellVal = String(row.getCell(col).value || '').trim().toUpperCase();
        if (cellVal === 'H' || cellVal === 'L' || cellVal === 'NB' || cellVal === 'HDL') {
          days[String(dayNum)] = cellVal;
        } else {
          days[String(dayNum)] = '';
        }
      }

      monthData.entries[empId] = {
        empId,
        empName,
        days,
        reason,
        updatedTracker,
        updatedClient,
        updatedWorkday,
        lastModified: new Date().toISOString()
      };
    });

    const monthPath = path.join(timesheetsDir, `${monthKey}.json`);
    fs.writeFileSync(monthPath, JSON.stringify(monthData, null, 2));
    console.log(`Saved ${Object.keys(monthData.entries).length} entries for ${monthKey}`);
  }

  // Create holidays.json (Indian public holidays for 2026)
  const holidays: { [month: string]: number[] } = {
    "2026-01": [1, 15, 26],       // New Year, Pongal/Sankranti, Republic Day
    "2026-02": [],
    "2026-03": [19, 20],          // Holi
    "2026-04": [2, 10, 14],       // Ram Navami, Good Friday, Ambedkar Jayanti
    "2026-05": [1],               // May Day
    "2026-06": [],
    "2026-07": [7],               // Eid ul-Adha (approximate)
    "2026-08": [15, 26],          // Independence Day, Janmashtami
    "2026-09": [],
    "2026-10": [2, 20, 21],       // Gandhi Jayanti, Dussehra
    "2026-11": [4, 9],            // Diwali, Guru Nanak Jayanti
    "2026-12": [25]               // Christmas
  };
  fs.writeFileSync(path.join(DATA_DIR, 'holidays.json'), JSON.stringify(holidays, null, 2));
  console.log('Created holidays.json');

  console.log('\nSeed complete!');
}

seedEmployees().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
