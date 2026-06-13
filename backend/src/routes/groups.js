import express from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/authenticate.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();
router.use(authenticate);

// GET /api/groups — list all groups for current user
router.get('/', async (req, res) => {
  const groups = await prisma.group.findMany({
    where: {
      members: { some: { userId: req.user.id } },
    },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { joinedAt: 'asc' },
      },
      _count: { select: { expenses: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(groups);
});

// POST /api/groups — create a group
router.post('/', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).max(255),
    memberIds: z.array(z.number()).optional(), // additional member user IDs
    joinedAt: z.string().optional(), // default today
  });
  const { name, memberIds = [], joinedAt } = schema.parse(req.body);
  const joinDate = joinedAt ? new Date(joinedAt) : new Date();

  const group = await prisma.group.create({
    data: {
      name,
      createdBy: req.user.id,
      members: {
        create: [
          { userId: req.user.id, joinedAt: joinDate },
          ...memberIds.filter(id => id !== req.user.id).map(id => ({
            userId: id,
            joinedAt: joinDate,
          })),
        ],
      },
    },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  res.status(201).json(group);
});

// GET /api/groups/:id
router.get('/:id', async (req, res) => {
  const group = await prisma.group.findUnique({
    where: { id: parseInt(req.params.id) },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { joinedAt: 'asc' },
      },
      creator: { select: { id: true, name: true } },
    },
  });
  if (!group) throw new AppError('Group not found', 404);
  // Check membership
  const isMember = group.members.some(m => m.userId === req.user.id);
  if (!isMember) throw new AppError('Access denied', 403);
  res.json(group);
});

// PATCH /api/groups/:id — update name
router.patch('/:id', async (req, res) => {
  const schema = z.object({ name: z.string().min(1).max(255) });
  const { name } = schema.parse(req.body);
  const group = await prisma.group.update({
    where: { id: parseInt(req.params.id) },
    data: { name },
  });
  res.json(group);
});

// POST /api/groups/:id/members — add a member
router.post('/:id/members', async (req, res) => {
  const schema = z.object({
    userId: z.number(),
    joinedAt: z.string(),
  });
  const { userId, joinedAt } = schema.parse(req.body);
  const groupId = parseInt(req.params.id);

  const member = await prisma.groupMember.create({
    data: { groupId, userId, joinedAt: new Date(joinedAt) },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.status(201).json(member);
});

// PATCH /api/groups/:id/members/:userId/leave — set leftAt
router.patch('/:id/members/:userId/leave', async (req, res) => {
  const schema = z.object({ leftAt: z.string() });
  const { leftAt } = schema.parse(req.body);
  const groupId = parseInt(req.params.id);
  const userId = parseInt(req.params.userId);

  const member = await prisma.groupMember.findFirst({
    where: { groupId, userId, leftAt: null },
  });
  if (!member) throw new AppError('Active membership not found', 404);

  const updated = await prisma.groupMember.update({
    where: { id: member.id },
    data: { leftAt: new Date(leftAt) },
  });
  res.json(updated);
});

// GET /api/groups/:id/members/active?date=YYYY-MM-DD — members active on a date
router.get('/:id/members/active', async (req, res) => {
  const groupId = parseInt(req.params.id);
  const date = req.query.date ? new Date(req.query.date) : new Date();

  const members = await prisma.groupMember.findMany({
    where: {
      groupId,
      joinedAt: { lte: date },
      OR: [{ leftAt: null }, { leftAt: { gte: date } }],
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.json(members);
});

export default router;
