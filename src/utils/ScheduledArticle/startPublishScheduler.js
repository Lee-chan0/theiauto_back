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

          const r = await pushArticleJson('prod', articleId, {
            enableComment: process.env.DAUM_ENABLE_COMMENT_DEFAULT === 'true',
          });

          if (r?.ok) {
            console.log(
              `다음 기사 송고 SUCCESS | action=SCHEDULE_PUSH articleId=${articleId} contentId=${r?.payloadPreview?.contentId || ''} uuid=${r?.data?.uuid || ''} status=${r?.data?.status || ''}`
            );
          } else {
            console.error(
              `다음 기사 송고 FAILED | action=SCHEDULE_PUSH articleId=${articleId} status=${r?.status || ''} error=${r?.data?.message || ''}`
            );
          }

        } catch (err) {
          console.error('[Scheduler publish/push failed]', articleId, err?.message);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, { timezone: 'Asia/Seoul' });
}