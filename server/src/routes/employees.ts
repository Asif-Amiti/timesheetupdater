import { Router } from 'express';
import { loadEmployees } from '../services/dataStore';

export const employeesRouter = Router();

employeesRouter.get('/', async (req, res) => {
  const employees = await loadEmployees();
  res.json(employees);
});
