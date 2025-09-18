import cron from 'node-cron';
import prisma from '../prisma.js';
import { pushArticleJson } from '../../services/daumFeedService.js'; // ⬅️ 추가

export function startPublishScheduler() {
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    try {
      const targets = await prisma.article.findMany({
        where: { articleStatus: 'scheduled', publishedAt: { lte: now } },
        select: { articleId: true },
      });

      for (const { articleId } of targets) {
        try {
          await prisma.article.update({
            where: { articleId },
            data: { articleStatus: 'publish' },
          });

          await pushArticleJson('prod', articleId);
        } catch (err) {
          console.error('[Scheduler publish/push failed]', articleId, err?.message);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, { timezone: 'Asia/Seoul' });
}