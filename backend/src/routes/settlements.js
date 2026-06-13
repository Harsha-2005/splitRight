import express from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/authenticate.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();
router.use(authenticate);

const settlementSchema = z.object({
  groupId: z.number(),
  fromUserId: z.number(),
  toUserId: z.number(),
  amount: z.number().positive(),
  currency: z.string().default('INR'),
  settledAt: z.string(),
  notes: z.string().optional(),
});

// GET /api/settlements?groupId=
router.get('/', async (req, res) => {
  const { groupId } = req.query;
  if (!groupId) throw new AppError('groupId required', 400);

  const settlements = await prisma.settlement.findMany({
    where: { groupId: parseInt(groupId) },
    include: {
      fromUser: { select: { id: true, name: true } },
      toUser: { select: { id: true, name: true } },
    },
    orderBy: { settledAt: 'desc' },
  });
  res.json(settlements);
});

// POST /api/settlements
router.post('/', async (req, res) => {
  const data = settlementSchema.parse(req.body);

  const settlement = await prisma.settlement.create({
    data: {
      groupId: data.groupId,
      fromUserId: data.fromUserId,
      toUserId: data.toUserId,
      amount: data.amount,
      currency: data.currency,
      settledAt: new Date(data.settledAt),
      notes: data.notes,
    },
    include: {
      fromUser: { select: { id: true, name: true } },
      toUser: { select: { id: true, name: true } },
    },
  });
  res.status(201).json(settlement);
});

// DELETE /api/settlements/:id
router.delete('/:id', async (req, res) => {
  await prisma.settlement.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ message: 'Settlement deleted' });
});

export default router;
