import prisma from "./prisma.js"

export const newsByCategory = async (category) => {
  try {
    const articles = await prisma.article.findMany({
      where: {
        articleStatus: 'publish',
        category: {
          parentCategoryId: {
            not: null
          },
          categoryName: category
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
      take: 4
    });

    return articles;
  } catch (e) {
    console.error(e);
  }
}