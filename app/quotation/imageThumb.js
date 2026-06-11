// Resize an uploaded image to a small JPEG data-URI thumbnail.
// Quotation item images are stored inside the stone_items JSON cell — Google
// Sheets caps a cell at 50,000 chars, so we downscale (max ~160px, q=0.7) to
// keep each image a few KB. The PDF only shows it at 32–42px anyway.
export function fileToThumbnail(file, max = 160, quality = 0.7) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width >= height && width > max) { height = Math.round(height * max / width); width = max; }
        else if (height > max) { width = Math.round(width * max / height); height = max; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        try { resolve(canvas.toDataURL('image/jpeg', quality)); }
        catch (err) { reject(err); }
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
