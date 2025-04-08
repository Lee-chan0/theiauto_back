import { Upload } from '@aws-sdk/lib-storage';
import { v4 as uuidv4 } from 'uuid';
import { s3 } from '../middlewares/fileUploader.js';
import path from 'path';

export async function userProfileImageUpload(userFile, CDN_URL) {
  const contentFileExt = path.extname(userFile.originalname).toLowerCase();
  const contentFileKey = `userProfileImg/${Date.now()}_${uuidv4()}${contentFileExt}`;

  const userImgParams = {
    Bucket: 'my-bucket-ncp',
    Key: contentFileKey,
    Body: userFile.buffer,
    ACL: "public-read",
    ContentType: userFile.mimetype
  };

  const upload = new Upload({
    client: s3,
    params: userImgParams
  });

  await upload.done();

  return `${CDN_URL}/${contentFileKey}`;
}