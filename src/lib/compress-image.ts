import { SEND_LIMIT, STILL_TOO_LARGE, fileProblem, fitWithin } from './event-images';

/** A reason an image cannot be uploaded, for "Upload failed: {reason}". */
export class ImageProblem extends Error {}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Browser only (E-18): checks the chosen file, then redraws it at most
 * 1600 px on its longest edge as WebP, or as PNG (JPEG for photos) where the
 * browser cannot write WebP, so the upload is small and a type the bucket
 * stores. Orientation from the camera is applied by the browser.
 */
export async function compressImage(file: File): Promise<Blob> {
  const problem = fileProblem(file);
  if (problem) throw new ImageProblem(problem);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageProblem('this image could not be read. Choose a PNG, JPEG or WebP image.');
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new ImageProblem('this browser could not prepare the image.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let blob = await toBlob(canvas, 'image/webp', 0.85);
  if (blob?.type !== 'image/webp')
    blob = await toBlob(canvas, file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.85);
  if (!blob) throw new ImageProblem('this browser could not prepare the image.');
  if (blob.size > SEND_LIMIT) throw new ImageProblem(STILL_TOO_LARGE);
  return blob;
}
