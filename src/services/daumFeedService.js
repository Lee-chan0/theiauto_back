// src/services/daumFeedService.js
import createDaumAxios from '../lib/daumClient.js';
import { PrismaClient } from '@prisma/client';
import FormData from 'form-data';
// ⬇️ 아래 유틸은 3단계에서 만들었어. 아직 없다면 먼저 생성 후 주석 해제해서 사용해.
// import { transformBodyHtmlForKakao } from '../utils/daumBodyHtml.js';

const prisma = new PrismaClient();

// ---------- 공통 유틸 ----------
function toIsoOffsetKst(date) {
  // 예: 2024-11-27T14:00:00.000+09:00
  const d = new Date(date);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace('Z', '+09:00');
}

function articleUrl(article) {
  const raw = process.env.FRONT_BASE_URL || 'http://localhost:3000';
  const base = raw.endsWith('/') ? raw.slice(0, -1) : raw;
  return `${base}/news/${article.articleId}`;
}

function ensureContentId(article) {
  if (article.daumContentId && article.daumContentId.trim()) return article.daumContentId.trim();
  return `theiauto-${article.articleId}`;
}

// ---------- 1) JSON 페이로드 빌드 ----------
function buildDaumPayload(article, options = {}) {
  const {
    enableComment = (process.env.DAUM_ENABLE_COMMENT_DEFAULT === 'true'),
    related = [], // [{title, url}]
    externalUrl = articleUrl(article),
    bodyHtml: overrideBodyHtml,
  } = options;

  const categories = article.category?.categoryName ? [article.category.categoryName] : [];

  const writers = [];
  if (article.admin?.name && article.admin?.email) {
    writers.push({ name: article.admin.name, email: article.admin.email });
  } else {
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
      related: related.slice(0, 10),
    },
    writers,
    bodyHtml: (overrideBodyHtml ?? article.articleContent) || '<p></p>',
    createdDate: toIsoOffsetKst(created),
    modifiedDate: toIsoOffsetKst(modified),
    enableComment,
  };
}

// ---------- 2) JSON 전송 (/api/v1/contents/feed) ----------
export async function pushArticleJson(env = 'prod', articleId) {
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

  const payload = buildDaumPayload(article);

  try {
    const res = await client.post('/api/v1/contents/feed', payload, {
      headers: { 'Content-Type': 'application/json' },
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

  // ⚠️ 3단계 반영: 본문을 업로드 파일과 동기화하려면 utils를 만들고 주석 해제
  // const transformedHtml = transformBodyHtmlForKakao(article.articleContent, files);
  // const payload = buildDaumPayload(article, { bodyHtml: transformedHtml });

  // (utils를 아직 안 만들었다면 기존 본문 그대로 전송)
  const payload = buildDaumPayload(article);

  const form = new FormData();
  form.append('request', JSON.stringify(payload), { contentType: 'application/json' });

  (files || []).forEach((f) => {
    form.append('files', f.buffer, {
      filename: f.originalname,
      contentType: f.mimetype || 'application/octet-stream',
    });
  });

  try {
    const res = await client.post('/api/v1/contents/feed/file', form, {
      headers: form.getHeaders(),
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
  const { contentId, uuid, status, previewUrl } = res.data || {};

  const article = await prisma.article.findFirst({
    where: { OR: [{ daumUuid: uuid || '' }, { daumContentId: contentId || '' }] },
  });
  if (article) {
    await prisma.article.update({
      where: { articleId: article.articleId },
      data: {
        daumStatus: status || null,
        daumPreviewPath: previewUrl || null,
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

// ---------- 인증 확인 ----------
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
