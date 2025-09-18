// upload_content_images.js
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import mime from 'mime';
import {
  S3Client,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

dotenv.config();

const prisma = new PrismaClient();

// ===== NCP S3 설정 =====
const CDN_PREFIX = (process.env.CDN_PREFIX || '').replace(/\/+$/, '');
const BUCKET = process.env.NCP_BUCKET;
const REGION = process.env.NCP_REGION || 'kr-standard';
const ENDPOINT = process.env.NCP_ENDPOINT || 'https://kr.object.ncloudstorage.com';

// ★ 로컬 절대경로(필수) - 기존 자료 폴더
//   예) LOCAL_CONTENT_DIR=C:\Users\me\Desktop\contentImgTmp
//       LOCAL_BBS_DIR=C:\Users\me\Desktop\bbs_files
const LOCAL_BBS_DIR = process.env.LOCAL_BBS_DIR || '';
const LOCAL_CONTENT_DIR = process.env.LOCAL_CONTENT_DIR || '';

const s3 = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,           // https://kr.object.ncloudstorage.com
  forcePathStyle: true,         // NCP 권장
  credentials: {
    accessKeyId: process.env.NCP_ACCESS_KEY,
    secretAccessKey: process.env.NCP_SECRET_KEY,
  },
});

// ===== 유틸 =====
function toS3Key(...parts) {
  return parts.join('/').replace(/\\/g, '/').replace(/\/{2,}/g, '/');
}

// URL을 로컬 상대 서브경로로 정규화
function normalizeLegacyPath(url) {
  if (!url) return null;
  let u = String(url).trim();

  // 쿼리스트링 제거
  u = u.split('?')[0];

  // 절대 URL -> 경로만 남기기
  // theiauto.easeplus.com, theiauto.com 등 호스트 제거
  u = u.replace(/^https?:\/\/[^/]+\/+/i, '');

  // 선행 public/ 제거
  u = u.replace(/^public\/+/i, '');

  // 앞의 슬래시 제거
  u = u.replace(/^\/+/, '');

  // 결과 예)
  //  - contentImgTmp/1204/1204/IMGxxxxx.jpg
  //  - bbs_files/1708/_xxxxx.jpg
  //  - 1708/_xxxxx.jpg
  return u;
}

// 실제 로컬 파일 경로 찾기 (contentImgTmp 우선, 그 다음 bbs_files도 확인)
function resolveLocalPath(src) {
  const norm = normalizeLegacyPath(src);
  if (!norm) return null;

  const cands = [];

  // contentImgTmp 경로
  if (LOCAL_CONTENT_DIR) {
    if (norm.toLowerCase().startsWith('contentimgtmp/')) {
      cands.push(path.join(LOCAL_CONTENT_DIR, norm.slice('contentImgTmp/'.length)));
    } else {
      // 폴더 접두가 없고, 보통 contentImgTmp 쪽 구조(예: 1204/1204/IMG....)라면 그대로 시도
      cands.push(path.join(LOCAL_CONTENT_DIR, norm));
    }
  }

  // bbs_files 경로도 시도 (혹시 본문 안에 bbs_files가 박혀있을 수도)
  if (LOCAL_BBS_DIR) {
    if (norm.toLowerCase().startsWith('bbs_files/')) {
      cands.push(path.join(LOCAL_BBS_DIR, norm.slice('bbs_files/'.length)));
    } else {
      cands.push(path.join(LOCAL_BBS_DIR, norm));
    }
  }

  for (const p of cands) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function uploadContentImage(articleId, srcUrl) {
  const localPath = resolveLocalPath(srcUrl);
  if (!localPath) {
    console.warn(`⚠️ 본문 이미지 로컬 파일 없음: ${srcUrl}`);
    return null;
  }

  const fileName = path.basename(localPath);
  const key = toS3Key('articles', String(articleId), 'content', fileName);

  const body = fs.readFileSync(localPath);
  const contentType = mime.getType(fileName) || 'application/octet-stream';

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ACL: 'public-read',
      ContentType: contentType,
    })
  );

  // 최종 URL
  return CDN_PREFIX
    ? `${CDN_PREFIX}/${key}`
    : `${ENDPOINT.replace(/^https?:\/\//, 'https://')}/${BUCKET}/${key}`;
}

async function processOneArticle(article) {
  const $ = cheerio.load(article.articleContent || '', { decodeEntities: false });

  let changed = false;
  const imgNodes = $('img');

  for (let i = 0; i < imgNodes.length; i++) {
    const node = imgNodes[i];
    const oldSrc = $(node).attr('src') || '';
    if (!oldSrc) continue;

    // 대상 판별:
    // - contentImgTmp 경로
    // - bbs_files 경로
    // - 또는 예전 도메인 아래 public/contentImgTmp/... 경로
    const inScope =
      /contentimgtmp|bbs_files|public\/contentimgtmp/i.test(oldSrc) ||
      /theiauto\.(easeplus|com)\.?\w*\/(public\/)?contentimgtmp/i.test(oldSrc);

    if (!inScope) {
      continue; // 외부 완전 타 도메인/이미지면 건드리지 않음
    }

    try {
      const newUrl = await uploadContentImage(article.articleId, oldSrc);
      if (newUrl) {
        $(node).attr('src', newUrl);
        changed = true;
        console.log(`✅ content img updated: ${oldSrc} → ${newUrl} (articleId=${article.articleId})`);
      } else {
        // 로컬 못찾으면 스킵
      }
    } catch (e) {
      console.error(`FAIL content img upload (articleId=${article.articleId}) src=${oldSrc}`, e);
    }
  }

  if (changed) {
    const newHtml = $.html();
    await prisma.article.update({
      where: { articleId: article.articleId },
      data: { articleContent: newHtml },
    });
  }
}

async function main() {
  console.log('Start content images upload...');

  // 후보: 본문에 구이미지 경로가 포함된 기사들만
  // (contains는 간단한 텍스트 포함 검사)
  const BATCH = 300;
  let skip = 0;

  while (true) {
    const articles = await prisma.article.findMany({
      where: {
        OR: [
          { articleContent: { contains: 'contentImgTmp' } },
          { articleContent: { contains: 'bbs_files' } },
          { articleContent: { contains: 'public/contentImgTmp' } },
          { articleContent: { contains: 'theiauto.easeplus.com' } },
          { articleContent: { contains: 'theiauto.com' } },
        ],
      },
      select: { articleId: true, articleContent: true },
      take: BATCH,
      skip,
      orderBy: { articleId: 'asc' },
    });

    if (!articles.length) break;

    for (const a of articles) {
      await processOneArticle(a);
    }

    skip += articles.length;
    console.log(`...processed ${skip} articles so far`);
  }

  console.log('Done content images upload.');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
