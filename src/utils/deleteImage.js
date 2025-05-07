import { s3 } from "../middlewares/fileUploader.js"
import { DeleteObjectCommand } from "@aws-sdk/client-s3"

export const deleteImage = async (delImgs) => {
  const CDN_URL = 'https://pnkokogkwsgf27818223.gcdn.ntruss.com';

  const deletePromises = delImgs.map(async (url) => {
    if (!url.startsWith(CDN_URL)) return;

    const key = url.replace(`${CDN_URL}/`, '');
    const allowPath = ['articleContent/', 'articleImages/', 'bannerImage/'];

    const isAllowed = allowPath.some((path) => key.startsWith(path));
    if (!isAllowed) {
      console.warn('허용되지 않은 경로입니다.');
      return;
    }

    const deleteParmas = {
      Bucket: 'my-bucket-ncp',
      Key: key
    };

    try {
      await s3.send(new DeleteObjectCommand(deleteParmas));
      console.log('삭제완료');
    } catch (e) {
      console.error('이미지 삭제도중 오류가 발생했습니다.');
    }
  });

  await Promise.all(deletePromises);
}