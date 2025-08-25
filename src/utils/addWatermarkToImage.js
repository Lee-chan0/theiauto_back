import sharp from "sharp";
import path from 'path';
import fs from 'fs/promises';


export async function addWatermarkToImage(originalBuffer) {
  const watermarkPath = path.resolve("Assets", "watermark.png");
  const watermarkRawBuffer = await fs.readFile(watermarkPath);

  const originalImage = sharp(originalBuffer);
  const { width: originalWidth = 800, height: originalHeight = 600 } = await originalImage.metadata();

  const watermarkResizedBuffer = await sharp(watermarkRawBuffer)
    .resize({
      width: Math.floor(originalWidth * 0.3),
      fit: 'inside',
    })
    .toBuffer();

  const outputBuffer = await originalImage
    .composite([
      {
        input: watermarkResizedBuffer,
        gravity: 'southeast',
        blend: 'over',
      }
    ])
    .toBuffer();

  return outputBuffer;
}