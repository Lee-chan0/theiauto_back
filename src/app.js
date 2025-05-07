import express from 'express';
import dotenv from 'dotenv';
import userRouter from './Routes/userRouter.js';
import { globalErrorHandler } from './middlewares/globalErrorHandler.js';
import cors from 'cors';
import categoryRouter from './Routes/categoryRouter.js';
import articleRouter from './Routes/articleRouter.js';
import cookieParser from 'cookie-parser';
import { startPublishScheduler } from './utils/ScheduledArticle/startPublishScheduler.js';
import articleUserRouter from './Routes/articleUserRouter.js';
import categoryUserRouter from './Routes/categoryUserRouter.js';

dotenv.config();

const app = express();

const PORT = process.env.PORT;

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/theiauto/server/api/general', [articleUserRouter, categoryUserRouter]);
app.use('/theiauto/server/api', [userRouter, categoryRouter, articleRouter]);
app.use(globalErrorHandler);

app.get('/', (req, res) => {
  res.send('theiauto server');
});

startPublishScheduler();

app.listen(PORT, () => {
  console.log('DEV SERVER OPEN');
});