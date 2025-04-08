import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';

const prisma = new PrismaClient();

const run = async () => {
  const rawArticles = await fs.readFile('./bbs_article_final.json', 'utf-8');
  const rawImages = await fs.readFile('./bbs_article_image_ready.json', 'utf-8');

  const articles = JSON.parse(rawArticles);
  const images = JSON.parse(rawImages);

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const imageEntry = images[i];

    // wdate → Date 변환
    const createdAt = new Date(parseInt(article.createdAt, 10) * 1000);

    // Article 저장
    const created = await prisma.article.create({
      data: {
        articleTitle: article.articleTitle,
        articleContent: article.articleContent,
        articleSubTitle: article.articleSubTitle,
        articleBanner: article.articleBanner,
        isImportant: article.isImportant,
        views: article.views,
        createdAt,
        AdminId: article.AdminId || '', // 아직 비워둠
        CategoryId: article.CategoryId,
      },
    });

    // ArticleImage 저장 (있다면)
    if (imageEntry && imageEntry.articleImageUrl) {
      let urls;
      try {
        urls = JSON.parse(imageEntry.articleImageUrl); // 문자열 → 배열
      } catch (e) {
        console.warn(`⚠️ 이미지 JSON 파싱 실패 (index ${i})`);
        continue;
      }

      for (const url of urls) {
        await prisma.articleImage.create({
          data: {
            articleImageUrl: url,
            ArticleId: created.articleId,
          },
        });
      }
    }

    console.log(`✅ Article ${i + 1}/${articles.length} inserted`);
  }

  console.log('🎉 모든 기사와 이미지 저장 완료');
  await prisma.$disconnect();
};

run().catch(async (e) => {
  console.error('❌ 삽입 중 오류:', e);
  await prisma.$disconnect();
  process.exit(1);
});

console.log(123);