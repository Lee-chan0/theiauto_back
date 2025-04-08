import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma.js'

dotenv.config();

export const authMiddleware = async (req, res, next) => {
  try {
    const { authorization } = req.headers;
    if (!authorization) return res.status(401).json({ message: "토큰이 존재하지 않습니다." });

    const [tokenType, accessToken] = authorization.split(' ');

    if (tokenType !== 'Bearer') return res.status(403).json({ message: "토큰 타입이 일치하지 않습니다." });
    if (!accessToken) return res.status(403).json({ message: "유효하지 않은 토큰입니다." });

    const verifyToken = jwt.verify(accessToken, process.env.JWT_SECRET_KEY);
    const findAdmin = await prisma.admin.findUnique({
      where: {
        adminId: verifyToken.adminId
      }
    });

    if (!findAdmin) return res.status(401).json({ message: "존재하지 않는 유저입니다." });

    req.user = findAdmin.adminId;

    next();
  } catch (e) {
    next(e);
  }
}