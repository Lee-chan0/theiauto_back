import express from 'express';
import prisma from '../utils/prisma.js';

const categoryRouter = express.Router();

categoryRouter.get('/categories', async (req, res, next) => {
  try {
    const findManyCategory = await prisma.category.findMany({});

    return res.status(201).json({ categories: findManyCategory });
  } catch (e) {
    next(e);
  }
});

export default categoryRouter;