import createDaumAxios from '../lib/daumClient.js';
import { PrismaClient } from '@prisma/client';
import FormData from 'form-data';

const prisma = new PrismaClient();

// ---------- 공통 유틸 ----------
function toIsoOffsetKst(date) {
  // 카카오 예시: 2024-11-27T14:00:00.000+09:00
  const d = new Date(date);
  // toLocaleString으로 오프셋까지 포맷하기 번거로우니, 간단히 toISOString 후 +09:00로 치환 (불확실: 서버 TZ가 KST가 아닐 수 있음)
  const iso = d.toISOString(); // UTC
  // 2025-09-18T05:44:07.472Z → 2025-09-18T14:44:07.472+09:00 (KST 가정)
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const s = kst.toISOString().replace('Z', '+09:00');
  return s;
}

function articleUrl(article) {
  // (불확실한 정보) 예시 라우팅: /news/:id
  const base = process.env.FRONT_BASE_URL || 'http://localhost:3000';
  return `${base}/news/${article.articleId}`;
}

function ensureContentId(article) {
  // 이미 수동 지정된 경우 우선
  if (article.daumContentId && article.daumContentId.trim()) return article.daumContentId.trim();
  // 미지정이면 규칙 생성: theiauto-<articleId>
  return `theiauto-${article.articleId}`;
}

// ---------- 1) JSON 페이로드 빌드 ----------
function buildDaumPayload(article, options = {}) {
  const {
    enableComment = (process.env.DAUM_ENABLE_COMMENT_DEFAULT === 'true'),
    related = [], // [{title, url}]
    externalUrl = articleUrl(article),
  } = options;

  // 대표 카테고리: Category.categoryName 1개만
  const categories = article.category?.categoryName ? [article.category.categoryName] : [];

  // 작성자: Admin.name + Admin.email 필수
  const writers = [];
  if (article.admin?.name && article.admin?.email) {
    writers.push({
      name: article.admin.name,
      email: article.admin.email,
    });
  } else {
    // 안전장치: 없으면 공용 이메일로 대체 (불확실한 정보)
    writers.push({ name: '더 아이오토', email: 'info@theiauto.co.kr' });
  }

  const created = article.publishedAt || article.createdAt || new Date();
  const modified = article.updatedAt || created;

  return {
    contentId: ensureContentId(article),
    title: article.articleTitle?.slice(0, 500) || '(제목 없음)',
    subtitle: (article.articleSubTitle || '').slice(0, 500),
    categories,
    links: {
      external: { url: externalUrl },
      related: related.slice(0, 10), // 최대 10개
    },
    writers, // 1명 이상 필수
    bodyHtml: article.articleContent || '<p></p>', // 이미 HTML 저장되어 있다고 가정
    createdDate: toIsoOffsetKst(created),
    modifiedDate: toIsoOffsetKst(modified),
    enableComment, // true/false
  };
}

// ---------- 2) JSON 전송 (/api/v1/contents/feed) ----------
export async function pushArticleJson(env = 'prod', articleId) {
  // 운영 안전장치
  if (env === 'prod') {
    const a = await prisma.article.findUnique({ where: { articleId } });
    if (!a) throw new Error('Article not found');
    if (a.articleStatus !== 'publish') {
      throw new Error('운영 전송은 articleStatus=publish만 허용합니다.');
    }
  }

  const client = createDaumAxios(env);
  // 관계 포함 조회
  const article = await prisma.article.findUnique({
    where: { articleId },
    include: {
      admin: true,
      category: true,
      ArticleImage: true,
    },
  });
  if (!article) throw new Error('Article not found');

  const payload = buildDaumPayload(article);

  try {
    const res = await client.post('/api/v1/contents/feed', payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    // 응답: { contentId, uuid, status, createdDate, errorMessage }
    const { uuid, status } = res.data || {};
    await prisma.article.update({
      where: { articleId },
      data: {
        daumContentId: payload.contentId,
        daumUuid: uuid || null,
        daumStatus: status || null,
        daumLastPushedAt: new Date(),
      },
    });

    return { ok: true, status: res.status, data: res.data, payloadPreview: payload };
  } catch (err) {
    const status = err?.response?.status || 500;
    const data = err?.response?.data || { message: err.message };
    await prisma.article.update({
      where: { articleId },
      data: {
        daumContentId: payload.contentId,
        daumStatus: 'ERROR',
        daumLastPushedAt: new Date(),
      },
    });
    return { ok: false, status, data, payloadPreview: payload };
  }
}

// ---------- 3) 파일 포함 전송 (/api/v1/contents/feed/file) ----------
export async function pushArticleWithFiles(env = 'prod', articleId, files /* Express(multer) files */) {
  if (env === 'prod') {
    const a = await prisma.article.findUnique({ where: { articleId } });
    if (!a) throw new Error('Article not found');
    if (a.articleStatus !== 'publish') {
      throw new Error('운영 전송은 articleStatus=publish만 허용합니다.');
    }
  }

  const client = createDaumAxios(env);
  const article = await prisma.article.findUnique({
    where: { articleId },
    include: { admin: true, category: true, ArticleImage: true },
  });
  if (!article) throw new Error('Article not found');

  // 본문 내 <img src="파일명"> 형태도 허용됨. 업로드 파일명과 매칭되어야 안전.
  const payload = buildDaumPayload(article);

  const form = new FormData();
  form.append('request', JSON.stringify(payload), { contentType: 'application/json' });

  // files: [{ fieldname:'files', originalname, buffer | path, mimetype }]
  // multer memoryStorage 기준
  (files || []).forEach((f) => {
    form.append('files', f.buffer, {
      filename: f.originalname,
      contentType: f.mimetype || 'application/octet-stream',
    });
  });

  try {
    const res = await client.post('/api/v1/contents/feed/file', form, {
      headers: form.getHeaders(), // Content-Type: multipart/form-data; boundary=...
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const { uuid, status } = res.data || {};
    await prisma.article.update({
      where: { articleId },
      data: {
        daumContentId: payload.contentId,
        daumUuid: uuid || null,
        daumStatus: status || null,
        daumLastPushedAt: new Date(),
      },
    });

    return { ok: true, status: res.status, data: res.data, payloadPreview: payload };
  } catch (err) {
    const status = err?.response?.status || 500;
    const data = err?.response?.data || { message: err.message };
    await prisma.article.update({
      where: { articleId },
      data: {
        daumContentId: payload.contentId,
        daumStatus: 'ERROR',
        daumLastPushedAt: new Date(),
      },
    });
    return { ok: false, status, data, payloadPreview: payload };
  }
}

// ---------- 4) 결과 조회 & 미리보기 경로 저장 ----------
export async function fetchFeedResult(env = 'prod', by /* 'uuid' | 'contentId' */, value) {
  const client = createDaumAxios(env);
  let path;
  if (by === 'uuid') path = `/api/v1/contents/feed/uuid/${value}`;
  else if (by === 'contentId') path = `/api/v1/contents/feed/content-id/${encodeURIComponent(value)}`;
  else throw new Error('by must be uuid or contentId');

  const res = await client.get(path);
  const { contentId, uuid, status, previewUrl, createdDate } = res.data || {};

  // Article 찾아서 업데이트(있을 때만)
  const article = await prisma.article.findFirst({
    where: { OR: [{ daumUuid: uuid || '' }, { daumContentId: contentId || '' }] },
  });
  if (article) {
    await prisma.article.update({
      where: { articleId: article.articleId },
      data: {
        daumStatus: status || null,
        daumPreviewPath: previewUrl || null, // "/api/v1/contents/feed/preview/{uuid}"
      },
    });
  }
  return { ok: true, status: res.status, data: res.data };
}

// ---------- 5) 삭제 ----------
export async function deleteByUuid(env = 'prod', uuid) {
  const client = createDaumAxios(env);
  const res = await client.delete(`/api/v1/contents/feed/uuid/${uuid}`);
  return { ok: true, status: res.status };
}

export async function deleteByContentId(env = 'prod', contentId) {
  const client = createDaumAxios(env);
  const res = await client.delete(`/api/v1/contents/feed/content-id/${encodeURIComponent(contentId)}`);
  return { ok: true, status: res.status };
}

// ---------- 기존 인증 함수(그대로 유지) ----------
export default async function checkAuth(env = 'test', method = 'GET') {
  const client = createDaumAxios(env);
  const url = '/feed/api/check/auth';
  try {
    const upper = method.toUpperCase();
    const res = upper === 'POST' ? await client.post(url) : await client.get(url);
    return { ok: true, status: res.status, data: res.data };
  } catch (err) {
    return {
      ok: false,
      status: err?.response?.status || 500,
      data: err?.response?.data || { message: err.message },
    };
  }
}

