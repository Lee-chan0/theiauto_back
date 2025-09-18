// src/services/daumFeedService.js
import createDaumAxios from '../lib/daumClient.js';
import { PrismaClient } from '@prisma/client';
import FormData from 'form-data';
// (선택) 본문 이미지/비디오 처리 유틸이 있다면 주석 해제해서 사용
// import { transformBodyHtmlForKakao } from '../utils/daumBodyHtml.js';

const prisma = new PrismaClient();


/* ============================== 공통 유틸 ============================== */


function logDaumSuccess(action, { articleId, contentId, uuid, status }) {
  console.log(
    `다음 기사 송고 SUCCESS | action=${action} articleId=${articleId} contentId=${contentId || ''} uuid=${uuid || ''} status=${status || ''}`
  );
}
function logDaumFailed(action, { articleId, contentId, uuid, status }, err) {
  const msg = err?.response?.data?.errorMessage || err?.message || 'Unknown error';
  console.error(
    `다음 기사 송고 FAILED | action=${action} articleId=${articleId} contentId=${contentId || ''} uuid=${uuid || ''} status=${status || ''} error=${msg}`
  );
}

function toIsoOffsetKst(date) {
  // 예: 2024-11-27T14:00:00.000+09:00
  const d = new Date(date);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace('Z', '+09:00');
}

function articleUrl(article) {
  // 프론트 라우팅이 /news/:id 라고 했으니 고정
  const raw = process.env.FRONT_BASE_URL || 'http://localhost:3000';
  const base = raw.endsWith('/') ? raw.slice(0, -1) : raw;
  return `${base}/news/${article.articleId}`;
}

function ensureContentId(article) {
  if (article.daumContentId && article.daumContentId.trim()) return article.daumContentId.trim();
  return `theiauto-${article.articleId}`;
}

function isPushDisabled() {
  return process.env.DAUM_PUSH_ENABLED === 'false';
}

function isDryRun(qOrOpt) {
  // 라우터에서 req.query 또는 options를 받을 수 있음
  if (!qOrOpt) return process.env.DAUM_DRY_RUN === 'true';

  // 문자열 'true'
  if (typeof qOrOpt === 'object' && qOrOpt !== null) {
    if (qOrOpt.dryRun === 'true') return true;
    // boolean true 지원
    if (qOrOpt.dryRun === true) return true;
  }
  return process.env.DAUM_DRY_RUN === 'true';
}

/** DaumFeedLog에 안전하게 적기(테이블 없거나 권한 없어도 에러 삼킴) */
async function safeLogDaum(entry) {
  try {
    await prisma.daumFeedLog.create({
      data: {
        ArticleId: entry.articleId ?? null,
        contentId: entry.contentId ?? null,
        uuid: entry.uuid ?? null,
        action: entry.action,
        status: entry.status ?? null,
        requestBody: entry.req ? JSON.stringify(entry.req) : null,
        responseBody: entry.res ? JSON.stringify(entry.res) : null,
        errorMessage:
          entry.err
            ? (entry.err?.response?.data?.errorMessage || entry.err?.message || JSON.stringify(entry.err))
            : null,
      },
    });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[DaumFeedLog skipped]', e.message);
    }
  }
}

/* ===== 배너 이미지를 본문 맨 앞 + 대표 이미지로 강제하는 유틸 ===== */

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]));
}

function getFirstImgSrc(html = '') {
  const re = /<img\b[^>]*\bsrc=(['"])(.*?)\1[^>]*>/i;
  const m = re.exec(html);
  return m ? m[2] : null;
}

// bannerUrl을 대표 이미지로 보장:
// - 본문 첫 이미지가 배너가 아니면, 맨 앞에 배너 <img ... data-thumbnail="true">를 주입
// - 첫 이미지가 이미 배너면, 굳이 중복 삽입하지 않음(첫 이미지가 대표로 사용됨)
function ensureBannerAtTop(bodyHtml, bannerUrl, title) {
  const safeBody = bodyHtml || '<p></p>';
  if (!bannerUrl) return safeBody;

  const first = getFirstImgSrc(safeBody);
  const bannerTag = `<img src="${bannerUrl}" alt="${escapeHtml(title || '')}" data-thumbnail="true" />`;

  if (!first) {
    // 이미지가 아예 없는 경우 → 배너를 맨 앞에 삽입
    return `<p>${bannerTag}</p>\n${safeBody}`;
  }

  // 첫 이미지가 이미 배너면 그대로 유지
  if (first === bannerUrl) {
    return safeBody;
  }

  return `<p>${bannerTag}</p>\n${safeBody}`;
}

/* ============================== 페이로드 빌더 ============================== */

function buildDaumPayload(article, options = {}) {
  const {
    enableComment = (process.env.DAUM_ENABLE_COMMENT_DEFAULT === 'true'),
    related = [], // [{ title, url }]
    externalUrl = articleUrl(article),
    bodyHtml: overrideBodyHtml,
  } = options;

  const categories = article.category?.categoryName ? [article.category.categoryName] : [];

  // 작성자 이름 + 직급(공백/트림 안전)
  const baseName = (article.admin?.name || '').toString().trim();
  const rank = (article.admin?.rank || '').toString().trim(); // '편집장' | '기자' 등
  const nameWithRank = rank ? `${baseName} ${rank}` : baseName;

  const writers = [];
  if (baseName && article.admin?.email) {
    writers.push({ name: nameWithRank, email: article.admin.email });
  } else {
    // 이메일이 꼭 필요하므로, 없으면 공용 이메일로
    writers.push({ name: nameWithRank || '더아이오토', email: 'theiauto@naver.com' });
  }

  const created = article.publishedAt || article.createdAt || new Date();
  const modified = article.updatedAt || created;

  // ✅ 본문에 배너(대표 이미지)를 최상단에 강제 주입
  let body = (overrideBodyHtml ?? article.articleContent) || '<p></p>';
  body = ensureBannerAtTop(body, article.articleBanner, article.articleTitle);

  return {
    contentId: ensureContentId(article),
    title: article.articleTitle?.slice(0, 500) || '(제목 없음)',
    subtitle: (article.articleSubTitle || '').slice(0, 500), // ✅ 소제목 포함
    categories,
    links: {
      external: { url: externalUrl },
      related: related.slice(0, 10),
    },
    writers, // 1명 이상 필수
    bodyHtml: body,
    createdDate: toIsoOffsetKst(created),
    modifiedDate: toIsoOffsetKst(modified),
    enableComment,
  };
}

/* ============================== 송고(JSON) ============================== */

export async function pushArticleJson(env = 'prod', articleId, options = {}) {
  // 운영 안전장치: publish만 허용
  if (env === 'prod') {
    const a = await prisma.article.findUnique({ where: { articleId } });
    if (!a) throw new Error('Article not found');
    if (a.articleStatus !== 'publish') {
      throw new Error('운영 전송은 articleStatus=publish만 허용합니다.');
    }
  }

  // 전송 차단 토글
  if (isPushDisabled() && !isDryRun(options)) {
    await safeLogDaum({ action: 'PUSH_JSON', status: 'BLOCKED', articleId });
    return { ok: false, status: 503, data: { message: 'DAUM_PUSH_ENABLED=false' } };
  }

  const client = createDaumAxios(env);
  const article = await prisma.article.findUnique({
    where: { articleId },
    include: { admin: true, category: true, ArticleImage: true },
  });
  if (!article) throw new Error('Article not found');

  // (선택) 본문 가공 유틸이 있다면 적용
  // const transformed = transformBodyHtmlForKakao(article.articleContent);
  // const payload = buildDaumPayload(article, { bodyHtml: transformed, enableComment: options?.enableComment });
  const payload = buildDaumPayload(article, {
    enableComment: options?.enableComment,
    bodyHtml: options?.bodyHtml,
  });

  // DRY-RUN: 실제 호출 안 함
  if (isDryRun(options)) {
    await safeLogDaum({
      action: 'PUSH_JSON',
      status: 'DRY_RUN',
      articleId,
      contentId: payload.contentId,
      req: { payload },
    });
    return { ok: true, status: 200, data: { message: 'DRY_RUN', payload }, payloadPreview: payload };
  }

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

    await safeLogDaum({
      action: 'PUSH_JSON',
      status: status || null,
      articleId,
      contentId: payload.contentId,
      uuid,
      req: { payload },
      res: res.data,
    });

    logDaumSuccess('PUSH_JSON', { articleId, contentId: payload.contentId, uuid, status });

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

    await safeLogDaum({
      action: 'PUSH_JSON',
      status: 'ERROR',
      articleId,
      contentId: payload.contentId,
      err,
      req: { payload },
      res: data,
    });

    logDaumFailed('PUSH_JSON', { articleId, contentId: payload.contentId, uuid: null, status: null }, err);

    return { ok: false, status, data, payloadPreview: payload };
  }
}

/* ============================== 송고(파일 포함) ============================== */

export async function pushArticleWithFiles(env = 'prod', articleId, files /* multer files */, options = {}) {
  if (env === 'prod') {
    const a = await prisma.article.findUnique({ where: { articleId } });
    if (!a) throw new Error('Article not found');
    if (a.articleStatus !== 'publish') {
      throw new Error('운영 전송은 articleStatus=publish만 허용합니다.');
    }
  }

  if (isPushDisabled() && !isDryRun(options)) {
    await safeLogDaum({ action: 'PUSH_FILE', status: 'BLOCKED', articleId });
    return { ok: false, status: 503, data: { message: 'DAUM_PUSH_ENABLED=false' } };
  }

  const client = createDaumAxios(env);
  const article = await prisma.article.findUnique({
    where: { articleId },
    include: { admin: true, category: true, ArticleImage: true },
  });
  if (!article) throw new Error('Article not found');

  // (선택) 업로드 파일과 bodyHtml 동기화
  // const transformedHtml = transformBodyHtmlForKakao(article.articleContent, files);
  // const payload = buildDaumPayload(article, { bodyHtml: transformedHtml, enableComment: options?.enableComment });
  const payload = buildDaumPayload(article, {
    enableComment: options?.enableComment,
    bodyHtml: options?.bodyHtml,
  });

  // DRY-RUN일 때는 실제 전송하지 않음
  if (isDryRun(options)) {
    await safeLogDaum({
      action: 'PUSH_FILE',
      status: 'DRY_RUN',
      articleId,
      contentId: payload.contentId,
      req: { payload, filenames: (files || []).map((f) => f.originalname) },
    });
    return { ok: true, status: 200, data: { message: 'DRY_RUN', payload }, payloadPreview: payload };
  }

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

    await safeLogDaum({
      action: 'PUSH_FILE',
      status: status || null,
      articleId,
      contentId: payload.contentId,
      uuid,
      req: { payload, filenames: (files || []).map((f) => f.originalname) },
      res: res.data,
    });

    logDaumSuccess('PUSH_FILE', { articleId, contentId: payload.contentId, uuid, status });

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

    await safeLogDaum({
      action: 'PUSH_FILE',
      status: 'ERROR',
      articleId,
      contentId: payload.contentId,
      err,
      req: { payload, filenames: (files || []).map((f) => f.originalname) },
      res: data,
    });

    logDaumFailed('PUSH_FILE', { articleId, contentId: payload.contentId, uuid: null, status: null }, err);

    return { ok: false, status, data, payloadPreview: payload };
  }
}

/* ============================== 결과 조회 & 미리보기 경로 저장 ============================== */

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

  await safeLogDaum({
    action: 'RESULT',
    status: status || null,
    articleId: article?.articleId ?? null,
    contentId,
    uuid,
    res: res.data,
  });

  return { ok: true, status: res.status, data: res.data };
}

/* ============================== 삭제 ============================== */

export async function deleteByUuid(env = 'prod', uuid) {
  const client = createDaumAxios(env);
  try {
    const res = await client.delete(`/api/v1/contents/feed/uuid/${uuid}`);
    await safeLogDaum({ action: 'DELETE_UUID', status: 'SUCCESS', uuid, res: { status: res.status } });
    return { ok: true, status: res.status };
  } catch (err) {
    await safeLogDaum({ action: 'DELETE_UUID', status: 'ERROR', uuid, err, res: err?.response?.data });
    const status = err?.response?.status || 500;
    const data = err?.response?.data || { message: err.message };
    return { ok: false, status, data };
  }
}

export async function deleteByContentId(env = 'prod', contentId) {
  const client = createDaumAxios(env);
  try {
    const res = await client.delete(`/api/v1/contents/feed/content-id/${encodeURIComponent(contentId)}`);
    await safeLogDaum({ action: 'DELETE_CONTENT_ID', status: 'SUCCESS', contentId, res: { status: res.status } });
    return { ok: true, status: res.status };
  } catch (err) {
    await safeLogDaum({ action: 'DELETE_CONTENT_ID', status: 'ERROR', contentId, err, res: err?.response?.data });
    const status = err?.response?.status || 500;
    const data = err?.response?.data || { message: err.message };
    return { ok: false, status, data };
  }
}

/* ============================== 인증 확인 ============================== */

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
