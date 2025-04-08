import { Upload } from '@aws-sdk/lib-storage';
import { v4 as uuidv4 } from 'uuid';
import { s3 } from '../middlewares/fileUploader.js';
import path from 'path';

export async function bannerImageUpload(bannerFile, CDN_URL) {
  const bannerFileExt = path.extname(bannerFile.originalname).toLowerCase();
  const bannerFileKey = `bannerImage/${Date.now()}_${uuidv4()}${bannerFileExt}`;

  const bannerParams = {
    Bucket: 'my-bucket-ncp',
    Key: bannerFileKey,
    Body: bannerFile.buffer,
    ACL: "public-read",
    ContentType: bannerFile.mimetype
  };

  const upload = new Upload({
    client: s3,
    params: bannerParams
  });

  await upload.done();

  return `${CDN_URL}/${bannerFileKey}`;
}