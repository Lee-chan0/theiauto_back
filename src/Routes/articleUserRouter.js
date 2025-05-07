import express from 'express';
import prisma from '../utils/prisma.js';
import { newsByCategory } from '../utils/newsByCategory.js';


const articleUserRouter = express.Router();

articleUserRouter.get('/article/banner', async (req, res, next) => {
  try {
    let recentArticles = [];

    recentArticles = await prisma.article.findMany({
      where: {
        articleStatus: 'publish',
        isBanner: true
      },
      orderBy: {
        bannerTime: 'desc'
      },
      select: {
        articleId: true,
        articleBanner: true,
        articleTitle: true,
        articleSubTitle: true,
        createdAt: true,
        category: {
          select: {
            categoryId: true,
            categoryName: true
          }
        }
      }
    });

    if (recentArticles.length < 3) {
      recentArticles = await prisma.article.findMany({
        where: {
          articleStatus: 'publish',
          category: {
            categoryName: {
              notIn: ['모터스포츠[국내]', '모터스포츠[해외]', '시승기']
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        select: {
          articleId: true,
          articleBanner: true,
          articleTitle: true,
          articleSubTitle: true,
          createdAt: true,
          category: {
            select: {
              categoryId: true,
              categoryName: true
            }
          }
        },
        take: 3
      });
    }

    const motorSportArticle = await prisma.article.findFirst({
      where: {
        articleStatus: 'publish',
        category: {
          categoryName: {
            in: ['모터스포츠[국내]', '모터스포츠[해외]']
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        articleId: true,
        articleBanner: true,
        articleTitle: true,
        articleSubTitle: true,
        createdAt: true,
        category: {
          select: {
            categoryId: true,
            categoryName: true,
          }
        }
      }
    });

    const driveArticle = await prisma.article.findFirst({
      where: {
        articleStatus: 'publish',
        category: {
          categoryName: {
            in: ['시승기']
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        articleId: true,
        articleBanner: true,
        articleTitle: true,
        articleSubTitle: true,
        createdAt: true,
        category: {
          select: {
            categoryId: true,
            categoryName: true,
          }
        }
      }
    });

    const bannerArticles = [
      ...recentArticles,
      ...(motorSportArticle ? [motorSportArticle] : []),
      ...(driveArticle ? [driveArticle] : [])
    ];

    return res.status(200).json({ bannerArticles });
  } catch (e) {
    next(e);
  }
})

articleUserRouter.get('/article/todaynews', async (req, res, next) => {
  try {
    const todayArticles = await prisma.article.findMany({
      where: {
        articleStatus: 'publish',
        category: {
          categoryName: {
            in: ['국산차', '수입차']
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        articleId: true,
        articleBanner: true,
        articleTitle: true,
        createdAt: true,
        category: {
          select: {
            categoryId: true,
            categoryName: true
          }
        }
      },
      take: 6
    });

    return res.status(200).json({ todayArticles });
  } catch (e) {
    next(e);
  }
});

articleUserRouter.get('/article/mortorsports', async (req, res, next) => {
  try {
    const mortorSportArticles = await prisma.article.findMany({
      where: {
        articleStatus: 'publish',
        category: {
          categoryName: {
            in: ['모터스포츠[국내]', '모터스포츠[해외]']
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        articleId: true,
        articleBanner: true,
        articleTitle: true,
        articleSubTitle: true,
        createdAt: true,
        category: {
          select: {
            categoryId: true,
            categoryName: true
          }
        }
      },
      take: 6
    });

    return res.status(200).json({ mortorSportArticles });
  } catch (e) {
    next(e);
  }
})

articleUserRouter.get('/article/drive', async (req, res, next) => {
  try {
    const driveArticles = await prisma.article.findMany({
      where: {
        articleStatus: 'publish',
        category: {
          categoryName: '시승기'
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        articleId: true,
        articleBanner: true,
        articleTitle: true,
        articleSubTitle: true,
        articleContent: true,
        createdAt: true,
      },
      take: 8
    });

    return res.status(200).json({ driveArticles });
  } catch (e) {
    next(e);
  }
})

articleUserRouter.get('/article/newcar', async (req, res, next) => {
  try {
    const newCarArticles = await prisma.article.findMany({
      where: {
        articleStatus: 'publish',
        category: {
          categoryName: '신차'
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        articleId: true,
        articleBanner: true,
        articleTitle: true,
        createdAt: true,
        category: {
          select: {
            categoryId: true,
            categoryName: true
          }
        }
      },
      take: 6
    });

    return res.status(200).json({ newCarArticles });
  } catch (e) {
    next(e);
  }
})

articleUserRouter.get('/article/magazine', async (req, res, next) => {
  try {
    const magazineArticle = await prisma.article.findFirst({
      where: {
        articleStatus: 'publish',
        category: {
          parentCategoryId: {
            not: null
          },
          categoryName: 'theiauto 월간지'
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        articleId: true,
        articleBanner: true,
        articleTitle: true,
        articleSubTitle: true,
        createdAt: true
      }
    })

    res.status(200).json({ magazineArticle });
  } catch (e) {
    next(e);
  }
});

articleUserRouter.get('/article/travel', async (req, res, next) => {
  try {
    const travelArticles = await prisma.article.findFirst({
      where: {
        articleStatus: 'publish',
        category: {
          categoryName: '여행기'
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        articleId: true,
        articleTitle: true,
        articleSubTitle: true,
        articleBanner: true,
        createdAt: true
      }
    })

    return res.status(200).json({ travelArticles });
  } catch (e) {
    next(e);
  }
})

articleUserRouter.get('/article/service', async (req, res, next) => {
  try {
    const serviceArticles = await prisma.article.findMany({
      where: {
        articleStatus: 'publish',
        category: {
          categoryName: '부품 & 서비스'
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        articleId: true,
        articleTitle: true,
        articleBanner: true,
        createdAt: true
      },
      take: 8
    });

    return res.status(200).json({ serviceArticles });
  } catch (e) {
    next(e);
  }
});

articleUserRouter.get('/article/brand', async (req, res, next) => {
  try {
    const ITArticles = await newsByCategory('IT');

    const brandArticles = await newsByCategory('라이프 & 브랜드');

    return res.status(200).json({ ITArticles, brandArticles });
  } catch (e) {
    next(e);
  }
})

articleUserRouter.get('/article/category/:categoryId', async (req, res, next) => {
  try {
    const { categoryId } = req.params;

    const categoryBannerArticle = await prisma.article.findFirst({
      where: { CategoryId: +categoryId },
      orderBy: { createdAt: 'desc' },
      select: {
        articleId: true,
        articleBanner: true,
        articleTitle: true,
        articleSubTitle: true,
        category: {
          select: {
            categoryName: true
          }
        },
        ArticleTag: {
          select: {
            tag: true
          }
        }
      }
    });

    return res.status(200).json({ categoryBannerArticle });

  } catch (e) {
    next(e);
  }
})

articleUserRouter.get('/articles/category/:categoryId', async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const page = +req.query.page || 1;
    const limit = +req.query.limit || 15;
    const skip = page === 1 ? 1 : (page - 1) * limit + 1;

    const categoryArticles = await prisma.article.findMany({
      where: { CategoryId: +categoryId },
      skip: +skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        articleId: true,
        articleBanner: true,
        articleTitle: true,
        articleContent: true,
        createdAt: true,
        ArticleTag: {
          select: {
            tag: true
          }
        }
      }
    })

    const totalCount = await prisma.article.count({
      where: { CategoryId: +categoryId }
    });

    const hasMore = page * limit < totalCount;

    return res.status(200).json({ categoryArticles, hasMore });

  } catch (e) {
    next(e);
  }
})

export default articleUserRouter;