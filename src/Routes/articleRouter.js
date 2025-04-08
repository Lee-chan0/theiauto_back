import express from 'express';
import prisma from '../utils/prisma.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { upload } from '../middlewares/fileUploader.js';
import { deleteImage } from '../utils/deleteImage.js';
import { isArray } from '../utils/isArray.js';
import { articleSchema } from '../Validation/articleValidate.js';
import { bannerImageUpload } from '../utils/bannerImageUpload.js';
import { articleImageUpload } from '../utils/articleImageUpload.js';
import { articleContentImgUpload } from '../utils/articleContentImgUpload.js';

const articleRouter = express.Router();

const CDN_URL = 'https://pnkokogkwsgf27818223.gcdn.ntruss.com';

articleRouter.get('/article/important', authMiddleware, async (req, res, next) => {
  try {
    const page = +req.query.page || 1;
    const limit = +req.query.limit || 15;

    const offset = (page - 1) * limit;

    const findImportantArticle = await prisma.article.findMany({
      where: {
        isImportant: true
      },
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        articleId: true,
        articleTitle: true,
        isImportant: true,
        createdAt: true,
        category: {
          select: {
            categoryName: true
          }
        },
        admin: {
          select: {
            name: true,
            rank: true,
          }
        }
      }
    });

    const total = await prisma.article.count({ where: { isImportant: true } });

    return res.status(201).json({
      filteredArticles: findImportantArticle, total, page,
      totalPage: Math.ceil(total / limit)
    })
  } catch (e) {
    next(e);
  }
})

articleRouter.get('/article/category/:categoryId', authMiddleware, async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const page = +req.query.page || 1;
    const limit = +req.query.limit || 15;
    console.log(categoryId);

    const offset = (page - 1) * limit;

    if (categoryId !== "none" || categoryId === undefined) {
      const filteredArticles = await prisma.article.findMany({
        where: {
          CategoryId: +categoryId
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          articleId: true,
          articleTitle: true,
          isImportant: true,
          createdAt: true,
          category: {
            select: {
              categoryName: true
            }
          },
          admin: {
            select: {
              name: true,
              rank: true
            }
          }
        }
      });

      const total = await prisma.article.count({
        where: {
          CategoryId: +categoryId
        }
      });

      res.status(201).json({
        filteredArticles, total, page, hasCategory: true,
        totalPage: Math.ceil(total / limit)
      });
    } else {
      const articles = await prisma.article.findMany({
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          articleId: true,
          articleTitle: true,
          isImportant: true,
          createdAt: true,
          category: {
            select: {
              categoryName: true
            }
          },
          admin: {
            select: {
              name: true,
              rank: true
            }
          }
        }
      });

      const total = await prisma.article.count();

      res.status(201).json({
        filteredArticles: articles, total, page, hasCategory: false,
        totalPage: Math.ceil(total / limit)
      });
    }
  } catch (e) {
    next(e);
  }
});

articleRouter.post('/article/content', upload.single("file"), authMiddleware, async (req, res, next) => {
  try {
    const contentFile = req.file;
    const userId = req.user;

    let contentByImage;

    try {
      contentByImage = await articleContentImgUpload(contentFile, CDN_URL);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "이미지 업로드 중 문제가 발생했습니다." });
    }

    await prisma.articleContentTempStorage.create({
      data: {
        uploadedBy: userId,
        imageUrls: contentByImage
      }
    });

    return res.status(200).json({ contentByImage });
  } catch (e) {
    console.error(e);
    next(e);
  }
});

articleRouter.post('/article', upload.fields([
  { name: "file", maxCount: 1 },
  { name: "files", maxCount: 30 }
]), authMiddleware, async (req, res, next) => {
  try {

    const { error, value } = articleSchema.validate(req.body, { allowUnknown: true });
    if (error) return next(error);

    let { articleTitle, articleSubTitle, articleContent, categoryId, tagName } = value;
    let { needfulDelUrl } = req.body;
    const userId = req.user;

    if (needfulDelUrl) {
      const tempStorage = await prisma.articleContentTempStorage.findMany({
        where: {
          uploadedBy: userId,
          imageUrls: { in: isArray(needfulDelUrl) }
        }
      });
      const ncpDeleteUrls = tempStorage.map((img) => img.imageUrls);
      await deleteImage(ncpDeleteUrls);
    };

    const bannerFile = req.files?.file?.[0];
    const imageFiles = req.files?.files || [];

    if (!bannerFile) return res.status(400).json({ message: "대표 이미지를 넣어주세요." });

    const connectOrCreateTags = await Promise.all(
      isArray(tagName).map((tag) =>
        prisma.tag.upsert({
          where: { tagName: tag },
          update: {},
          create: { tagName: tag },
        })
      )
    )

    let bannerImageUrl;
    try {
      bannerImageUrl = await bannerImageUpload(bannerFile, CDN_URL);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: "배너 이미지 업로드 중 문제가 발생했습니다." });
    }

    const uploadImageUrls = await articleImageUpload(imageFiles, CDN_URL);

    const result = await prisma.$transaction(async (tx) => {
      const createArticle = await tx.article.create({
        data: {
          articleBanner: bannerImageUrl,
          articleTitle,
          articleSubTitle,
          articleContent,
          AdminId: userId,
          CategoryId: +categoryId,
          ArticleImage: {
            create: uploadImageUrls.map((url) => ({
              articleImageUrl: url
            }))
          },
          ArticleTag: {
            create: connectOrCreateTags.map((tag) => ({
              tag: { connect: { tagId: tag.tagId } }
            }))
          },
        },
        include: {
          ArticleImage: true,
          ArticleTag: {
            include: {
              tag: true,
            }
          }
        }
      });

      await tx.articleContentTempStorage.deleteMany({ where: { uploadedBy: userId } });

      return createArticle;
    });

    return res.status(200).json({ message: "기사가 등록되었습니다." });
  } catch (e) {
    console.error(e);
    next(e);
  }
});

articleRouter.patch('/article/:articleId', upload.fields([
  { name: "file", maxCount: 1 },
  { name: "files", maxCount: 30 }
]), authMiddleware, async (req, res, next) => {
  try {
    const { error, value } = articleSchema.validate(req.body, { allowUnknown: true });
    if (error) return next(error);

    const { articleId } = req.params;
    const userId = req.user;

    const findArticle = await prisma.article.findUnique({
      where: { articleId: +articleId }
    });

    const findUser = await prisma.admin.findUnique({ where: { adminId: userId } });

    if (!findArticle) { return res.status(400).json({ message: "존재하지 않는 기사입니다." }) }

    if (findUser.rank !== '편집장') {
      if (findArticle.AdminId !== userId) {
        return res.status(403).json({ message: "수정할 수 있는 권한이 없습니다." });
      };
    }

    let { articleTitle, articleSubTitle,
      articleContent, categoryId,
      tagName } = value;
    let { articleBanner, articleImageUrl } = req.body;

    articleImageUrl = articleImageUrl ? isArray(articleImageUrl) : [];

    let bannerImageUrl;

    let { needfulDelUrl } = req.body;

    if (needfulDelUrl) await deleteImage(isArray(needfulDelUrl));

    const connectOrCreateTags = await Promise.all(
      isArray(tagName).map((tag) =>
        prisma.tag.upsert({
          where: { tagName: tag },
          update: {},
          create: { tagName: tag },
        })
      )
    )

    const imageFiles = req.files?.files || [];
    if (imageFiles.length !== 0) {
      const uploadImageUrls = await articleImageUpload(imageFiles, CDN_URL);
      articleImageUrl = [...articleImageUrl, ...uploadImageUrls];
    }

    if (!articleBanner) {
      articleBanner = req.files?.file?.[0];

      if (!articleBanner) return res.status(400).json({ message: "배너 이미지를 업로드 해주세요." })

      bannerImageUrl = await bannerImageUpload(articleBanner, CDN_URL);
    }

    const updateArticle = await prisma.$transaction(async (tx) => {
      const upadted = await tx.article.update({
        where: { articleId: +articleId },
        data: {
          articleTitle,
          articleSubTitle,
          articleContent,
          articleBanner: bannerImageUrl,
          CategoryId: +categoryId,
          ArticleImage: {
            deleteMany: {},
            create: articleImageUrl.map((url) => ({
              articleImageUrl: url
            }))
          },
          ArticleTag: {
            deleteMany: {},
            create: connectOrCreateTags.map((tag) => ({
              tag: { connect: { tagId: tag.tagId } }
            }))
          }
        },
        include: {
          ArticleImage: true,
          ArticleTag: {
            include: {
              tag: true
            }
          }
        }
      })

      return upadted;
    });

    return res.status(200).json({ message: "수정이 완료되었습니다." });
  } catch (e) {
    console.error(e);
    next(e);
  }
});

articleRouter.get('/article/:articleId', authMiddleware, async (req, res, next) => {
  try {
    const { articleId } = req.params;

    const findArticle = await prisma.article.findUnique({
      where: { articleId: +articleId },
      include: {
        ArticleTag: {
          include: {
            tag: true
          }
        },
        ArticleImage: true
      }
    });

    if (!findArticle) return res.status(400).json(
      { message: "존재하지 않는 기사입니다." });

    return res.status(200).json({ findArticle });
  } catch (e) {
    console.error(e);
    next(e);
  }
});

articleRouter.patch('/article/:articleId/important', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user;
    const { articleId } = req.params;
    const { isImportant } = req.body;
    const findUser = await prisma.admin.findUnique({ where: { adminId: userId } });
    if (!findUser) return res.status(401).json({ message: "존재하지 않는 유저입니다." });

    const findArticle = await prisma.article.findFirst({ where: { articleId: +articleId } });
    if (!findArticle) return res.status(400).json({ message: "존재하지 않는 기사입니다." });

    await prisma.article.update({
      where: { articleId: +articleId },
      data: {
        isImportant: isImportant
      }
    });

    return res.sendStatus(200);
  } catch (e) {
    next(e);
  }
});

articleRouter.get('/search/article', authMiddleware, async (req, res, next) => {
  try {
    const { categoryId, searchQuery } = req.query;
    const page = +req.query.page || 1;
    const limit = +req.query.limit || 15;
    const offset = (page - 1) * limit;

    if (searchQuery.trim() === "") return res.status(401).json({ message: "검색어는 한 글자 이상 작성해주세요." });

    let total;
    let findArticles;

    if (categoryId === "none") {
      findArticles = await prisma.article.findMany({
        where: {
          articleTitle: {
            contains: searchQuery
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        select: {
          articleId: true,
          articleTitle: true,
          isImportant: true,
          createdAt: true,
          category: {
            select: {
              categoryName: true
            }
          },
          admin: {
            select: {
              name: true,
              rank: true,
            }
          }
        },
        skip: offset,
        take: limit
      });

      total = await prisma.article.count({
        where: {
          articleTitle: {
            contains: searchQuery
          }
        }
      })
    } else {
      findArticles = await prisma.article.findMany({
        where: {
          CategoryId: +categoryId,
          articleTitle: {
            contains: searchQuery
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        select: {
          articleId: true,
          articleTitle: true,
          isImportant: true,
          createdAt: true,
          category: {
            select: {
              categoryName: true
            }
          },
          admin: {
            select: {
              name: true,
              rank: true,
            }
          }
        },
        skip: offset,
        take: limit
      });

      total = await prisma.article.count({
        where: {
          CategoryId: +categoryId,
          articleTitle: {
            contains: searchQuery
          }
        }
      })
    }

    return res.status(201).json({
      filteredArticles: findArticles, total, page,
      totalPage: Math.ceil(total / limit)
    })
  } catch (e) {
    next(e);
  }
})

export default articleRouter;