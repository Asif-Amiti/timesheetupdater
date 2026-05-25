import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Box, Typography, TextField, Checkbox, FormControlLabel, Alert, CircularProgress,
  Paper, Chip, useMediaQuery, useTheme, Autocomplete, Button,
  Select, MenuItem, FormControl, InputLabel
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import { getEmployees, getMonthData, saveTimesheet, getHolidays, Employee, TimesheetEntry } from '../services/api';
import CalendarGrid from '../components/CalendarGrid';

export default function TimesheetPage() {
  const theme = useTheme();
  const location = useLocation();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [selectedMonth, setSelectedMonth] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'));
  const [selectedYear, setSelectedYear] = useState(() => String(new Date().getFullYear()));
  const month = `${selectedYear}-${selectedMonth}`;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [entry, setEntry] = useState<TimesheetEntry | null>(null);
  const [holidays, setHolidays] = useState<{ [month: string]: number[] }>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [hasChanges, setHasChanges] = useState(false);

  // Load employees and holidays on mount and when navigating back
  useEffect(() => {
    Promise.all([getEmployees(), getHolidays()])
      .then(([empRes, holRes]) => {
        setEmployees(empRes.data);
        setHolidays(holRes.data);
      })
      .catch(console.error);
  }, [location.key]);

  // Load timesheet data when month or employee changes
  useEffect(() => {
    if (!selectedEmployee) return;
    setLoading(true);
    getMonthData(month)
      .then(res => {
        const empEntry = res.data.entries[selectedEmployee.empId];
        if (empEntry) {
          // Normalize empty day values: fill weekdays with 'W' if not already set
          const yr = parseInt(month.split('-')[0]);
          const mn = parseInt(month.split('-')[1]);
          const daysInMonth = new Date(yr, mn, 0).getDate();
          const monthHolidays = holidays[month] || [];
          const normalizedDays = { ...empEntry.days };
          for (let d = 1; d <= daysInMonth; d++) {
            const dow = new Date(yr, mn - 1, d).getDay();
            const isWeekend = dow === 0 || dow === 6;
            const isHoliday = monthHolidays.includes(d);
            if (!normalizedDays[String(d)] && !isWeekend) {
              normalizedDays[String(d)] = isHoliday ? 'H' : 'W';
            }
          }
          setEntry({ ...empEntry, days: normalizedDays });
        } else {
          // Initialize entry with W (Working) as default for weekdays
          const yr = parseInt(month.split('-')[0]);
          const mn = parseInt(month.split('-')[1]);
          const daysInMonth = new Date(yr, mn, 0).getDate();
          const monthHolidays = holidays[month] || [];
          const days: { [key: string]: string } = {};
          for (let d = 1; d <= daysInMonth; d++) {
            const dow = new Date(yr, mn - 1, d).getDay();
            const isWeekend = dow === 0 || dow === 6;
            const isHoliday = monthHolidays.includes(d);
            days[String(d)] = isWeekend ? '' : isHoliday ? 'H' : 'W';
          }
          setEntry({
            empId: selectedEmployee.empId,
            empName: selectedEmployee.empName,
            days,
            reason: '',
            updatedTracker: false,
            updatedClient: false,
            updatedWorkday: false,
            lastModified: ''
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [month, selectedEmployee]);

  // Debounced save
  const doSave = useCallback(async (data: TimesheetEntry) => {
    if (!selectedEmployee) return;
    setSaving(true);
    setSaveStatus('idle');
    try {
      await saveTimesheet(month, selectedEmployee.empId, data);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }, [month, selectedEmployee]);

  const handleDayChange = (day: string, value: string) => {
    if (!entry) return;
    const updated = {
      ...entry,
      days: { ...entry.days, [day]: value },
      lastModified: new Date().toISOString()
    };
    setEntry(updated);
    setHasChanges(true);
  };

  const handleFieldChange = (field: keyof TimesheetEntry, value: any) => {
    if (!entry) return;
    const updated = { ...entry, [field]: value, lastModified: new Date().toISOString() };
    setEntry(updated);
    setHasChanges(true);
  };

  const handleSave = () => {
    if (!entry) return;
    doSave(entry).then(() => setHasChanges(false));
  };

  return (
    <Box>
      <Typography variant={isMobile ? 'h6' : 'h5'} gutterBottom>
        Fill Timesheet
      </Typography>

      {/* Controls */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 2, alignItems: isMobile ? 'stretch' : 'center' }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Month</InputLabel>
            <Select value={selectedMonth} label="Month" onChange={(e) => setSelectedMonth(e.target.value)}>
              <MenuItem value="01">January</MenuItem>
              <MenuItem value="02">February</MenuItem>
              <MenuItem value="03">March</MenuItem>
              <MenuItem value="04">April</MenuItem>
              <MenuItem value="05">May</MenuItem>
              <MenuItem value="06">June</MenuItem>
              <MenuItem value="07">July</MenuItem>
              <MenuItem value="08">August</MenuItem>
              <MenuItem value="09">September</MenuItem>
              <MenuItem value="10">October</MenuItem>
              <MenuItem value="11">November</MenuItem>
              <MenuItem value="12">December</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 90 }}>
            <InputLabel>Year</InputLabel>
            <Select value={selectedYear} label="Year" onChange={(e) => setSelectedYear(e.target.value)}>
              {Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() + i - 1)).map(y => (
                <MenuItem key={y} value={y}>{y}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Autocomplete
            size="small"
            sx={{ minWidth: 250, flexGrow: 1 }}
            options={employees}
            getOptionLabel={(emp) => emp.empName}
            value={selectedEmployee}
            onChange={(_, val) => setSelectedEmployee(val)}
            renderInput={(params) => <TextField {...params} label="Select Employee" />}
          />

          {saving && <CircularProgress size={20} />}
          {saveStatus === 'saved' && <Chip label="Saved ✓" color="success" size="small" />}
          {saveStatus === 'error' && <Chip label="Save failed" color="error" size="small" />}
        </Box>
      </Paper>

      {/* Timesheet Grid */}
      {loading && <CircularProgress />}

      {!loading && selectedEmployee && entry && (
        <>
          <CalendarGrid
            month={month}
            days={entry.days}
            holidays={holidays[month] || []}
            onDayChange={handleDayChange}
            isMobile={isMobile}
          />

          {/* Additional Fields */}
          <Paper sx={{ p: 2, mt: 2 }}>
            <TextField
              label="Reason for Non-Billing / Comments"
              fullWidth
              multiline
              rows={2}
              size="small"
              value={entry.reason}
              onChange={(e) => handleFieldChange('reason', e.target.value)}
              sx={{ mb: 2 }}
            />

            <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 1 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={entry.updatedTracker}
                    onChange={(e) => handleFieldChange('updatedTracker', e.target.checked)}
                  />
                }
                label="Updated this tracker"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={entry.updatedClient}
                    onChange={(e) => handleFieldChange('updatedClient', e.target.checked)}
                  />
                }
                label="Updated Client timesheet"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={entry.updatedWorkday}
                    onChange={(e) => handleFieldChange('updatedWorkday', e.target.checked)}
                  />
                }
                label="Updated Workday"
              />
            </Box>
          </Paper>

          {/* Save Button */}
          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              variant="contained"
              color="primary"
              size="large"
              startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
              onClick={handleSave}
              disabled={saving || !hasChanges}
              sx={{ minWidth: 160 }}
            >
              {saving ? 'Saving...' : hasChanges ? 'Save Timesheet' : 'No Changes'}
            </Button>
            {saveStatus === 'saved' && <Chip label="Saved successfully ✓" color="success" size="small" />}
            {saveStatus === 'error' && <Chip label="Save failed - try again" color="error" size="small" />}
          </Box>

          {entry.lastModified && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Last modified: {new Date(entry.lastModified).toLocaleString()}
            </Typography>
          )}
        </>
      )}

      {!selectedEmployee && !loading && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Select your name from the dropdown above to start filling your timesheet.
        </Alert>
      )}
    </Box>
  );
}
