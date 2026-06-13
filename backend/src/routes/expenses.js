import express from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/authenticate.js';
import { AppError } from '../middleware/errorHandler.js';
import { calculateSplits } from '../lib/splitEngine.js';
import { getExchangeRate, convertToInr } from '../lib/currency.js';

const router = express.Router();
router.use(authenticate);

const expenseSchema = z.object({
  groupId: z.number(),
  description: z.string().min(1),
  paidBy: z.number(),
  amount: z.number().positive(),
  currency: z.string().default('INR'),
  expenseDate: z.string(),
  splitType: z.enum(['equal', 'unequal', 'percentage', 'share']),
  splitMembers: z.array(z.object({
    userId: z.number(),
    value: z.number(), // meaning depends on splitType
  })),
  isRefund: z.boolean().default(false),
  notes: z.string().optional(),
});

// GET /api/expenses?groupId=
router.get('/', async (req, res) => {
  const { groupId, from, to } = req.query;
  if (!groupId) throw new AppError('groupId required', 400);

  const where = { groupId: parseInt(groupId) };
  if (from) where.expenseDate = { ...where.expenseDate, gte: new Date(from) };
  if (to) where.expenseDate = { ...where.expenseDate, lte: new Date(to) };

  const expenses = await prisma.expense.findMany({
    where,
    include: {
      payer: { select: { id: true, name: true } },
      splits: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
    orderBy: { expenseDate: 'desc' },
  });
  res.json(expenses);
});

// GET /api/expenses/:id
router.get('/:id', async (req, res) => {
  const expense = await prisma.expense.findUnique({
    where: { id: parseInt(req.params.id) },
    include: {
      payer: { select: { id: true, name: true } },
      splits: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });
  if (!expense) throw new AppError('Expense not found', 404);
  res.json(expense);
});

// POST /api/expenses
router.post('/', async (req, res) => {
  const data = expenseSchema.parse(req.body);

  const expenseDate = new Date(data.expenseDate);
  let exchangeRate = 1.0;
  let amountInr = data.amount;

  if (data.currency !== 'INR') {
    exchangeRate = await getExchangeRate(data.currency, 'INR', expenseDate);
    amountInr = convertToInr(data.amount, data.currency, exchangeRate);
  }

  const splits = calculateSplits(amountInr, data.splitType, data.splitMembers);

  const expense = await prisma.expense.create({
    data: {
      groupId: data.groupId,
      description: data.description,
      paidBy: data.paidBy,
      amount: data.amount,
      currency: data.currency,
      exchangeRate,
      amountInr,
      expenseDate,
      splitType: data.splitType,
      isRefund: data.isRefund,
      notes: data.notes,
      splits: {
        create: splits.map(s => ({ userId: s.userId, shareAmount: s.shareAmount })),
      },
    },
    include: {
      payer: { select: { id: true, name: true } },
      splits: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  res.status(201).json(expense);
});

// PUT /api/expenses/:id
router.put('/:id', async (req, res) => {
  const data = expenseSchema.parse(req.body);
  const id = parseInt(req.params.id);

  const expenseDate = new Date(data.expenseDate);
  let exchangeRate = 1.0;
  let amountInr = data.amount;

  if (data.currency !== 'INR') {
    exchangeRate = await getExchangeRate(data.currency, 'INR', expenseDate);
    amountInr = convertToInr(data.amount, data.currency, exchangeRate);
  }

  const splits = calculateSplits(amountInr, data.splitType, data.splitMembers);

  // Delete old splits and recreate
  await prisma.expenseSplit.deleteMany({ where: { expenseId: id } });

  const expense = await prisma.expense.update({
    where: { id },
    data: {
      description: data.description,
      paidBy: data.paidBy,
      amount: data.amount,
      currency: data.currency,
      exchangeRate,
      amountInr,
      expenseDate,
      splitType: data.splitType,
      isRefund: data.isRefund,
      notes: data.notes,
      splits: {
        create: splits.map(s => ({ userId: s.userId, shareAmount: s.shareAmount })),
      },
    },
    include: {
      payer: { select: { id: true, name: true } },
      splits: { include: { user: { select: { id: true, name: true } } } },
    },
  });
  res.json(expense);
});

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res) => {
  await prisma.expense.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ message: 'Expense deleted' });
});

export default router;
