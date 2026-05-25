import ExcelJS from 'exceljs';
import { loadMonthData, loadEmployees, loadHolidays } from './dataStore';

function getDaysInMonth(month: string): number {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m, 0).getDate();
}

function getDayOfWeek(year: number, month: number, day: number): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[new Date(year, month - 1, day).getDay()];
}

function isWeekend(year: number, month: number, day: number): boolean {
  const dow = new Date(year, month - 1, day).getDay();
  return dow === 0 || dow === 6;
}

export async function generateExcel(month: string): Promise<Buffer> {
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr);
  const monthNum = parseInt(monthStr);
  const daysInMonth = getDaysInMonth(month);

  const data = await loadMonthData(month);
  const employees = await loadEmployees();
  const holidays = await loadHolidays();
  const monthHolidays = holidays[month] || [];

  const workbook = new ExcelJS.Workbook();
  // Force Excel to recalculate all formulas when the file is opened
  workbook.calcProperties = { fullCalcOnLoad: true };
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const shortYear = String(year).slice(2);
  const sheetName = `${monthNames[monthNum - 1]}'${shortYear}`;
  const sheet = workbook.addWorksheet(sheetName);

  // Row 1: Section headers (merged in original)
  const row1Data: string[] = new Array(21 + daysInMonth).fill('');
  row1Data[4] = 'To be filled by Ops PMOs only';
  row1Data[17] = '---To be filled by Employees---';
  const row1 = sheet.addRow(row1Data);
  row1.font = { bold: true, size: 10 };

  // Row 2: Legend + day names + tracker column headers
  const row2Data: string[] = new Array(21 + daysInMonth).fill('');
  row2Data[1] = '1=Working Day';
  row2Data[17] = 'Reason for Non-Billing/Comments';
  row2Data[18] = "Emp to mark 'Yes' when updated this tracker";
  row2Data[19] = "Emp to mark 'Yes' when updated the Client timesheet as per this sheet";
  row2Data[20] = "Emp to mark 'Yes' when updated the Workday as per this sheet";
  for (let d = 1; d <= daysInMonth; d++) {
    row2Data[20 + d] = getDayOfWeek(year, monthNum, d);
  }
  const row2 = sheet.addRow(row2Data);
  row2.font = { bold: true, size: 10, color: { argb: 'FFFF0000' } };

  // Row 3: Column headers
  const row3Data: string[] = [
    '',               // A (S.No)
    'Emp Id',         // B
    'Emp Name',       // C
    'Emp Client ID',  // D
    'Fractal Email ID', // E
    'Client email ID',  // F
    'Allocation Start Date', // G
    'Allocation End Date',   // H
    'Alloc %',        // I
    'Allocated Days',  // J
    'Billed Days for current month', // K
    'Adj for past month', // L
    'Revenue cnf days',   // M
    'Timesheet days',     // N
    'Diff',               // O
    'Unbilled Days',      // P
    'Total Leave Days',   // Q
    'Reason for Non-Billing/Comments', // R
    'Updated Tracker',              // S
    'Updated Client Timesheet',     // T
    'Updated Workday',              // U
  ];
  for (let d = 1; d <= daysInMonth; d++) {
    row3Data.push(String(d));
  }
  const row3 = sheet.addRow(row3Data);
  row3.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  row3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

  // Data rows
  let sno = 1;
  for (const emp of employees) {
    const entry = data.entries[emp.empId];
    const days = entry?.days || {};

    // Calculate stats using Excel formulas
    // Row number in the sheet (3 header rows + data row index)
    const rowNum = sno + 3; // sno starts at 1, header rows are 1-3, so data starts at row 4
    // Day columns: V (col 22) to last day column
    const lastDayCol = String.fromCharCode(85 + daysInMonth); // U=85, so V=86 is col 22 for day 1
    // For columns beyond Z, we need AA, AB, etc.
    function colLetter(colNum: number): string {
      let s = '';
      while (colNum > 0) {
        colNum--;
        s = String.fromCharCode(65 + (colNum % 26)) + s;
        colNum = Math.floor(colNum / 26);
      }
      return s;
    }
    const firstDayColLetter = colLetter(22); // V
    const lastDayColLetter = colLetter(21 + daysInMonth);

    // Count allocated working days (non-weekend, non-holiday)
    let allocatedDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      if (!isWeekend(year, monthNum, d) && !monthHolidays.includes(d)) {
        allocatedDays++;
      }
    }

    const allocationStart = `${year}-${monthStr}-01`;
    const allocationEnd = `${year}-${monthStr}-${String(daysInMonth).padStart(2, '0')}`;

    // Compute actual values from day data
    let leaveCount = 0;
    let timesheetDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const val = days[String(d)] || '';
      if (val === 'L') leaveCount++;
      if (val === 'HDL') leaveCount += 0.5;
      if (val === '1' || val === 'W' || (!val && !isWeekend(year, monthNum, d) && !monthHolidays.includes(d))) {
        timesheetDays++;
      }
    }
    const billedDays = allocatedDays - leaveCount;
    const revCnfDays = billedDays;
    const diff = billedDays - timesheetDays;
    const unbilledDays = leaveCount;

    // Leaves formula: =COUNTIF(V4:AZ4,"L")+COUNTIF(V4:AZ4,"HDL")/2
    const leavesFormula = `COUNTIF(${firstDayColLetter}${rowNum}:${lastDayColLetter}${rowNum},"L")+COUNTIF(${firstDayColLetter}${rowNum}:${lastDayColLetter}${rowNum},"HDL")/2`;
    // Billed Days = Allocated Days - Leaves => =J4-Q4
    const billedFormula = `J${rowNum}-Q${rowNum}`;
    // Revenue cnf days = Billed Days => =K4
    const revCnfFormula = `K${rowNum}`;
    // Timesheet days = COUNTIF of "1" in day columns
    const timesheetFormula = `COUNTIF(${firstDayColLetter}${rowNum}:${lastDayColLetter}${rowNum},"1")`;
    // Diff = Billed - Timesheet => =K4-N4
    const diffFormula = `K${rowNum}-N${rowNum}`;
    // Unbilled Days = Leaves => =Q4
    const unbilledFormula = `Q${rowNum}`;

    const row: (string | number)[] = [
      sno++,                                // A - S.No
      emp.empId,                            // B - Emp Id
      emp.empName,                          // C - Emp Name
      emp.empClientId || '',                 // D - Emp Client ID
      emp.email,                            // E - Fractal Email ID
      emp.clientEmail || '',                // F - Client email ID
      allocationStart,                      // G - Allocation Start Date
      allocationEnd,                        // H - Allocation End Date
      emp.allocationPercent || 100,         // I - Alloc %
      allocatedDays,                        // J - Allocated Days
      billedDays,                           // K - Billed Days (placeholder, formula set below)
      0,                                    // L - Adj for past month
      revCnfDays,                           // M - Revenue cnf days (placeholder)
      timesheetDays,                        // N - Timesheet days (placeholder)
      diff,                                 // O - Diff (placeholder)
      unbilledDays,                         // P - Unbilled Days (placeholder)
      leaveCount,                           // Q - Total Leave Days (placeholder)
      entry?.reason || '',                  // R - Reason for Non-Billing/Comments
      entry?.updatedTracker ? 'Yes' : 'No', // S - Updated Tracker
      entry?.updatedClient ? 'Yes' : 'No',  // T - Updated Client Timesheet
      entry?.updatedWorkday ? 'Yes' : 'No', // U - Updated Workday
    ];

    // Day columns (V onwards)
    for (let d = 1; d <= daysInMonth; d++) {
      const val = days[String(d)] || '';
      if (isWeekend(year, monthNum, d) && (!val || val === 'W')) {
        row.push('');
      } else if (val === 'W' || (!val && !isWeekend(year, monthNum, d) && !monthHolidays.includes(d))) {
        row.push('1');
      } else if (!val && monthHolidays.includes(d)) {
        row.push('H');
      } else {
        row.push(val);
      }
    }

    const dataRow = sheet.addRow(row);

    // Set formulas on computed columns (after addRow so ExcelJS handles them correctly)
    dataRow.getCell(11).value = { formula: billedFormula, result: billedDays };       // K
    dataRow.getCell(13).value = { formula: revCnfFormula, result: revCnfDays };       // M
    dataRow.getCell(14).value = { formula: timesheetFormula, result: timesheetDays }; // N
    dataRow.getCell(15).value = { formula: diffFormula, result: diff };               // O
    dataRow.getCell(16).value = { formula: unbilledFormula, result: unbilledDays };   // P
    dataRow.getCell(17).value = { formula: leavesFormula, result: leaveCount };       // Q

    // Highlight holidays, leaves, weekends in day columns
    for (let d = 1; d <= daysInMonth; d++) {
      const colIdx = 21 + d; // 21 fixed columns + day offset
      const cell = dataRow.getCell(colIdx);
      const val = days[String(d)] || '';
      if (val === 'H' || monthHolidays.includes(d)) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };
      } else if (val === 'L' || val === 'HDL') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6B6B' } };
      } else if (val === 'NB') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
      } else if (isWeekend(year, monthNum, d)) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
      }
    }
  }

  // Column widths
  sheet.getColumn(1).width = 5;   // S.No
  sheet.getColumn(2).width = 10;  // Emp Id
  sheet.getColumn(3).width = 25;  // Emp Name
  sheet.getColumn(4).width = 14;  // Emp Client ID
  sheet.getColumn(5).width = 30;  // Fractal Email ID
  sheet.getColumn(6).width = 30;  // Client email ID
  sheet.getColumn(7).width = 18;  // Allocation Start
  sheet.getColumn(8).width = 18;  // Allocation End
  sheet.getColumn(9).width = 8;   // Alloc %
  sheet.getColumn(10).width = 14; // Allocated Days
  sheet.getColumn(11).width = 14; // Billed Days
  sheet.getColumn(12).width = 14; // Adj for past month
  sheet.getColumn(13).width = 14; // Revenue cnf days
  sheet.getColumn(14).width = 14; // Timesheet days
  sheet.getColumn(15).width = 8;  // Diff
  sheet.getColumn(16).width = 14; // Unbilled Days
  sheet.getColumn(17).width = 14; // Total Leave Days
  sheet.getColumn(18).width = 30; // Reason
  sheet.getColumn(19).width = 16; // Updated Tracker
  sheet.getColumn(20).width = 16; // Updated Client
  sheet.getColumn(21).width = 16; // Updated Workday
  for (let d = 1; d <= daysInMonth; d++) {
    sheet.getColumn(21 + d).width = 5;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
