const DEFAULT_OPTIONS = {
  maxSize: 1280,
  quality: 0.78,
};

export const compressImageFile = (file, options = {}) => {
  const { maxSize, quality } = { ...DEFAULT_OPTIONS, ...options };

  if (!file?.type?.startsWith('image/') || file.type === 'image/gif') {
    return Promise.resolve(file);
  }

  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onerror = () => resolve(file);
    reader.onload = (event) => {
      const image = new Image();

      image.onerror = () => resolve(file);
      image.onload = () => {
        let { width, height } = image;

        if (width > maxSize || height > maxSize) {
          if (width >= height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }

            const outputName = file.name.replace(/\.[^.]+$/, '') || 'image';
            resolve(new File([blob], `${outputName}.jpg`, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          quality
        );
      };

      image.src = event.target?.result;
    };

    reader.readAsDataURL(file);
  });
};
