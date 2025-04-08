import { v4 as uuidv4 } from 'uuid';
import { s3 } from '../middlewares/fileUploader.js';
import path from 'path';
import { PutObjectCommand } from '@aws-sdk/client-s3';

export async function articleImageUpload(imageFiles, CDN_URL) {
  const uploadPromises = imageFiles.map(async (file) => {
    const fileExt = path.extname(file.originalname).toLowerCase();
    const fileKey = `articleImages/${Date.now()}_${uuidv4()}${fileExt}`;

    const uploadParmas = {
      Bucket: 'my-bucket-ncp',
      Key: fileKey,
      Body: file.buffer,
      ACL: 'public-read',
      ContentType: file.mimetype
    };

    try {
      await s3.send(new PutObjectCommand(uploadParmas));
      return `${CDN_URL}/${fileKey}`;
    } catch (e) {
      throw new Error('업로드 중 오류 발생');
    }
  });

  return await Promise.all(uploadPromises);
}