import { useState } from 'react';
import {
  Box, Typography, Select, MenuItem, FormControl, InputLabel,
  Button, Paper, Alert, CircularProgress, useMediaQuery, useTheme
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { downloadExcel } from '../services/api';

const MONTHS = [
  { value: '2026-01', label: "Jan '26" },
  { value: '2026-02', label: "Feb '26" },
  { value: '2026-03', label: "Mar '26" },
  { value: '2026-04', label: "Apr '26" },
  { value: '2026-05', label: "May '26" },
  { value: '2026-06', label: "Jun '26" },
  { value: '2026-07', label: "Jul '26" },
  { value: '2026-08', label: "Aug '26" },
  { value: '2026-09', label: "Sep '26" },
  { value: '2026-10', label: "Oct '26" },
  { value: '2026-11', label: "Nov '26" },
  { value: '2026-12', label: "Dec '26" },
];

export default function DownloadPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const handleDownload = async () => {
    setDownloading(true);
    setError('');
    try {
      await downloadExcel(month);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Box>
      <Typography variant={isMobile ? 'h6' : 'h5'} gutterBottom>
        Download Timesheet
      </Typography>

      <Paper sx={{ p: 3, maxWidth: 400 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Select a month and download the consolidated timesheet as an Excel file.
          The file includes all employee entries for the selected month.
        </Typography>

        <FormControl fullWidth size="small" sx={{ mb: 3 }}>
          <InputLabel>Month</InputLabel>
          <Select value={month} label="Month" onChange={(e) => setMonth(e.target.value)}>
            {MONTHS.map(m => (
              <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button
          variant="contained"
          fullWidth
          size="large"
          startIcon={downloading ? <CircularProgress size={20} color="inherit" /> : <DownloadIcon />}
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? 'Generating...' : 'Download Excel'}
        </Button>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
        )}
      </Paper>
    </Box>
  );
}
