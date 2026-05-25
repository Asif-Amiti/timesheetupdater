import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Paper, Alert, CircularProgress,
  useMediaQuery, useTheme, Select, MenuItem, FormControl, InputLabel,
  TextField, Table, TableHead, TableBody, TableRow, TableCell, IconButton,
  TableContainer, Chip, LinearProgress
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import PeopleIcon from '@mui/icons-material/People';
import LockIcon from '@mui/icons-material/Lock';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import {
  uploadEmployeesExcel, downloadExcel, adminLogin,
  getAdminEmployees, addEmployee, deleteEmployee, Employee,
  getTimesheetStatus, TimesheetStatus, downloadTimesheetStatus
} from '../services/api';

export default function AdminPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newEmp, setNewEmp] = useState({ empId: '', empName: '', empClientId: '', email: '', clientEmail: '', allocationStartDate: '', allocationEndDate: '', allocationPercent: '100' });
  const [addingEmp, setAddingEmp] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);

  const [employeeFile, setEmployeeFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Global month/year filter — drives all admin sections
  const [globalMonth, setGlobalMonth] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'));
  const [globalYear, setGlobalYear] = useState(() => String(new Date().getFullYear()));
  const [downloading, setDownloading] = useState(false);

  const [tsStatus, setTsStatus] = useState<TimesheetStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const loadEmployees = useCallback(async () => {
    try {
      const res = await getAdminEmployees();
      setEmployees(res.data);
    } catch { /* ignore */ }
  }, []);

  const loadTimesheetStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const month = `${globalYear}-${globalMonth}`;
      const res = await getTimesheetStatus(month);
      setTsStatus(res.data);
    } catch { /* ignore */ }
    finally { setLoadingStatus(false); }
  }, [globalMonth, globalYear]);

  useEffect(() => {
    if (isLoggedIn) {
      loadEmployees();
    }
  }, [isLoggedIn, loadEmployees]);

  useEffect(() => {
    if (isLoggedIn) {
      loadTimesheetStatus();
    }
  }, [isLoggedIn, loadTimesheetStatus]);

  const handleLogin = async () => {
    setLoggingIn(true);
    setLoginError('');
    try {
      await adminLogin(username, password);
      setIsLoggedIn(true);
    } catch {
      setLoginError('Invalid username or password');
    } finally {
      setLoggingIn(false);
    }
  };

  const isEmpFormValid = newEmp.empId.trim() !== '' && newEmp.empName.trim() !== '' && newEmp.email.trim() !== '' && newEmp.allocationStartDate !== '' && newEmp.allocationEndDate !== '' && newEmp.allocationPercent !== '';

  const handleAddEmployee = async () => {
    if (!isEmpFormValid) return;
    setAddingEmp(true);
    setMessage(null);
    try {
      if (editingEmpId) {
        // Edit: upsert the employee (server handles add-or-update)
        await addEmployee({ ...newEmp, allocationPercent: Number(newEmp.allocationPercent) });
        // If empId changed, delete the old one
        if (editingEmpId !== newEmp.empId) {
          await deleteEmployee(editingEmpId);
        }
        setEditingEmpId(null);
        setMessage({ type: 'success', text: 'Employee updated successfully' });
      } else {
        await addEmployee({ ...newEmp, allocationPercent: Number(newEmp.allocationPercent) });
        setMessage({ type: 'success', text: 'Employee added successfully' });
      }
      setNewEmp({ empId: '', empName: '', empClientId: '', email: '', clientEmail: '', allocationStartDate: '', allocationEndDate: '', allocationPercent: '100' });
      loadEmployees();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save employee' });
    } finally {
      setAddingEmp(false);
    }
  };

  const handleEditEmployee = (emp: Employee) => {
    setEditingEmpId(emp.empId);
    setNewEmp({
      empId: emp.empId,
      empName: emp.empName,
      empClientId: emp.empClientId || '',
      email: emp.email || '',
      clientEmail: emp.clientEmail || '',
      allocationStartDate: emp.allocationStartDate || '',
      allocationEndDate: emp.allocationEndDate || '',
      allocationPercent: String(emp.allocationPercent ?? 100),
    });
  };

  const handleCancelEdit = () => {
    setEditingEmpId(null);
    setNewEmp({ empId: '', empName: '', empClientId: '', email: '', clientEmail: '', allocationStartDate: '', allocationEndDate: '', allocationPercent: '100' });
  };

  const handleDeleteEmployee = async (empId: string, empName: string) => {
    if (!confirm(`Delete ${empName} (${empId})?`)) return;
    setMessage(null);
    try {
      await deleteEmployee(empId);
      setMessage({ type: 'success', text: `${empName} deleted` });
      loadEmployees();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to delete' });
    }
  };

  const handleEmployeeUpload = async () => {
    if (!employeeFile) return;
    setUploading(true);
    setMessage(null);
    try {
      const res = await uploadEmployeesExcel(employeeFile);
      setMessage({ type: 'success', text: res.data.message });
      setEmployeeFile(null);
      loadEmployees();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    setMessage(null);
    try {
      const month = `${globalYear}-${globalMonth}`;
      await downloadExcel(month);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Download failed' });
    } finally {
      setDownloading(false);
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - 1 + i));
  const months = [
    { value: '01', label: 'January' }, { value: '02', label: 'February' },
    { value: '03', label: 'March' }, { value: '04', label: 'April' },
    { value: '05', label: 'May' }, { value: '06', label: 'June' },
    { value: '07', label: 'July' }, { value: '08', label: 'August' },
    { value: '09', label: 'September' }, { value: '10', label: 'October' },
    { value: '11', label: 'November' }, { value: '12', label: 'December' }
  ];

  return (
    <Box>
      {!isLoggedIn ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <Paper sx={{ p: 4, maxWidth: 360, width: '100%' }}>
            <Typography variant="h5" align="center" gutterBottom>
              <LockIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Admin Login
            </Typography>
            {loginError && <Alert severity="error" sx={{ mb: 2 }}>{loginError}</Alert>}
            <TextField
              label="Username"
              fullWidth
              sx={{ mb: 2 }}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <TextField
              label="Password"
              type="password"
              fullWidth
              sx={{ mb: 2 }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <Button
              variant="contained"
              fullWidth
              onClick={handleLogin}
              disabled={loggingIn || !username || !password}
            >
              {loggingIn ? <CircularProgress size={24} /> : 'Login'}
            </Button>
          </Paper>
        </Box>
      ) : (
      <Box>
      <Typography variant={isMobile ? 'h6' : 'h5'} gutterBottom>
        <PeopleIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
        Admin Panel
      </Typography>

      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {/* ---- Global Month/Year Filter ---- */}
      <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }} elevation={3}>
        <Typography variant="subtitle1" fontWeight="bold">Month:</Typography>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Month</InputLabel>
          <Select value={globalMonth} label="Month" onChange={(e) => setGlobalMonth(e.target.value)}>
            {months.map(m => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel>Year</InputLabel>
          <Select value={globalYear} label="Year" onChange={(e) => setGlobalYear(e.target.value)}>
            {years.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </Select>
        </FormControl>
      </Paper>

      {/* ---- Action Cards Row ---- */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>

        {/* Download Status Card */}
        <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }} elevation={2}>
          <Typography variant="subtitle1" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center' }}>
            <CheckCircleIcon sx={{ mr: 1, color: 'success.main', fontSize: 20 }} />
            Timesheet Fill Status
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {tsStatus && (
              <Button
                variant="contained" size="small" color="success"
                startIcon={<DownloadIcon />}
                onClick={() => downloadTimesheetStatus(`${globalYear}-${globalMonth}`)}
              >
                Download Status
              </Button>
            )}
          </Box>
        </Paper>

        {/* Bulk Upload Employees Card */}
        <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }} elevation={2}>
          <Typography variant="subtitle1" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center' }}>
            <UploadFileIcon sx={{ mr: 1, fontSize: 20 }} />
            Bulk Upload Employees
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
            <Button variant="outlined" size="small" component="label">
              Choose File
              <input
                type="file"
                hidden
                accept=".xlsx,.xls"
                onChange={(e) => setEmployeeFile(e.target.files?.[0] || null)}
              />
            </Button>
            {employeeFile && (
              <Typography variant="body2" sx={{ maxWidth: 140 }} noWrap>{employeeFile.name}</Typography>
            )}
            <Button
              variant="contained" size="small"
              startIcon={uploading ? <CircularProgress size={18} /> : <UploadFileIcon />}
              onClick={handleEmployeeUpload}
              disabled={!employeeFile || uploading}
            >
              Upload
            </Button>
          </Box>
        </Paper>

        {/* Download Timesheet Excel Card */}
        <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }} elevation={2}>
          <Typography variant="subtitle1" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center' }}>
            <DownloadIcon sx={{ mr: 1, fontSize: 20 }} />
            Download Timesheet Excel
          </Typography>
          <Box>
            <Button
              variant="contained" size="small" color="success"
              startIcon={downloading ? <CircularProgress size={18} /> : <DownloadIcon />}
              onClick={handleDownload}
              disabled={downloading}
            >
              Download
            </Button>
          </Box>
        </Paper>
      </Box>

      {/* ---- Status Table ---- */}
      {tsStatus && (
        <Paper sx={{ p: isMobile ? 2 : 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Timesheet Fill Status
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <Chip
              icon={<CheckCircleIcon />}
              label={`Filled: ${tsStatus.filledCount} / ${tsStatus.totalEmployees}`}
              color="success" variant="outlined"
            />
            <Chip
              icon={<PendingIcon />}
              label={`Pending: ${tsStatus.pendingCount} / ${tsStatus.totalEmployees}`}
              color="warning" variant="outlined"
            />
          </Box>
          <Box sx={{ mb: 2 }}>
            <LinearProgress
              variant="determinate"
              value={tsStatus.totalEmployees > 0 ? (tsStatus.filledCount / tsStatus.totalEmployees) * 100 : 0}
              sx={{ height: 10, borderRadius: 5 }}
            />
            <Typography variant="caption" color="text.secondary">
              {tsStatus.totalEmployees > 0
                ? `${Math.round((tsStatus.filledCount / tsStatus.totalEmployees) * 100)}% complete`
                : 'No employees'}
            </Typography>
          </Box>
          <TableContainer sx={{ maxHeight: 400 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Emp Id</strong></TableCell>
                  <TableCell><strong>Emp Name</strong></TableCell>
                  <TableCell align="center"><strong>Updated Tracker</strong></TableCell>
                  <TableCell align="center"><strong>Updated Client</strong></TableCell>
                  <TableCell align="center"><strong>Updated Workday</strong></TableCell>
                  <TableCell align="center"><strong>Filled</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tsStatus.statuses.map(s => (
                  <TableRow key={s.empId} hover sx={{ bgcolor: s.filled ? 'success.50' : undefined }}>
                    <TableCell>{s.empId}</TableCell>
                    <TableCell>{s.empName}</TableCell>
                    <TableCell align="center">
                      <Chip size="small" label={s.updatedTracker ? 'Yes' : 'No'} color={s.updatedTracker ? 'success' : 'default'} />
                    </TableCell>
                    <TableCell align="center">
                      <Chip size="small" label={s.updatedClient ? 'Yes' : 'No'} color={s.updatedClient ? 'success' : 'default'} />
                    </TableCell>
                    <TableCell align="center">
                      <Chip size="small" label={s.updatedWorkday ? 'Yes' : 'No'} color={s.updatedWorkday ? 'success' : 'default'} />
                    </TableCell>
                    <TableCell align="center">
                      <Chip size="small" label={s.filled ? 'Yes' : 'No'} color={s.filled ? 'success' : 'warning'} variant={s.filled ? 'filled' : 'outlined'} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* ---- Employees Table ---- */}
      <Paper sx={{ p: isMobile ? 2 : 3 }}>
        <Typography variant="h6" gutterBottom>Employees ({employees.length})</Typography>

        {/* Add Employee Form */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small" label="Emp Id *" value={newEmp.empId}
            onChange={(e) => setNewEmp({ ...newEmp, empId: e.target.value })}
            sx={{ width: 100 }}
          />
          <TextField
            size="small" label="Emp Name *" value={newEmp.empName}
            onChange={(e) => setNewEmp({ ...newEmp, empName: e.target.value })}
            sx={{ width: 160 }}
          />
          <TextField
            size="small" label="Emp Client ID" value={newEmp.empClientId}
            onChange={(e) => setNewEmp({ ...newEmp, empClientId: e.target.value })}
            sx={{ width: 120 }}
          />
          <TextField
            size="small" label="Fractal Email ID *" value={newEmp.email}
            onChange={(e) => setNewEmp({ ...newEmp, email: e.target.value })}
            sx={{ width: 200 }}
          />
          <TextField
            size="small" label="Client Email ID" value={newEmp.clientEmail}
            onChange={(e) => setNewEmp({ ...newEmp, clientEmail: e.target.value })}
            sx={{ width: 200 }}
          />
          <TextField
            size="small" label="Alloc Start Date *" type="date" value={newEmp.allocationStartDate}
            onChange={(e) => setNewEmp({ ...newEmp, allocationStartDate: e.target.value })}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 150 }}
          />
          <TextField
            size="small" label="Alloc End Date *" type="date" value={newEmp.allocationEndDate}
            onChange={(e) => setNewEmp({ ...newEmp, allocationEndDate: e.target.value })}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 150 }}
          />
          <TextField
            size="small" label="Alloc % *" type="number" value={newEmp.allocationPercent}
            onChange={(e) => setNewEmp({ ...newEmp, allocationPercent: e.target.value })}
            sx={{ width: 80 }}
          />
          <Button
            variant="contained" size="small" startIcon={editingEmpId ? undefined : <AddIcon />}
            onClick={handleAddEmployee}
            disabled={!isEmpFormValid || addingEmp}
          >
            {editingEmpId ? 'Update' : 'Add'}
          </Button>
          {editingEmpId && (
            <Button variant="outlined" size="small" onClick={handleCancelEdit}>
              Cancel
            </Button>
          )}
        </Box>

        {/* Employee Table */}
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell><strong>Emp Id</strong></TableCell>
                <TableCell><strong>Emp Name</strong></TableCell>
                <TableCell><strong>Emp Client ID</strong></TableCell>
                <TableCell><strong>Fractal Email ID</strong></TableCell>
                <TableCell><strong>Client Email ID</strong></TableCell>
                <TableCell><strong>Alloc Start</strong></TableCell>
                <TableCell><strong>Alloc End</strong></TableCell>
                <TableCell><strong>Alloc %</strong></TableCell>
                <TableCell align="center"><strong>Action</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {employees.map((emp) => (
                <TableRow key={emp.empId} hover>
                  <TableCell>{emp.empId}</TableCell>
                  <TableCell>{emp.empName}</TableCell>
                  <TableCell>{emp.empClientId || '-'}</TableCell>
                  <TableCell>{emp.email}</TableCell>
                  <TableCell>{emp.clientEmail || '-'}</TableCell>
                  <TableCell>{emp.allocationStartDate || '-'}</TableCell>
                  <TableCell>{emp.allocationEndDate || '-'}</TableCell>
                  <TableCell>{emp.allocationPercent ?? 100}</TableCell>
                  <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                    <IconButton
                      size="small" color="primary"
                      onClick={() => handleEditEmployee(emp)}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small" color="error"
                      onClick={() => handleDeleteEmployee(emp.empId, emp.empName)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
      )}
    </Box>
  );
}
