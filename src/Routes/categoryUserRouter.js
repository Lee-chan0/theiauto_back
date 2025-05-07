import express from 'express';
import prisma from '../utils/prisma.js';

const categoryUserRouter = express.Router();

categoryUserRouter.get('/category/:categoryId', async (req, res, next) => {
  try {
    const { categoryId } = req.params;

    const categoryInfo = await prisma.category.findUnique({
      where: {
        categoryId: +categoryId
      },
      select: {
        categoryId: true,
        categoryName: true,
      }
    });

    return res.status(200).json({ categoryInfo });

  } catch (e) {
    next(e);
  }
})

export default categoryUserRouter;