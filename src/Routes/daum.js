import express from 'express';
import checkAuth, {
  pushArticleJson,
  pushArticleWithFiles,
  fetchFeedResult,
  deleteByUuid,
  deleteByContentId,
} from '../services/daumFeedService.js';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });
const daumRouter = express.Router();

// 1) 인증 확인
daumRouter.get('/check', async (req, res) => {
  const env = (req.query.env || 'test').toLowerCase();
  const method = (req.query.method || 'GET').toUpperCase();
  const result = await checkAuth(env, method);
  res.status(result.status).json(result);
});

// 2) JSON 송고 (파일 없이)
daumRouter.post('/articles/:id/push', async (req, res) => {
  try {
    const env = (req.query.env || 'prod').toLowerCase(); // 기본 prod (운영키만 있으므로)
    const articleId = Number(req.params.id);
    const result = await pushArticleJson(env, articleId);
    res.status(result.status).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// 3) 파일 포함 송고 (multipart/form-data)
daumRouter.post('/articles/:id/push-file', upload.array('files'), async (req, res) => {
  try {
    const env = (req.query.env || 'prod').toLowerCase();
    const articleId = Number(req.params.id);
    const result = await pushArticleWithFiles(env, articleId, req.files || []);
    res.status(result.status).json(result);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// 4) 결과 조회 (uuid or contentId)
daumRouter.get('/result', async (req, res) => {
  try {
    const env = (req.query.env || 'prod').toLowerCase();
    const by = req.query.by;           // 'uuid' | 'contentId'
    const value = req.query.value;     // 값
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

export default daumRouter;
