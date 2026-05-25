import { Router, Request } from 'express';
import { loadMonthData, saveMonthData, loadHolidays } from '../services/dataStore';

export const timesheetRouter = Router();

// Get all entries for a month
timesheetRouter.get('/:month', async (req, res) => {
  const { month } = req.params;
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: 'Invalid month format. Use YYYY-MM' });
    return;
  }
  const data = await loadMonthData(month);
  res.json(data);
});

// Get holidays
timesheetRouter.get('/config/holidays', async (req, res) => {
  const holidays = await loadHolidays();
  res.json(holidays);
});

// Get single employee's entry for a month
timesheetRouter.get('/:month/:empId', async (req, res) => {
  const { month, empId } = req.params;
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: 'Invalid month format. Use YYYY-MM' });
    return;
  }
  const data = await loadMonthData(month);
  const entry = data.entries[empId];
  if (!entry) {
    res.json(null);
    return;
  }
  res.json(entry);
});

// Update employee's timesheet for a month
timesheetRouter.put('/:month/:empId', async (req: Request, res) => {
  const { month, empId } = req.params;
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: 'Invalid month format. Use YYYY-MM' });
    return;
  }

  const { days, reason, updatedTracker, updatedClient, updatedWorkday, empName } = req.body;

  if (!days || typeof days !== 'object') {
    res.status(400).json({ error: 'days object is required' });
    return;
  }

  // Validate day values
  const validValues = ['', 'W', 'H', 'L', 'NB', 'HDL'];
  for (const [day, value] of Object.entries(days)) {
    if (!validValues.includes(value as string)) {
      res.status(400).json({ error: `Invalid value '${value}' for day ${day}. Allowed: ${validValues.join(', ')}` });
      return;
    }
  }

  const data = await loadMonthData(month);
  data.entries[empId] = {
    empId,
    empName: empName || data.entries[empId]?.empName || '',
    days,
    reason: reason || '',
    updatedTracker: !!updatedTracker,
    updatedClient: !!updatedClient,
    updatedWorkday: !!updatedWorkday,
    lastModified: new Date().toISOString()
  };

  await saveMonthData(month, data);
  res.json(data.entries[empId]);
});
