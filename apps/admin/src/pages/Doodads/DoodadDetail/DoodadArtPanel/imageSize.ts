/** How long to wait for a picture to report its size before giving up on filling the size in automatically. */
export const IMAGE_SIZE_TIMEOUT_MS = 3000;

/** The pixel size of an image file, or null when the browser cannot read it (the owner then types the size). */
export function readImageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    let url: string | null = null;
    const finish = (size: { width: number; height: number } | null) => {
      if (url) URL.revokeObjectURL(url);
      resolve(size);
    };
    try {
      url = URL.createObjectURL(file);
      const image = new Image();
      const timer = window.setTimeout(() => finish(null), IMAGE_SIZE_TIMEOUT_MS);
      image.onload = () => {
        window.clearTimeout(timer);
        finish(image.naturalWidth > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null);
      };
      image.onerror = () => {
        window.clearTimeout(timer);
        finish(null);
      };
      image.src = url;
    } catch {
      finish(null);
    }
  });
}
