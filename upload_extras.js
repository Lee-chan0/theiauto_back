// upload_extras.js
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import {
  S3Client,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import mime from 'mime'; // npm i mime

dotenv.config();

const prisma = new PrismaClient();
const CDN_PREFIX = (process.env.CDN_PREFIX || '').replace(/\/+$/, '');
const BUCKET = process.env.NCP_BUCKET;      // 예: theiauto-bucket
const REGION = process.env.NCP_REGION;      // kr-standard
const ENDPOINT = process.env.NCP_ENDPOINT;  // https://kr.object.ncloudstorage.com

// ★ 로컬 절대경로(필수)
const LOCAL_BBS_DIR = process.env.LOCAL_BBS_DIR || '';
const LOCAL_CONTENT_DIR = process.env.LOCAL_CONTENT_DIR || '';

const s3 = new S3Client({
  region: REGION,
  endpoint: ENDPOINT, // https://kr.object.ncloudstorage.com
  forcePathStyle: true, // ✅ NCP에서는 이거 켜야 함
  credentials: {
    accessKeyId: process.env.NCP_ACCESS_KEY,
    secretAccessKey: process.env.NCP_SECRET_KEY,
  },
});

// URL을 로컬 상대 subpath로 정규화
function normalizeLegacyPath(url) {
  if (!url) return null;
  let u = String(url).trim();

  // 쿼리스트링 제거
  u = u.split('?')[0];

  // 절대 URL -> 경로만 남기기
  u = u.replace(/^https?:\/\/[^/]+\/+/i, '');

  // 선행 public/ 제거
  u = u.replace(/^public\/+/i, '');

  // 앞의 슬래시 제거
  u = u.replace(/^\/+/, '');

  // 이제 u는 예) "bbs_files/1708/_xxxx.jpg" 또는 "contentImgTmp/2509/2509/IMGxxx.jpg" 또는 "1708/_xxxx.jpg"
  // bbs_files/ 또는 contentImgTmp/ 접두어가 없으면 그대로(subpath) 사용
  return u;
}

// 실제 로컬 파일 경로 찾기
function resolveExtraPath(url) {
  const norm = normalizeLegacyPath(url);
  if (!norm) return null;

  // norm이 "bbs_files/1708/_xxx.jpg" 인 경우도 있고 "1708/_xxx.jpg" 인 경우도 있음
  const candidates = [];

  if (LOCAL_BBS_DIR) {
    if (norm.toLowerCase().startsWith('bbs_files/')) {
      candidates.push(path.join(LOCAL_BBS_DIR, norm.slice('bbs_files/'.length)));
    } else {
      candidates.push(path.join(LOCAL_BBS_DIR, norm));
    }
  }

  if (LOCAL_CONTENT_DIR) {
    if (norm.toLowerCase().startsWith('contentimgtmp/')) {
      candidates.push(path.join(LOCAL_CONTENT_DIR, norm.slice('contentImgTmp/'.length)));
    } else {
      candidates.push(path.join(LOCAL_CONTENT_DIR, norm));
    }
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // 디버그: 어디를 찾았는지 찍고 싶으면 주석 해제
  // console.log('MISS:', url, '=>', candidates);
  return null;
}

// 윈도우 경로 -> S3 키(항상 /)
function toS3Key(...parts) {
  return parts.join('/').replace(/\\/g, '/').replace(/\/{2,}/g, '/');
}

async function uploadExtraImage(articleId, imgUrl) {
  const localPath = resolveExtraPath(imgUrl);
  if (!localPath) {
    console.warn(`⚠️ 로컬 파일 없음: ${imgUrl}`);
    return null;
  }

  const fileName = path.basename(localPath);
  const key = toS3Key('articles', String(articleId), 'extra', fileName);

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

  return CDN_PREFIX ? `${CDN_PREFIX}/${key}` : `${ENDPOINT.replace(/^https?:\/\//, 'https://')}/${BUCKET}/${key}`;
}

async function main() {
  console.log('Start extra images upload...');

  const images = await prisma.articleImage.findMany({
    where: {
      AND: [
        // 아직 CDN/http로 시작하지 않는 것만
        { NOT: { articleImageUrl: { startsWith: 'http' } } },
        // 빈값/디폴트 제외
        {
          OR: [
            { articleImageUrl: { not: '' } },
            { articleImageUrl: { not: 'defaults/noimage.jpg' } },
            { articleImageUrl: { not: null } },
          ],
        },
      ],
    },
    select: { articleImageId: true, ArticleId: true, articleImageUrl: true },
  });

  console.log(`총 ${images.length}개 extra 이미지 처리`);

  let success = 0;
  for (const img of images) {
    try {
      const newUrl = await uploadExtraImage(img.ArticleId, img.articleImageUrl);
      if (newUrl) {
        await prisma.articleImage.update({
          where: { articleImageId: img.articleImageId },
          data: { articleImageUrl: newUrl },
        });
        console.log(`✅ Updated extra image: ${newUrl} (articleId=${img.ArticleId})`);
        success++;
      }
    } catch (e) {
      console.error(`FAIL extra image id=${img.articleImageId}`, e);
    }
  }

  console.log(`완료: ${success}/${images.length} 업데이트됨`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
