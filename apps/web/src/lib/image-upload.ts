const MEGABYTE_BYTES = 1024 * 1024;

export const IMAGE_UPLOAD_SOURCE_MAX_BYTES = 20 * MEGABYTE_BYTES;
export const PROFILE_PHOTO_UPLOAD_MAX_BYTES = 3 * MEGABYTE_BYTES;
export const EVENT_IMAGE_UPLOAD_MAX_BYTES = 5 * MEGABYTE_BYTES;

type PrepareImageOptions = {
  maxBytes: number;
  maxDimension: number;
  quality?: number;
};

type LoadedImage = ImageBitmap | HTMLImageElement;

export async function prepareImageForUpload(file: File, options: PrepareImageOptions) {
  if (file.size > IMAGE_UPLOAD_SOURCE_MAX_BYTES) {
    throw new Error(`Choose an image smaller than ${formatFileSize(IMAGE_UPLOAD_SOURCE_MAX_BYTES)}.`);
  }

  const image = await loadImage(file);
  const sourceWidth = image.width;
  const sourceHeight = image.height;
  const maxSourceDimension = Math.max(sourceWidth, sourceHeight);
  const initialScale = Math.min(1, options.maxDimension / maxSourceDimension);
  let targetWidth = Math.max(1, Math.round(sourceWidth * initialScale));
  let targetHeight = Math.max(1, Math.round(sourceHeight * initialScale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const initialQuality = options.quality ?? 0.84;
  const qualitySteps = [initialQuality, 0.8, 0.74, 0.68, 0.62, 0.56];

  if (!context) {
    closeImage(image);
    throw new Error("Your browser could not prepare this image.");
  }

  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, targetWidth, targetHeight);
      context.drawImage(image, 0, 0, targetWidth, targetHeight);

      for (const quality of qualitySteps) {
        const blob = await canvasToBlob(canvas, "image/webp", quality);

        if (blob.type === "image/webp" && blob.size <= options.maxBytes) {
          return blobToFile(blob, file.name, "webp");
        }
      }

      for (const quality of qualitySteps) {
        const blob = await canvasToBlob(canvas, "image/jpeg", quality);

        if (blob.size <= options.maxBytes) {
          return blobToFile(blob, file.name, "jpg");
        }
      }

      if (file.size <= options.maxBytes && targetWidth === sourceWidth && targetHeight === sourceHeight) {
        return file;
      }

      targetWidth = Math.max(1, Math.round(targetWidth * 0.82));
      targetHeight = Math.max(1, Math.round(targetHeight * 0.82));
    }
  } finally {
    closeImage(image);
  }

  throw new Error(`This image is too large to prepare. Try another photo smaller than ${formatFileSize(IMAGE_UPLOAD_SOURCE_MAX_BYTES)}.`);
}

export function formatFileSize(bytes: number) {
  if (bytes >= MEGABYTE_BYTES) {
    return `${Math.round(bytes / MEGABYTE_BYTES)}MB`;
  }

  return `${Math.round(bytes / 1024)}KB`;
}

async function loadImage(file: File): Promise<LoadedImage> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      // Fall back to an HTMLImageElement for browsers that cannot decode this file through ImageBitmap.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This image could not be opened. Try another file."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, contentType: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Your browser could not compress this image."));
          return;
        }

        resolve(blob);
      },
      contentType,
      quality
    );
  });
}

function blobToFile(blob: Blob, originalName: string, extension: string) {
  const fileName = replaceExtension(originalName, extension);

  return new File([blob], fileName, {
    type: blob.type,
    lastModified: Date.now()
  });
}

function replaceExtension(fileName: string, extension: string) {
  const dotIndex = fileName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;

  return `${baseName}.${extension}`;
}

function closeImage(image: LoadedImage) {
  if ("close" in image) {
    image.close();
  }
}
