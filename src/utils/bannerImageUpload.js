import { v4 as uuidv4 } from 'uuid';
import { s3 } from '../middlewares/fileUploader.js';
import path from 'path';
import { addWatermarkToImage } from './addWatermarkToImage.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';

export async function bannerImageUpload(bannerFile, CDN_URL) {
  const bannerFileExt = path.extname(bannerFile.originalname).toLowerCase();
  const bannerFileKey = `bannerImage/${Date.now()}_${uuidv4()}${bannerFileExt}`;

  const watermarkedBuffer = await addWatermarkToImage(bannerFile.buffer);

  const bannerParams = {
    Bucket: 'my-bucket-ncp',
    Key: bannerFileKey,
    Body: watermarkedBuffer,
    ACL: "public-read",
    ContentType: bannerFile.mimetype
  };

  const command = new PutObjectCommand(bannerParams);
  await s3.send(command);

  return `${CDN_URL}/${bannerFileKey}`;
}