import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import userRouter from './Routes/userRouter.js';
import categoryRouter from './Routes/categoryRouter.js';
import articleRouter from './Routes/articleRouter.js';
import advertisementRouter from './Routes/advertisementRouter.js';

import articleUserRouter from './Routes/articleUserRouter.js';
import categoryUserRouter from './Routes/categoryUserRouter.js';
import advertisementUserRouter from './Routes/advertisementUserRouter.js';

import daumRouter from './Routes/daum.js';
import { globalErrorHandler } from './middlewares/globalErrorHandler.js';
import { startPublishScheduler } from './utils/ScheduledArticle/startPublishScheduler.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3005;

app.set('trust proxy', 1);

const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  "https://www.theiauto.com",
  process.env.EXTRA_CORS_ORIGIN || '',
].filter(Boolean));

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Admin-Gate',
  ],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(cookieParser());
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.json({ limit: '50mb' }));

app.get('/healthz', (req, res) => {
  res.status(200).json({
    ok: true,
    env: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || 'v1',
  });
});

app.use('/theiauto/server/api/general', [
  articleUserRouter,
  categoryUserRouter,
  advertisementUserRouter,
]);

app.use('/theiauto/server/api', [
  userRouter,
  categoryRouter,
  articleRouter,
  advertisementRouter,
]);

app.use('/integrations/daum', daumRouter);

app.get('/', (req, res) => {
  res.send('theiauto server');
});

app.use(globalErrorHandler);

startPublishScheduler();

app.listen(PORT, () => {
  console.log(`DEV SERVER OPEN : ${PORT}`);
});
