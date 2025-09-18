// src/Routes/daumRouter.js
import express from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';

import checkAuth, {
  pushArticleJson,
  pushArticleWithFiles,
  fetchFeedResult,
  deleteByUuid,
  deleteByContentId,
} from '../services/daumFeedService.js';

// ✅ 프록시 라우트에서 필요
import createDaumAxios from '../lib/daumClient.js';

const prisma = new PrismaClient();

// 메모리 스토리지: 이미지 위주에 적합 (MP4 대용량은 비권장)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 20 }, // 이미지 30MB, 최대 20개
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'].includes(file.mimetype);
    if (!ok) return cb(new Error('Unsupported file type'));
    cb(null, true);
  },
});

const daumRouter = express.Router();

// 1) 인증 확인 (기본 prod)
daumRouter.get('/check', async (req, res) => {
  const env = (req.query.env || 'prod').toLowerCase();
  const method = (req.query.method || 'GET').toUpperCase();
  const result = await checkAuth(env, method);
  res.status(result.status).json(result);
});

daumRouter.post('/articles/:id/push', async (req, res) => {
  try {
    const env = (req.query.env || 'prod').toLowerCase();
    const articleId = Number(req.params.id);
    const enableComment =
      req.query.enableComment === 'true' ? true :
        req.query.enableComment === 'false' ? false : undefined;

    const result = await pushArticleJson(env, articleId, { enableComment });
    res.status(result.status).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

daumRouter.post('/articles/:id/push-file', upload.array('files'), async (req, res) => {
  try {
    const env = (req.query.env || 'prod').toLowerCase();
    const articleId = Number(req.params.id);
    if (!Number.isInteger(articleId)) return res.status(400).json({ ok: false, message: 'invalid articleId' });

    const c = (req.query.comment || '').toString().toLowerCase();
    const enableComment = c === 'on' ? true : c === 'off' ? false : undefined;
    const dryRun = (req.query.dryRun === 'true');

    const result = await pushArticleWithFiles(env, articleId, req.files || [], { enableComment, dryRun });
    res.status(result.status).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// 4) 결과 조회 (uuid or contentId)
daumRouter.get('/result', async (req, res) => {
  try {
    const env = (req.query.env || 'prod').toLowerCase();
    const by = (req.query.by || '').toString();
    const value = (req.query.value || '').toString();
    if (!['uuid', 'contentId'].includes(by) || !value) {
      return res.status(400).json({ ok: false, message: "query 'by' must be 'uuid' or 'contentId' and 'value' is required" });
    }
    const result = await fetchFeedResult(env, by, value);
    res.status(result.status).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// 5) 삭제
daumRouter.delete('/delete/uuid/:uuid', async (req, res) => {
  try {
    const env = (req.query.env || 'prod').toLowerCase();
    const result = await deleteByUuid(env, req.params.uuid);
    res.status(result.status).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

daumRouter.delete('/delete/content-id/:contentId', async (req, res) => {
  try {
    const env = (req.query.env || 'prod').toLowerCase();
    const result = await deleteByContentId(env, req.params.contentId);
    res.status(result.status).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ✅ 6) 미리보기 프록시 (브라우저 → 서버 → 카카오)
daumRouter.get('/preview/:articleId', async (req, res) => {
  try {
    const env = (req.query.env || 'prod').toLowerCase();
    const articleId = Number(req.params.articleId);
    if (!Number.isInteger(articleId)) {
      return res.status(400).send('invalid articleId');
    }

    const article = await prisma.article.findUnique({ where: { articleId } });
    if (!article) return res.status(404).send('Article not found');

    // DB에 경로 없으면 최신 상태 조회해 채움
    let previewPath = article.daumPreviewPath;
    if (!previewPath) {
      const by = article.daumUuid ? 'uuid' : 'contentId';
      const value = article.daumUuid || article.daumContentId;
      if (!value) return res.status(400).send('No preview available yet');

      const r = await fetchFeedResult(env, by, value);
      previewPath = r?.data?.previewUrl || null;
      if (!previewPath) return res.status(202).send('Preview not ready. Try again later.');
    }

    // 카카오 게이트웨이에 서버가 Basic Auth로 직접 요청해서 HTML 프록시
    const client = createDaumAxios(env);
    const kakaoRes = await client.get(previewPath, { responseType: 'arraybuffer' });

    res.set('Content-Type', kakaoRes.headers['content-type'] || 'text/html; charset=utf-8');
    return res.status(200).send(kakaoRes.data);
  } catch (e) {
    const status = e?.response?.status || 500;
    const data = e?.response?.data || { message: e.message };
    return res.status(status).send(typeof data === 'string' ? data : JSON.stringify(data));
  }
});

export default daumRouter;
