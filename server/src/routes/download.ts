import { Router } from 'express';
import { generateExcel } from '../services/excelExport';

export const downloadRouter = Router();

// Download timesheet as Excel for a given month
downloadRouter.get('/:month', async (req, res) => {
  const { month } = req.params;
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: 'Invalid month format. Use YYYY-MM' });
    return;
  }

  try {
    const buffer = await generateExcel(month);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const [year, m] = month.split('-');
    const monthName = monthNames[parseInt(m) - 1];
    const filename = `MBRDI_Timesheet_${monthName}_${year}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error('Excel generation error:', err);
    res.status(500).json({ error: 'Failed to generate Excel' });
  }
});
