import { Box, Select, MenuItem, Typography, Paper, useTheme } from '@mui/material';

interface CalendarGridProps {
  month: string;
  days: { [day: string]: string };
  holidays: number[];
  onDayChange: (day: string, value: string) => void;
  isMobile: boolean;
}

const DAY_OPTIONS = [
  { value: 'W', label: 'W' },
  { value: 'H', label: 'H' },
  { value: 'L', label: 'L' },
  { value: 'NB', label: 'NB' },
  { value: 'HDL', label: 'HDL' }
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getDayInfo(month: string, day: number) {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(year, m - 1, day);
  return {
    dayName: DAY_NAMES[date.getDay()],
    isWeekend: date.getDay() === 0 || date.getDay() === 6
  };
}

function getDaysInMonth(month: string): number {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m, 0).getDate();
}

function getCellColor(value: string, isWeekend: boolean, isHoliday: boolean): string {
  if (value === 'H' || isHoliday) return '#fff3cd';
  if (value === 'L') return '#f8d7da';
  if (value === 'HDL') return '#ffe0e0';
  if (value === 'NB') return '#e2e3e5';
  if (isWeekend) return '#e8f5e9';
  return '#ffffff';
}

export default function CalendarGrid({ month, days, holidays, onDayChange, isMobile }: CalendarGridProps) {
  const daysInMonth = getDaysInMonth(month);
  const theme = useTheme();

  return (
    <Paper sx={{ p: isMobile ? 1 : 2, overflow: 'auto' }}>
      <Typography variant="subtitle2" gutterBottom color="text.secondary">
        W=Working, H=Holiday, L=Leave, NB=Non-Billable, HDL=Half Day Leave
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: isMobile
            ? 'repeat(7, 1fr)'
            : `repeat(${Math.min(daysInMonth, 16)}, 1fr)`,
          gap: 0.5,
          mt: 1
        }}
      >
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
          const { dayName, isWeekend } = getDayInfo(month, day);
          const isHoliday = holidays.includes(day);
          const value = days[String(day)] || (isWeekend ? '' : isHoliday ? 'H' : 'W');
          const bgColor = getCellColor(value, isWeekend, isHoliday);

          return (
            <Box
              key={day}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                p: 0.5,
                borderRadius: 1,
                backgroundColor: bgColor,
                border: '1px solid #e0e0e0',
                minWidth: isMobile ? 44 : 56
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 'bold', fontSize: '0.65rem' }}>
                {dayName}
              </Typography>
              <Typography variant="caption" sx={{ fontSize: '0.7rem', mb: 0.3 }}>
                {day}
              </Typography>
              <Select
                value={value}
                onChange={(e) => onDayChange(String(day), e.target.value)}
                size="small"
                variant="standard"
                sx={{
                  fontSize: '0.7rem',
                  minWidth: isMobile ? 36 : 46,
                  '& .MuiSelect-select': {
                    padding: '2px 4px',
                    textAlign: 'center'
                  }
                }}
                disabled={isWeekend && !value && !isHoliday}
              >
                {DAY_OPTIONS.map(opt => (
                  <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.8rem' }}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </Box>
          );
        })}
      </Box>

      {/* Legend */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
        {[
          { color: '#ffffff', label: 'Working' },
          { color: '#fff3cd', label: 'Holiday (H)' },
          { color: '#f8d7da', label: 'Leave (L)' },
          { color: '#ffe0e0', label: 'Half Day (HDL)' },
          { color: '#e2e3e5', label: 'Non-Billable (NB)' },
          { color: '#e8f5e9', label: 'Weekend' }
        ].map(item => (
          <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 14, height: 14, bgcolor: item.color, border: '1px solid #ccc', borderRadius: 0.5 }} />
            <Typography variant="caption">{item.label}</Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
