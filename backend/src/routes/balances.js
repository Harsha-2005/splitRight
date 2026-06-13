import express from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/authenticate.js';
import { AppError } from '../middleware/errorHandler.js';
import { calculateBalances, minimizeTransactions } from '../lib/splitEngine.js';

const router = express.Router();
router.use(authenticate);

// GET /api/balances/:groupId — full balance summary
router.get('/:groupId', async (req, res) => {
  const groupId = parseInt(req.params.groupId);

  const [expenses, settlements, members] = await Promise.all([
    prisma.expense.findMany({
      where: { groupId },
      include: {
        splits: true,
        payer: { select: { id: true, name: true } },
      },
    }),
    prisma.settlement.findMany({ where: { groupId } }),
    prisma.groupMember.findMany({
      where: { groupId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  const balances = calculateBalances(expenses, settlements);
  const transactions = minimizeTransactions(balances);

  // Map user IDs to names
  const userMap = {};
  members.forEach(m => { userMap[m.userId] = m.user; });

  const namedBalances = Object.entries(balances).map(([userId, balance]) => ({
    user: userMap[parseInt(userId)] || { id: parseInt(userId), name: 'Unknown' },
    balance: +Number(balance).toFixed(2),
  }));

  const namedTransactions = transactions.map(t => ({
    from: userMap[t.from] || { id: t.from, name: 'Unknown' },
    to: userMap[t.to] || { id: t.to, name: 'Unknown' },
    amount: t.amount,
  }));

  res.json({
    groupId,
    balances: namedBalances,
    suggestedSettlements: namedTransactions,
  });
});

// GET /api/balances/:groupId/user/:userId — drill-down for one person
router.get('/:groupId/user/:userId', async (req, res) => {
  const groupId = parseInt(req.params.groupId);
  const userId = parseInt(req.params.userId);

  // Get all expenses where this user is involved (paid or split)
  const expenses = await prisma.expense.findMany({
    where: {
      groupId,
      OR: [
        { paidBy: userId },
        { splits: { some: { userId } } },
      ],
    },
    include: {
      payer: { select: { id: true, name: true } },
      splits: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
    orderBy: { expenseDate: 'desc' },
  });

  // Breakdown: how much this user owes each person / is owed by each person
  const owedTo = {}; // userId -> amount this user owes them
  const owedBy = {}; // userId -> amount they owe this user

  for (const exp of expenses) {
    const multiplier = exp.isRefund ? -1 : 1;
    const userSplit = exp.splits.find(s => s.userId === userId);
    const userShareAmount = userSplit ? Number(userSplit.shareAmount) * multiplier : 0;

    if (exp.paidBy === userId) {
      // This user paid — others owe them
      for (const split of exp.splits) {
        if (split.userId !== userId) {
          if (!owedBy[split.userId]) owedBy[split.userId] = { amount: 0, expenses: [] };
          owedBy[split.userId].amount += Number(split.shareAmount) * multiplier;
          owedBy[split.userId].expenses.push({
            id: exp.id,
            description: exp.description,
            date: exp.expenseDate,
            amount: Number(split.shareAmount) * multiplier,
          });
        }
      }
    } else if (userSplit) {
      // Someone else paid — this user owes them
      if (!owedTo[exp.paidBy]) owedTo[exp.paidBy] = { amount: 0, expenses: [] };
      owedTo[exp.paidBy].amount += userShareAmount;
      owedTo[exp.paidBy].expenses.push({
        id: exp.id,
        description: exp.description,
        date: exp.expenseDate,
        amount: userShareAmount,
        paidBy: exp.payer,
      });
    }
  }

  // Apply settlements
  const settlements = await prisma.settlement.findMany({
    where: {
      groupId,
      OR: [{ fromUserId: userId }, { toUserId: userId }],
    },
  });

  for (const s of settlements) {
    if (s.fromUserId === userId) {
      // This user paid someone
      if (owedTo[s.toUserId]) owedTo[s.toUserId].amount -= Number(s.amount);
    } else {
      // Someone paid this user
      if (owedBy[s.fromUserId]) owedBy[s.fromUserId].amount -= Number(s.amount);
    }
  }

  res.json({
    userId,
    owedTo: Object.entries(owedTo).map(([id, data]) => ({
      user: { id: parseInt(id) },
      ...data,
    })),
    owedBy: Object.entries(owedBy).map(([id, data]) => ({
      user: { id: parseInt(id) },
      ...data,
    })),
  });
});

export default router;
