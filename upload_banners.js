// upload_banners.js
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// .env
const BUCKET = process.env.NCP_BUCKET;
const ENDPOINT = process.env.NCP_S3_ENDPOINT;            // https://kr.object.ncloudstorage.com
const ACCESS_KEY = process.env.NCP_ACCESS_KEY;
const SECRET_KEY = process.env.NCP_SECRET_KEY;
const CDN_PREFIX = process.env.CDN_PREFIX;               // https://theiauto.gcdn.ntruss.com
const LOCAL_BBS_DIR = process.env.LOCAL_BBS_DIR;         // C:/.../bbs_files

if (!BUCKET || !ENDPOINT || !ACCESS_KEY || !SECRET_KEY || !CDN_PREFIX || !LOCAL_BBS_DIR) {
  console.error('❌ .env 설정이 부족합니다. NCP_* / CDN_PREFIX / LOCAL_BBS_DIR 확인하세요.');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'kr-standard',
  endpoint: ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
});

function exists(p) { try { return fs.existsSync(p); } catch { return false; } }

async function s3Exists(Key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key }));
    return true;
  } catch {
    return false;
  }
}

function guessContentType(filename) {
  const f = filename.toLowerCase();
  if (f.endsWith('.png')) return 'image/png';
  if (f.endsWith('.gif')) return 'image/gif';
  if (f.endsWith('.webp')) return 'image/webp';
  if (f.endsWith('.jpg') || f.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

// 배너 문자열에서 로컬 경로/업로드 키 계산
function resolveBannerPaths(banner) {
  // 케이스1: 상대경로 예) "2407/1720681599.jpg"
  if (!banner.startsWith('http')) {
    const rel = banner.replace(/^\/+/, ''); // 앞 슬래시 제거
    const localPath = path.join(LOCAL_BBS_DIR, rel);
    const key = `articles/banner/${rel}`.replace(/\\/g, '/');
    return { rel, localPath, key };
  }

  // 케이스2: 절대경로 예) "http://.../bbs_files/2509/xxxx.jpg"
  const m = banner.match(/bbs_files\/(.+)$/);
  if (m && m[1]) {
    const rel = m[1];
    const localPath = path.join(LOCAL_BBS_DIR, rel);
    const key = `articles/banner/${rel}`.replace(/\\/g, '/');
    return { rel, localPath, key };
  }

  // 그 외는 스킵
  return null;
}

async function uploadFile(localPath, key) {
  const Body = fs.readFileSync(localPath);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body,
    ContentType: guessContentType(localPath),
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  console.log(`UPLOADED s3://${BUCKET}/${key}`);
}

async function main() {
  try {
    console.log('Start banner upload...');

    // 배너 대상 가져오기
    const articles = await prisma.article.findMany({
      where: {
        AND: [
          // 이미 http로 시작하는(CDN/절대경로) 배너는 제외
          { NOT: { articleBanner: { startsWith: 'http' } } },
          // 기본 플레이스홀더도 제외
          { articleBanner: { notIn: ['defaults/banner.jpg', ''] } },
        ]
      },
      select: { articleId: true, articleBanner: true }
    });


    let uploaded = 0, skipped = 0, missing = 0, updated = 0;

    for (const a of articles) {
      const info = resolveBannerPaths(a.articleBanner);
      if (!info) {
        console.warn(`SKIP (unhandled format) articleId=${a.articleId} banner=${a.articleBanner}`);
        skipped++;
        continue;
      }

      const { rel, localPath, key } = info;

      if (!exists(localPath)) {
        console.warn(`MISS local banner: articleId=${a.articleId} local=${localPath}`);
        missing++;
        continue;
      }

      if (!(await s3Exists(key))) {
        await uploadFile(localPath, key);
        uploaded++;
      } else {
        // console.log(`EXIST s3://${BUCKET}/${key}`);
      }

      // DB 치환: http로 이미 되어 있지 않다면 CDN URL로 바꿔줌
      if (!a.articleBanner.startsWith('http')) {
        const newUrl = `${CDN_PREFIX}/${key}`;
        await prisma.article.update({
          where: { articleId: a.articleId },
          data: { articleBanner: newUrl }
        });
        updated++;
        console.log(`UPDATED DB banner → ${newUrl} (articleId=${a.articleId})`);
      }
    }

    console.log(`Done banner upload. uploaded=${uploaded}, missing=${missing}, dbUpdated=${updated}, skipped=${skipped}`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
