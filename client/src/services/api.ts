import axios from 'axios';

const api = axios.create({
  baseURL: '/api'
});

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

export interface TimesheetEntry {
  empId: string;
  empName: string;
  days: { [day: string]: string };
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

export const getEmployees = () => api.get<Employee[]>('/employees');

export const getMonthData = (month: string) => api.get<MonthData>(`/timesheet/${month}`);

export const getEmployeeTimesheet = (month: string, empId: string) =>
  api.get<TimesheetEntry | null>(`/timesheet/${month}/${empId}`);

export const saveTimesheet = (month: string, empId: string, data: Partial<TimesheetEntry>) =>
  api.put<TimesheetEntry>(`/timesheet/${month}/${empId}`, data);

export const downloadExcel = async (month: string): Promise<void> => {
  const response = await api.get(`/download/${month}`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [year, m] = month.split('-');
  link.download = `MBRDI_Timesheet_${monthNames[parseInt(m) - 1]}_${year}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const getHolidays = () => api.get<{ [month: string]: number[] }>('/timesheet/config/holidays');

// Admin functions
let adminCredentials = '';

export const adminLogin = async (username: string, password: string) => {
  const res = await api.post('/admin/login', { username, password });
  adminCredentials = btoa(`${username}:${password}`);
  return res;
};

function adminHeaders() {
  return { Authorization: `Basic ${adminCredentials}` };
}

export const uploadEmployeesExcel = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/admin/upload-employees', formData, {
    headers: { 'Content-Type': 'multipart/form-data', ...adminHeaders() }
  });
};

export const uploadHolidaysExcel = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/admin/upload-holidays', formData, {
    headers: { 'Content-Type': 'multipart/form-data', ...adminHeaders() }
  });
};

export const getAdminEmployees = (month?: string) =>
  api.get<Employee[]>('/admin/employees', { params: month ? { month } : undefined, headers: adminHeaders() });

export const addEmployee = (employee: { empId: string; empName: string; empClientId: string; email: string; clientEmail: string; allocationStartDate: string; allocationEndDate: string; allocationPercent: number }) =>
  api.post('/admin/employees', employee, { headers: adminHeaders() });

export const deleteEmployee = (empId: string) =>
  api.delete(`/admin/employees/${empId}`, { headers: adminHeaders() });

export interface TimesheetStatusEntry {
  empId: string;
  empName: string;
  filled: boolean;
  updatedTracker: boolean;
  updatedClient: boolean;
  updatedWorkday: boolean;
}

export interface TimesheetStatus {
  month: string;
  totalEmployees: number;
  filledCount: number;
  pendingCount: number;
  statuses: TimesheetStatusEntry[];
}

export const getTimesheetStatus = (month: string) =>
  api.get<TimesheetStatus>(`/admin/timesheet-status/${month}`, { headers: adminHeaders() });

export const downloadTimesheetStatus = async (month: string): Promise<void> => {
  const response = await api.get(`/admin/timesheet-status/${month}/download`, {
    headers: adminHeaders(),
    responseType: 'blob'
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = `Timesheet_Status_${month}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export default api;
