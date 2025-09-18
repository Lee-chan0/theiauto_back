import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { s3, upload } from '../middlewares/fileUploader.js';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../utils/prisma.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();



const advertisementRouter = express.Router();

advertisementRouter.post('/advertisement', upload.single("file"), authMiddleware, async (req, res, next) => {
  try {
    const { advertisementTitle, redirectUrl,
      isActive, adLocation, adMemo } = req.body;
    const advertisementImageUrl = req.file;

    if (!advertisementImageUrl) {
      return res.status(400).json({ message: "광고 이미지를 첨부해 주세요." });
    }

    if (!advertisementTitle || !adLocation || !redirectUrl) {
      return res.status(400).json({ message: "필수 항목을 작성해주세요." });
    }

    const CDN_URL = "https://theiauto.gcdn.ntruss.com";

    try {
      const adFileExt = path.extname(advertisementImageUrl.originalname).toLowerCase();
      const adFileKey = `advertisement/${Date.now()}_${uuidv4()}${adFileExt}`;

      const adImageParams = {
        Bucket: process.env.NCP_BUCKET,
        Key: adFileKey,
        Body: advertisementImageUrl.buffer,
        ACL: 'public-read',
        ContentType: advertisementImageUrl.mimetype
      };

      const command = new PutObjectCommand(adImageParams);
      await s3.send(command);

      const adImageUrl = `${CDN_URL}/${adFileKey}`;

      const createdAd = await prisma.advertisement.create({
        data: {
          advertisementTitle: advertisementTitle,
          adLocation: adLocation,
          adMemo: adMemo,
          advertisementImageUrl: adImageUrl,
          redirectUrl: redirectUrl,
          isActive: isActive === 'true'
        }
      });

      return res.status(201).json(createdAd);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: "업로드 실패", error: e });
    }

  } catch (e) {
    console.error(e);
    next(e);
  }
})

advertisementRouter.patch('/advertisement/:advertisementId', upload.single('file'), authMiddleware, async (req, res, next) => {
  try {
    const { advertisementId } = req.params;

    const { advertisementTitle, redirectUrl,
      isActive, adLocation, adMemo, currentUrl } = req.body;


    const advertisementImageUrl = req.file;

    if (!currentUrl) {
      if (!advertisementImageUrl) {
        return res.status(400).json({ message: "광고 이미지를 첨부해 주세요." });
      }
    }

    if (!advertisementTitle || !adLocation || !redirectUrl) {
      return res.status(400).json({ message: "필수 항목을 작성해주세요." });
    }

    const CDN_URL = "https://theiauto.gcdn.ntruss.com";

    if (!currentUrl && advertisementImageUrl) {
      try {
        const adFileExt = path.extname(advertisementImageUrl.originalname).toLowerCase();
        const adFileKey = `advertisement/${Date.now()}_${uuidv4()}${adFileExt}`;

        const adImageParams = {
          Bucket: process.env.NCP_BUCKET,
          Key: adFileKey,
          Body: advertisementImageUrl.buffer,
          ACL: 'public-read',
          ContentType: advertisementImageUrl.mimetype
        };

        const command = new PutObjectCommand(adImageParams);
        await s3.send(command);

        const adImageUrl = `${CDN_URL}/${adFileKey}`;

        const updatedAd = await prisma.advertisement.update({
          where: {
            advertisementId: +advertisementId
          },
          data: {
            advertisementTitle: advertisementTitle,
            adLocation: adLocation,
            adMemo: adMemo,
            advertisementImageUrl: adImageUrl,
            redirectUrl: redirectUrl,
            isActive: isActive === 'true'
          }
        });

        return res.status(201).json(updatedAd);
      } catch (e) {
        console.error(e);
        return res.status(500).json({ message: "광고 이미지 업로드 중 문제가 발생했습니다.", error: e });
      }
    }

    if (currentUrl && !advertisementImageUrl) {
      const updatedAd = await prisma.advertisement.update({
        where: {
          advertisementId: +advertisementId
        },
        data: {
          advertisementTitle,
          adLocation,
          adMemo,
          advertisementImageUrl: currentUrl,
          redirectUrl,
          isActive: isActive === 'true'
        }
      });

      return res.status(201).json(updatedAd);
    }

    return res.status(400).json({ message: "잘못된 요청입니다." });

  } catch (e) {
    console.error(e);
    next(e);
  }
})

advertisementRouter.get('/advertisement', authMiddleware, async (req, res, next) => {
  try {
    const adLists = await prisma.advertisement.findMany({
      select: {
        advertisementId: true,
        advertisementTitle: true,
        advertisementImageUrl: true,
        redirectUrl: true,
        isActive: true,
        clickCount: true,
        adMemo: true,
        adLocation: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return res.status(200).json({ adLists });

  } catch (e) {
    console.error(e);
    next(e);
  }
});

advertisementRouter.delete('/advertisement/:advertisementId', authMiddleware, async (req, res, next) => {
  try {
    const { advertisementId } = req.params;

    if (!advertisementId) {
      return res.status(400).json({ message: "올바르지 않은 요청입니다." });
    }

    const findAd = await prisma.advertisement.findFirst({
      where: {
        advertisementId: +advertisementId
      }
    });
    if (!findAd) return res.status(400).json({ message: "존재하지 않는 광고입니다." });

    await prisma.advertisement.delete({
      where: {
        advertisementId: +advertisementId
      }
    });

    return res.sendStatus(204);
  } catch (e) {
    console.error(e);
    next(e);
  }
});

advertisementRouter.get('/subscribers', authMiddleware, async (req, res, next) => {
  try {
    const findSubscribers = await prisma.subscribeUserInfo.findMany({});

    return res.status(200).json({ subscribers: findSubscribers });
  } catch (e) {
    next(e);
  }
});

export default advertisementRouter;