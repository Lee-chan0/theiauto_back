// index.js
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { PrismaClient } from '@prisma/client';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';

dotenv.config();

const prisma = new PrismaClient();
const BATCH_SIZE = 200;

const src = await mysql.createPool({
  host: process.env.SRC_DB_HOST,
  user: process.env.SRC_DB_USER,
  password: process.env.SRC_DB_PASS,
  database: process.env.SRC_DB_NAME,
  port: +(process.env.SRC_DB_PORT || 3306),
  charset: 'euckr',
  multipleStatements: false,
});

await src.query('SET NAMES euckr');

const CDN_PREFIX = process.env.CDN_PREFIX || '';
const UPLOAD_IMAGES = (process.env.UPLOAD_IMAGES || 'false') === 'true';

// Buffer → string 강제 변환
function decodeIfBuffer(val) {
  if (Buffer.isBuffer(val)) {
    return iconv.decode(val, 'euc-kr');
  }
  return val;
}

// 2) assort → 카테고리명 매핑
const assortToCategoryName = {
  news01: '국산차',
  news02: '수입차',
  news03: '신차',
  news04: '업체소개',
  news05: '모터쇼 & 행사',
  life01: '컬쳐',
  motor: '모터스포츠',
  review01: '시승기',
  movie01: '동영상 리뷰',
  qna: 'IT',
  notice: 'theiauto 월간지',
};

// 3) Category name → id 캐시
const catCache = new Map();
async function getCategoryIdByName(name) {
  if (!name) return null;
  if (catCache.has(name)) return catCache.get(name);
  const c = await prisma.category.findFirst({ where: { categoryName: name } });
  if (!c) throw new Error(`Category not found: ${name}`);
  catCache.set(name, c.categoryId);
  return c.categoryId;
}

// 4) Admin 매칭
function splitNameAndRank(raw) {
  if (!raw || typeof raw !== 'string') return { name: null, rank: null };
  let s = raw.trim();
  const eqIdx = s.indexOf('=');
  if (eqIdx !== -1 && eqIdx < s.length - 1) s = s.slice(eqIdx + 1).trim();

  let rank = null;
  if (s.endsWith('편집장')) {
    s = s.replace(/편집장\s*$/, '').trim(); rank = '편집장';
  } else if (s.endsWith('기자')) {
    s = s.replace(/기자\s*$/, '').trim(); rank = '기자';
  }
  return { name: s, rank };
}

async function findAdminIdByNameRank(rawName) {
  const { name, rank } = splitNameAndRank(rawName);

  // 🔧 편집부 계열(예: '편집부', '더아이오토 편집부' 등)은 전부 한창희 편집장으로 매핑
  if (name && name.includes('편집부')) {
    return { adminId: '5ae3ff4b-77e0-4017-a81d-3cab68b93690', meta: null };
  }

  if (!name) return { adminId: null, meta: { name: rawName, reason: 'empty' } };

  const admin = await prisma.admin.findFirst({
    where: { name, ...(rank ? { rank } : {}) },
    select: { adminId: true }
  });

  if (!admin) return { adminId: null, meta: { name, rank, reason: 'not_found' } };
  return { adminId: admin.adminId, meta: null };
}

// 5) 본문 이미지 치환
function rewriteContentImages(html, articleId) {
  if (!html) return html || '';
  const $ = cheerio.load(html, { decodeEntities: false });
  $('img').each((_, img) => {
    const src = $(img).attr('src') || '';
    if (/contentImgTmp|bbs_files/.test(src)) {
      const base = path.basename(src.split('?')[0]);
      const key = `articles/${articleId}/content/${base}`;
      const newUrl = CDN_PREFIX
        ? (CDN_PREFIX.replace(/\/+$/, '') + '/' + key)
        : src;
      $(img).attr('src', newUrl);
    }
  });
  return $.html();
}

// sanity check
async function sanity() {
  const [cnt] = await src.query('SELECT COUNT(*) AS c FROM bbs');
  console.log('>>> sanity: bbs row count =', cnt[0].c);
  const [sample] = await src.query('SELECT no, name, assort, title FROM bbs LIMIT 5');
  console.log('>>> sanity sample:', sample.map(r => ({
    no: r.no,
    name: decodeIfBuffer(r.name),
    assort: r.assort,
    title: decodeIfBuffer(r.title)
  })));
}

async function migrateBatch(offset = 0, limit = BATCH_SIZE) {
  const [rows] = await src.query(
    `SELECT no, name, mail, title, content, sub_title, assort,
            filename, filename3, filename4, filename5, filename6, filename7, filename8,
            wdate
     FROM bbs
     ORDER BY no ASC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  if (!rows.length) return 0;

  const unmatchedAdmins = [];
  const results = [];

  for (const r of rows) {
    // decode 필드 처리
    r.name = decodeIfBuffer(r.name);
    r.title = decodeIfBuffer(r.title);
    r.content = decodeIfBuffer(r.content);
    r.sub_title = decodeIfBuffer(r.sub_title);
    r.filename = decodeIfBuffer(r.filename);
    r.filename3 = decodeIfBuffer(r.filename3);
    r.filename4 = decodeIfBuffer(r.filename4);
    r.filename5 = decodeIfBuffer(r.filename5);
    r.filename6 = decodeIfBuffer(r.filename6);
    r.filename7 = decodeIfBuffer(r.filename7);
    r.filename8 = decodeIfBuffer(r.filename8);

    console.log(`--- migrating old no=${r.no}, name=${r.name}, assort=${r.assort}`);

    try {
      // 1) Admin 매칭
      const { adminId, meta } = await findAdminIdByNameRank(r.name);
      if (!adminId) {
        unmatchedAdmins.push({ no: r.no, ...meta });
        console.warn(`SKIP no=${r.no}: admin not matched`, meta);
        continue;
      }

      // 2) Category
      let categoryName = assortToCategoryName[r.assort];

      // 특별 케이스: "편집부" + assort=notice → theiauto 월간지
      if (r.name === '편집부' && r.assort === 'notice') {
        categoryName = 'theiauto 월간지';
      }

      if (!categoryName) {
        console.warn(`SKIP no=${r.no}: unknown assort=${r.assort}`);
        continue;
      }
      const CategoryId = await getCategoryIdByName(categoryName);

      // 3) Article
      const createdAt = r.wdate ? new Date(r.wdate * 1000) : new Date();
      const article = await prisma.article.create({
        data: {
          articleTitle: r.title || '(제목없음)',
          articleSubTitle: r.sub_title || '',
          articleContent: r.content || '',
          articleStatus: 'publish',
          publishedAt: createdAt,
          isImportant: false,
          isBanner: false,
          views: 0,
          AdminId: adminId,
          CategoryId,
          articleBanner: r.filename
            ? (CDN_PREFIX ? CDN_PREFIX + '/articles/banner/' + r.filename : r.filename)
            : 'defaults/banner.jpg',
          createdAt
        },
        select: { articleId: true }
      });

      // 4) 본문 이미지 URL 치환
      const newContent = rewriteContentImages(r.content || '', article.articleId);

      // 5) Extra Images
      const extras = [r.filename3, r.filename4, r.filename5, r.filename6, r.filename7, r.filename8]
        .filter(Boolean)
        .map((f) => ({
          ArticleId: article.articleId,
          articleImageUrl: CDN_PREFIX ? CDN_PREFIX + '/articles/extra/' + f : f
        }));

      await prisma.$transaction([
        prisma.article.update({
          where: { articleId: article.articleId },
          data: { articleContent: newContent }
        }),
        ...(extras.length ? [prisma.articleImage.createMany({ data: extras })] : [])
      ]);

      results.push({ oldNo: r.no, newId: article.articleId });
      console.log(`OK no=${r.no} → articleId=${article.articleId}`);
    } catch (e) {
      console.error(`FAIL no=${r.no}`, e);
    }
  }

  if (unmatchedAdmins.length) {
    fs.appendFileSync('./unmatched_admins.log', unmatchedAdmins.map(x => JSON.stringify(x)).join('\n') + '\n');
  }
  if (results.length) {
    fs.appendFileSync('./legacy_map.log', results.map(x => JSON.stringify(x)).join('\n') + '\n');
  }

  return rows.length;
}


// async function main() {
//   console.log('Start migration...');
//   await sanity();
//   let offset = 0;
//   while (true) {
//     const n = await migrateBatch(offset, BATCH_SIZE);
//     if (!n) break;
//     offset += n;
//   }
//   console.log('Done.');
//   await prisma.$disconnect();
//   await src.end();
// }

async function migratePartial() {
  console.log('Start partial migration (편집부)…');

  const [rows] = await src.query(
    `SELECT no, name, mail, title, content, sub_title, assort,
            filename, filename3, filename4, filename5, filename6, filename7, filename8,
            wdate
     FROM bbs
     ORDER BY no ASC`
  );

  // decode 후 JS에서 필터링
  const filtered = rows
    .map(r => ({
      ...r,
      name: decodeIfBuffer(r.name),
      title: decodeIfBuffer(r.title),
      content: decodeIfBuffer(r.content),
      sub_title: decodeIfBuffer(r.sub_title),
      filename: decodeIfBuffer(r.filename),
      filename3: decodeIfBuffer(r.filename3),
      filename4: decodeIfBuffer(r.filename4),
      filename5: decodeIfBuffer(r.filename5),
      filename6: decodeIfBuffer(r.filename6),
      filename7: decodeIfBuffer(r.filename7),
      filename8: decodeIfBuffer(r.filename8),
    }))
    // 🔽 이름 조건 + notice만
    .filter(r => (
      r.assort === 'notice' &&
      (
        (r.name && r.name.includes('편집부')) || // '편집부', '더아이오토 편집부' 등
        r.name === '더아이오토' ||
        r.name === '관리자'
      )
    ));

  if (!filtered.length) {
    console.log('No rows found for 편집부/더아이오토/관리자 + notice');
    return;
  }

  // 고정값: 한창희 편집장 / 자식 카테고리 24
  const FIXED_ADMIN_ID = '5ae3ff4b-77e0-4017-a81d-3cab68b93690';
  const FIXED_CATEGORY_ID = 24; // 자식 theiauto 월간지

  for (const r of filtered) {
    console.log(`--- partial migrating no=${r.no}, name=${r.name}, assort=${r.assort}`);

    try {
      const createdAt = r.wdate ? new Date(r.wdate * 1000) : new Date();

      // 🔒 중복 방지: 제목+발행일 동일한 레코드가 이미 24번 카테고리에 있으면 skip
      const dup = await prisma.article.findFirst({
        where: {
          CategoryId: FIXED_CATEGORY_ID,
          articleTitle: r.title || '(제목없음)',
          publishedAt: createdAt,
        },
        select: { articleId: true }
      });
      if (dup) {
        console.log(`SKIP (partial) no=${r.no} → dup articleId=${dup.articleId}`);
        continue;
      }

      const article = await prisma.article.create({
        data: {
          articleTitle: r.title || '(제목없음)',
          articleSubTitle: r.sub_title || '',
          articleContent: r.content || '',
          articleStatus: 'publish',
          publishedAt: createdAt,
          isImportant: false,
          isBanner: false,
          views: 0,
          AdminId: FIXED_ADMIN_ID,      // 🔧 고정
          CategoryId: FIXED_CATEGORY_ID, // 🔧 고정
          articleBanner: r.filename
            ? (CDN_PREFIX ? CDN_PREFIX + '/articles/banner/' + r.filename : r.filename)
            : 'defaults/banner.jpg',
          createdAt
        },
        select: { articleId: true }
      });

      // 본문 이미지 URL 치환
      const newContent = rewriteContentImages(r.content || '', article.articleId);

      // 추가 이미지
      const extras = [r.filename3, r.filename4, r.filename5, r.filename6, r.filename7, r.filename8]
        .filter(Boolean)
        .map((f) => ({
          ArticleId: article.articleId,
          articleImageUrl: CDN_PREFIX ? CDN_PREFIX + '/articles/extra/' + f : f
        }));

      await prisma.$transaction([
        prisma.article.update({
          where: { articleId: article.articleId },
          data: { articleContent: newContent }
        }),
        ...(extras.length ? [prisma.articleImage.createMany({ data: extras })] : [])
      ]);

      console.log(`OK (partial) no=${r.no} → articleId=${article.articleId}`);
    } catch (e) {
      console.error(`FAIL (partial) no=${r.no}`, e);
    }
  }

  console.log('Partial migration Done.');
  await prisma.$disconnect();
  await src.end();
}

migratePartial().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await src.end();
  process.exit(1);
});

// main().catch(async (e) => {
//   console.error(e);
//   await prisma.$disconnect();
//   await src.end();
//   process.exit(1);
// });
