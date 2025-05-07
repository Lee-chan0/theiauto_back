import cron from 'node-cron';
import prisma from '../prisma.js';

export function startPublishScheduler() {
  cron.schedule('* * * * *', async () => {
    const now = new Date();

    try {
      const dateByPublish = await prisma.article.findMany({
        where: {
          articleStatus: 'scheduled',
          publishedAt: { lte: now }
        }
      });

      for (const article of dateByPublish) {
        await prisma.article.update({
          where: { articleId: article.articleId },
          data: {
            articleStatus: 'publish'
          }
        });
      }

    } catch (e) {
      console.error(e);
    }
  })
}