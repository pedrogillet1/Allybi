import * as pdfjsLib from 'pdfjs-dist';

// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/**
 * Generate thumbnail from a file
 * @param {File} file - The file to generate thumbnail from
 * @param {Object} options - Thumbnail options
 * @returns {Promise<Blob>} - Thumbnail as JPEG blob
 */
export async function generateThumbnail(file, options = {}) {
  const { width = 300, height = 400, quality = 0.85 } = options;

  try {
    // Detect file type
    const fileType = getFileType(file.name);

    switch (fileType) {
      case 'pdf':
        return await generatePDFThumbnail(file, width, height, quality);

      case 'image':
        return await generateImageThumbnail(file, width, height, quality);

      default:
        return null; // No thumbnail for other types
    }
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    return null;
  }
}

/**
 * Generate thumbnail from PDF file
 */
async function generatePDFThumbnail(file, width, height, quality) {
  try {
    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    // Get first page
    const page = await pdf.getPage(1);

    // Calculate scale to fit dimensions while maintaining aspect ratio
    const viewport = page.getViewport({ scale: 1 });
    const scale = Math.min(width / viewport.width, height / viewport.height);
    const scaledViewport = page.getViewport({ scale });

    // Create canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    // Render PDF page to canvas
    await page.render({
      canvasContext: context,
      viewport: scaledViewport,
    }).promise;

    // Convert canvas to blob
    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });

    return blob;
  } catch (error) {
    console.error('Error generating PDF thumbnail:', error);
    throw error;
  }
}

/**
 * Generate thumbnail from image file
 */
async function generateImageThumbnail(file, width, height, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      try {
        // Create canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        // Calculate dimensions to cover the thumbnail area
        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = img.width;
        let sourceHeight = img.height;

        const imgAspect = img.width / img.height;
        const thumbAspect = width / height;

        if (imgAspect > thumbAspect) {
          // Image is wider - crop width
          sourceWidth = img.height * thumbAspect;
          sourceX = (img.width - sourceWidth) / 2;
        } else {
          // Image is taller - crop height
          sourceHeight = img.width / thumbAspect;
          sourceY = (img.height - sourceHeight) / 2;
        }

        // Set canvas size
        canvas.width = width;
        canvas.height = height;

        // Draw cropped image
        context.drawImage(
          img,
          sourceX, sourceY, sourceWidth, sourceHeight,
          0, 0, width, height
        );

        // Convert to blob
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          resolve(blob);
        }, 'image/jpeg', quality);
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Get file type from filename
 */
function getFileType(filename) {
  const ext = filename.toLowerCase().split('.').pop();

  const typeMap = {
    'pdf': 'pdf',
    'jpg': 'image',
    'jpeg': 'image',
    'png': 'image',
    'gif': 'image',
    'webp': 'image',
  };

  return typeMap[ext] || 'unknown';
}

/**
 * Check if file type supports thumbnail generation
 */
export function supportsThumbnail(filename) {
  const fileType = getFileType(filename);
  return fileType === 'pdf' || fileType === 'image';
}
