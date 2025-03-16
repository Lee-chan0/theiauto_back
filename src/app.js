import express from 'express';
import dotenv from 'dotenv';
import userRouter from './Routes/userRouter.js';
import { globalErrorHandler } from './middlewares/globalErrorHandler.js';

dotenv.config();

const app = express();

const PORT = process.env.PORT;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/theiauto/server/api', [userRouter]);
app.use(globalErrorHandler);

app.get('/', (req, res) => {
  res.send('theiauto server');
});


app.listen(PORT, () => {
  console.log('DEV SERVER OPEN');
})