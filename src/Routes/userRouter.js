import express from 'express';
import prisma from '../utils/prisma.js';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt, { decode } from 'jsonwebtoken';
import { adminSchema } from '../Validation/adminValidate.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { upload } from '../middlewares/fileUploader.js';
import { userProfileImageUpload } from '../utils/userProfileImageUpload.js';
// import redis from '../utils/Redis/redisClient.js';

dotenv.config();

const userRouter = express.Router();

userRouter.post('/signup', async (req, res, next) => {
  try {
    const { value, error } = adminSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { loginId, password, email, rank, name } = value;
    const { signupCode } = req.body;

    if (process.env.SIGNUP_CODE !== signupCode) return res.status(403).json({ message: "안전하지 않은 접근입니다." });

    const existAdminInfo = await prisma.admin.findFirst({
      where: {
        OR: [{ loginId: loginId }, { email: email }]
      }
    });

    if (existAdminInfo) return res.status(409).json({ message: "이미 존재하는 ID 또는 Email 입니다." });

    const encodePassword = await bcrypt.hash(password, 10);

    await prisma.admin.create({
      data: {
        loginId,
        name,
        email,
        password: encodePassword,
        rank
      }
    });

    return res.status(201).json({ message: "회원가입이 완료 되었습니다." });
  } catch (e) {
    next(e);
  }
});

userRouter.post('/signin', async (req, res, next) => {
  try {
    const { loginId, password } = req.body;

    const existAdminInfo = await prisma.admin.findUnique({ where: { loginId: loginId } })
    if (!existAdminInfo) return res.status(403).json({ message: "아이디 또는 비밀번호를 확인 해주세요." });

    const decodePassword = await bcrypt.compare(password, existAdminInfo.password);
    if (!decodePassword) return res.status(403).json({ message: "아이디 또는 비밀번호를 확인 해주세요." });

    const accessToken = jwt.sign(
      { adminId: existAdminInfo.adminId },
      process.env.JWT_SECRET_KEY,
      { expiresIn: '3h' }
    );

    const refreshToken = jwt.sign(
      { adminId: existAdminInfo.adminId },
      process.env.JWT_REFRESH_SECRET_KEY,
      { expiresIn: '3d' }
    );

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: `strict`,
      maxAge: 3 * 24 * 60 * 60 * 1000,
    });

    // await redis.set(existAdminInfo.adminId, refreshToken, 'EX', 5 * 60);

    return res.status(201).json({
      accessToken,
      message:
        `환영합니다. ${existAdminInfo.name} ${existAdminInfo.rank}님`
    });
  } catch (e) {
    next(e);
  }
});

userRouter.get('/adminInfo', authMiddleware, async (req, res, next) => {
  try {
    const adminId = req.user;

    const findUser = await prisma.admin.findUnique({
      where: { adminId: adminId },
      select: {
        adminId: true,
        profileImg: true,
        name: true,
        email: true,
        rank: true,
      }
    });
    if (!findUser) return res.status(400).json({ message: "존재하지 않는 유저입니다." });

    return res.status(201).json({ userInfo: findUser });
  } catch (e) {
    next(e);
  }
});

userRouter.patch('/adminInfo/:adminId', authMiddleware, upload.single('file'), async (req, res, next) => {
  try {
    const userId = req.user;
    const { adminId } = req.params;
    const { name, email, userImage } = req.body;
    const userFile = req.file;

    const CDN_URL = 'https://pnkokogkwsgf27818223.gcdn.ntruss.com';

    let profileImage;
    if (userFile) {
      try {
        profileImage = await userProfileImageUpload(userFile, CDN_URL);
      } catch (e) {
        return res.status(500).json({ message: "이미지 업로드 중 문제가 발생하였습니다." });
      }
    }

    if (userId !== adminId) return res.status(403).json({ message: "잘못된 접근입니다." });

    const findUser = await prisma.admin.findUnique({ where: { adminId: adminId } });
    if (!findUser) return res.status(403).json({ message: "존재하지 않는 유저입니다." });

    await prisma.admin.update({
      where: {
        adminId: adminId,
      },
      data: {
        name,
        email,
        profileImg: profileImage ? profileImage : userImage ? userImage : null
      }
    })

    return res.status(201).json({ message: "정보 수정이 완료되었습니다." });
  } catch (e) {
    next(e);
  }
});

userRouter.post('/refresh-token', async (req, res, next) => {
  try {
    const tokenFromCookie = req.cookies.refreshToken;
    if (!tokenFromCookie) return res.status(401).json({ message: "access Denied" });

    const decoded = jwt.verify(tokenFromCookie, process.env.JWT_REFRESH_SECRET_KEY);

    const newAccessToken = jwt.sign(
      { adminId: decoded.adminId },
      process.env.JWT_SECRET_KEY,
      { expiresIn: '3h' }
    );

    return res.status(200).json({ accessToken: newAccessToken });
  } catch (e) {
    return res.status(401).json({ message: "잘못된 접근입니다. 다시 로그인 해주세요." });
  }
})

export default userRouter;