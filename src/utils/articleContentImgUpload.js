import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from '../middlewares/fileUploader.js';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { addWatermarkToImage } from './addWatermarkToImage.js';

export async function articleContentImgUpload(contentFile, CDN_URL) {
  try {
    const contentFileExt = path.extname(contentFile.originalname).toLowerCase();
    const contentFileKey = `articleContent/${Date.now()}_${uuidv4()}${contentFileExt}`;

    const watermarkedBuffer = await addWatermarkToImage(contentFile.buffer);

    const contentImgParams = {
      Bucket: 'my-bucket-ncp',
      Key: contentFileKey,
      Body: watermarkedBuffer,
      ACL: "public-read",
      ContentType: contentFile.mimetype
    };

    const command = new PutObjectCommand(contentImgParams);
    await s3.send(command);

    return `${CDN_URL}/${contentFileKey}`;
  } catch (e) {
    console.error('실패 : ', e);
    throw new Error('S3 업로드 실패: ' + (e?.message || 'unknown error'));
  }
}
