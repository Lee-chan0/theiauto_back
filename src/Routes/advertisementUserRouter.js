import express from 'express';
import prisma from '../utils/prisma.js';

const advertisementUserRouter = express.Router();

advertisementUserRouter.get('/advertisement/home', async (req, res, next) => {
  try {
    const findAd = await prisma.advertisement.findMany({
      where: {
        isActive: true,
        adLocation: {
          in: ['메인 배너 하단-1 (218 X 220)', '메인 배너 하단-2 (218 X 220)',
            '메인 배너 하단-3 (218 X 220)', '메인 배너 하단-4 (218 X 220)',
            '메인 배너 하단-5 (218 X 220)']
        }
      },
      select: {
        advertisementId: true,
        advertisementImageUrl: true,
        advertisementTitle: true,
        redirectUrl: true,
        adLocation: true
      }
    });

    return res.status(200).json({ ads: findAd });
  } catch (e) {
    next(e);
  }
})

advertisementUserRouter.get('/advertisement/nav', async (req, res, next) => {
  try {
    const findAd = await prisma.advertisement.findMany({
      where: {
        isActive: true,
        adLocation: '페이지 최상단 중앙 (486 X 60)'
      },
      select: {
        advertisementId: true,
        advertisementImageUrl: true,
        advertisementTitle: true,
        redirectUrl: true,
        adLocation: true
      }
    });

    return res.status(200).json({ ads: findAd });
  } catch (e) {
    next(e);
  }
});

advertisementUserRouter.get('/advertisement/magazine', async (req, res, next) => {
  try {
    const findAd = await prisma.advertisement.findFirst({
      where: {
        isActive: true,
        adLocation: '홈페이지 월간지 팝업 (광고 X)'
      },
      select: {
        advertisementId: true,
        advertisementImageUrl: true,
        advertisementTitle: true,
        redirectUrl: true,
        adLocation: true
      }
    });

    return res.status(200).json({ ad: findAd })
  } catch (e) {
    next(e);
  }
})

advertisementUserRouter.get('/advertisement/popup', async (req, res, next) => {
  try {
    const findAd = await prisma.advertisement.findMany({
      where: {
        isActive: true,
        adLocation: '팝업 광고 (300 X 360)'
      },
      select: {
        advertisementId: true,
        advertisementImageUrl: true,
        advertisementTitle: true,
        redirectUrl: true,
        adLocation: true
      }
    });

    return res.status(200).json({ ad: findAd })
  } catch (e) {
    next(e);
  }
})

advertisementUserRouter.patch('/advertisement/:advertisementId/click', async (req, res, next) => {
  try {
    const { advertisementId } = req.params;
    if (!advertisementId) return res.status(400).json({ message: "올바르지 않은 요청입니다." });

    await prisma.advertisement.update({
      where: {
        advertisementId: +advertisementId
      },
      data: {
        clickCount: {
          increment: 1
        }
      }
    })

    return res.sendStatus(200);
  } catch (e) {
    next(e);
  }
});

// 구독 유저
advertisementUserRouter.post('/subscribeinfo', async (req, res, next) => {
  try {
    const { subscribeUserName, subscribeUserEmail } = req.body;

    if (!subscribeUserEmail || !subscribeUserName) {
      return res.status(400).json({ message: "빈칸 없이 기재해주세요." });
    }

    const findEmail = await prisma.subscribeUserInfo.findUnique({
      where: { subscribeUserEmail: subscribeUserEmail }
    });

    if (findEmail) return res.status(400).json({ message: "이미 구독중입니다." });

    await prisma.subscribeUserInfo.create({
      data: {
        subscribeUserEmail: subscribeUserEmail,
        subscribeUserName: subscribeUserName
      }
    });

    return res.sendStatus(200);
  } catch (e) {
    next(e);
  }
})

export default advertisementUserRouter;