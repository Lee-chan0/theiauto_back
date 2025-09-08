import express from 'express';
import prisma from '../utils/prisma.js';
import { newsByCategory } from '../utils/newsByCategory.js';


const articleUserRouter = express.Router();


articleUserRouter.get('/article/recent', async (req, res, next) => {
  try {
    const findRecentArticles = await prisma.article.findMany({
      where: {
        articleStatus: 'publish',
        NOT: {
          category: {
            categoryName: '시승기'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        articleId: true,
        articleTitle: true,
        createdAt: true,
        category: {
          select: {
            categoryId: true,
            categoryName: true,
          }
        }
      },
      take: 10
    });

    if (!findRecentArticles) return res.status(400).json({ message: "no result" });

    return res.status(200).json({ recentArticles: findRecentArticles });
  } catch (e) {
    next(e);
  }
})

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
            in: ['모터스포츠']
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

    return res.status(200).json({ todayArticles });
  } catch (e) {
    next(e);
  }
});

articleUserRouter.get('/article/motorsports', async (req, res, next) => {
  try {
    const motorSportArticles = await prisma.article.findMany({
      where: {
        articleStatus: 'publish',
        category: {
          categoryName: {
            in: ['모터스포츠']
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
      take: 4
    });

    const resultArticles = motorSportArticles;

    return res.status(200).json({ resultArticles });
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
        category: {
          select: {
            categoryId: true
          }
        }
      },
      take: 6
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
        category: {
          select: {
            categoryId: true,
          }
        },
        articleId: true,
        articleBanner: true,
        articleContent: true,
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

articleUserRouter.get('/article/magazines', async (req, res, next) => {
  try {
    const magazineArticles = await prisma.article.findMany({
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
        category: {
          select: {
            categoryId: true,
          }
        },
        articleId: true,
        articleBanner: true,
        articleContent: true,
        articleTitle: true,
        articleSubTitle: true,
        createdAt: true
      },
      take: 5
    })

    res.status(200).json({ magazineArticles });
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
        createdAt: true,
        category: {
          select: {
            categoryId: true,
          }
        }
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
          categoryName: '업체소개'
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        articleId: true,
        articleTitle: true,
        articleBanner: true,
        createdAt: true,
        category: {
          select: {
            categoryId: true,
          }
        }
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

    const brandArticles = await prisma.article.findMany({
      where: {
        articleStatus: 'publish',
        category: {
          parentCategoryId: 3
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        articleId: true,
        articleBanner: true,
        articleContent: true,
        articleTitle: true,
        articleSubTitle: true,
        createdAt: true,
        category: {
          select: {
            categoryId: true,
            categoryName: true,
          }
        }
      },
      take: 4
    });

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
        articleContent: true,
        category: {
          select: {
            categoryId: true,
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

    const findArticles = await prisma.article.findMany({
      where: { CategoryId: +categoryId },
      skip: +skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        articleId: true,
        articleBanner: true,
        articleTitle: true,
        articleSubTitle: true,
        articleContent: true,
        createdAt: true,
        category: {
          select: {
            categoryId: true,
            categoryName: true
          }
        },
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

    return res.status(200).json({ findArticles, hasMore });

  } catch (e) {
    next(e);
  }
});

articleUserRouter.get('/article/:articleId', async (req, res, next) => {
  try {
    const { articleId } = req.params;

    const news = await prisma.article.findUnique({
      where: {
        articleId: +articleId,
        articleStatus: 'publish'
      },
      select: {
        admin: {
          select: {
            adminId: true,
            profileImg: true,
            rank: true,
            name: true,
            email: true,
          }
        },
        category: {
          select: {
            categoryId: true,
            categoryName: true,
          }
        },
        articleId: true,
        articleBanner: true,
        articleTitle: true,
        articleSubTitle: true,
        articleContent: true,
        createdAt: true,
        ArticleImage: {
          select: {
            articleImageId: true,
            articleImageUrl: true
          }
        },
        ArticleTag: {
          select: {
            tag: true
          }
        }
      }
    });

    return res.status(200).json({ news });
  } catch (e) {
    next(e);
  }
})

articleUserRouter.get('/article/:articleId/related', async (req, res, next) => {
  try {
    const { articleId } = req.params;

    const findArticle = await prisma.article.findUnique({
      where: {
        articleId: +articleId
      },
      include: {
        ArticleTag: true
      },
    });

    const tagIds = findArticle.ArticleTag.map((tag) => tag.TagId);

    const findRelateArticles = await prisma.article.findMany({
      where: {
        articleId: {
          not: +articleId
        },
        articleStatus: 'publish',
        ArticleTag: {
          some: {
            TagId: {
              in: tagIds
            }
          }
        }
      },
      select: {
        articleId: true,
        articleTitle: true,
        articleBanner: true,
        createdAt: true,
        category: {
          select: {
            categoryName: true
          }
        }
      },
      take: 4,
      orderBy: {
        createdAt: 'desc'
      }
    })

    return res.status(200).json({ findRelateArticles })

  } catch (e) {
    next(e);
  }
});




articleUserRouter.get('/search', async (req, res, next) => {
  try {
    const { keyword } = req.query;
    const page = +req.query.page || 1;
    const limit = +req.query.limit || 15;
    const skip = page === 1 ? 1 : (page - 1) * limit + 1;

    if (typeof keyword !== 'string') {
      return res.status(400).json({ message: "검색어가 유효하지 않습니다." });
    }

    const findArticles = await prisma.article.findMany({
      where: {
        articleStatus: 'publish',
        OR: [
          {
            articleTitle: { contains: keyword }
          },
          {
            articleSubTitle: { contains: keyword }
          },
          {
            ArticleTag: {
              some: {
                tag: {
                  is: {
                    tagName: { contains: keyword }
                  }
                }
              }
            }
          }
        ]
      },
      skip: +skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        articleId: true,
        articleBanner: true,
        articleTitle: true,
        articleSubTitle: true,
        articleContent: true,
        createdAt: true,
        category: {
          select: {
            categoryId: true,
            categoryName: true,
          }
        },
        ArticleTag: {
          select: {
            tag: true
          }
        }
      }
    })

    const totalCount = await prisma.article.count({
      where: {
        articleStatus: 'publish',
        OR: [
          {
            articleTitle: { contains: keyword }
          },
          {
            articleSubTitle: { contains: keyword }
          },
          {
            ArticleTag: {
              some: {
                tag: {
                  is: {
                    tagName: { contains: keyword }
                  }
                }
              }
            }
          }
        ]
      }
    });

    const hasMore = page * limit < totalCount;

    if (findArticles.length === 0) {
      const getRandomArticle = (array, n) => {
        const shuffled = array.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, n);
      }

      const recentArticles = await prisma.article.findMany({
        where: {
          articleStatus: 'publish',
          category: {
            categoryName: {
              notIn: ['theiauto 월간지']
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        select: {
          articleId: true,
          articleTitle: true,
          articleBanner: true,
          createdAt: true,
          category: {
            select: {
              categoryId: true,
              categoryName: true,
            }
          }
        },
        take: 30
      });

      const randomArticles = getRandomArticle(recentArticles, 5);

      return res.status(200).json({ randomArticles });
    }

    return res.status(200).json({ findArticles, hasMore });
  } catch (e) {
    next(e);
  }
})


export default articleUserRouter;