import { Upload } from '@aws-sdk/lib-storage';
import { v4 as uuidv4 } from 'uuid';
import { s3 } from '../middlewares/fileUploader.js';
import path from 'path';


export async function articleContentImgUpload(contentFile, CDN_URL) {
  const contentFileExt = path.extname(contentFile.originalname).toLowerCase();
  const contentFileKey = `articleContent/${Date.now()}_${uuidv4()}${contentFileExt}`;

  const contentImgParams = {
    Bucket: 'my-bucket-ncp',
    Key: contentFileKey,
    Body: contentFile.buffer,
    ACL: "public-read",
    ContentType: contentFile.mimetype
  };

  const upload = new Upload({
    client: s3,
    params: contentImgParams
  });

  await upload.done();

  return `${CDN_URL}/${contentFileKey}`;
}