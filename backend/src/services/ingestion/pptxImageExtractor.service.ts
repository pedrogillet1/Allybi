import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import sharp from "sharp";
import { uploadFile, getSignedUrl } from "../../config/storage";
import { logger } from "../../utils/logger";
import { extractWithTesseract } from "../extraction/tesseractFallback.service";
import { config } from "../../config/env";

interface ExtractedImage {
  slideNumber: number;
  imageNumber: number;
  filename: string;
  localPath: string;
  storagePath?: string; // Storage object key (not a signed URL)
  gcsPath?: string;
  imageUrl?: string | null; // ✅ FIX: Temporary signed URL (for backward compatibility)
  ocrText?: string; // OCR text extracted from image via Tesseract
}

interface SlideWithImages {
  slideNumber: number;
  images: ExtractedImage[];
  compositeImageUrl?: string;
}

/**
 * Extract images directly from PPTX file structure
 * This bypasses LibreOffice and extracts embedded images from the ZIP archive
 */
/** Maximum number of images per document to run OCR on, to bound latency. */
const PPTX_IMAGE_OCR_LIMIT = 10;

export class PPTXImageExtractorService {
  // Legacy slide-image utility.
  // Canonical ingestion extraction lives in services/extraction/pptxExtractor.service.ts.
  /**
   * Extract all images from PPTX and organize by slide
   */
  async extractImages(
    pptxFilePath: string,
    documentId: string,
    options: {
      uploadToGCS?: boolean;
      outputDir?: string;
      signedUrlExpiration?: number; // ✅ FIX: Add expiration option (in seconds)
    } = {},
  ): Promise<{
    success: boolean;
    slides?: SlideWithImages[];
    totalImages?: number;
    error?: string;
  }> {
    try {
      logger.info("[PPTX Image Extractor] Starting image extraction");

      const {
        uploadToGCS = true,
        outputDir,
        signedUrlExpiration = 604800,
      } = options; // ✅ FIX: Default 7 days

      // 1. Create temp directory
      const tempDir =
        outputDir ||
        path.join(
          process.cwd(),
          "temp",
          `pptx-images-${documentId}-${Date.now()}`,
        );
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // 2. Extract PPTX (it's a ZIP file)
      logger.debug("[PPTX Image Extractor] Extracting PPTX archive");
      const zip = new AdmZip(pptxFilePath);
      const zipEntries = zip.getEntries();

      // 3. Find all images in ppt/media/
      const mediaImages: { [key: string]: Buffer } = {};
      zipEntries.forEach((entry) => {
        if (entry.entryName.startsWith("ppt/media/") && !entry.isDirectory) {
          const filename = path.basename(entry.entryName);
          if (/\.(png|jpg|jpeg|gif|bmp|tiff|webp)$/i.test(filename)) {
            mediaImages[filename] = entry.getData();
            logger.debug("[PPTX Image Extractor] Found image", {
              filename,
              sizeBytes: entry.getData().length,
            });
          }
        }
      });

      logger.info("[PPTX Image Extractor] Found images in media folder", {
        imageCount: Object.keys(mediaImages).length,
      });

      // 4. Parse slide relationships to map images to slides
      const slideImageMap = await this.mapImagesToSlides(zip);

      // 5. Save images and organize by slide
      const slides: SlideWithImages[] = [];
      let totalImagesSaved = 0;

      for (const [slideNumber, imageRefs] of Object.entries(slideImageMap)) {
        const slideNum = parseInt(slideNumber);
        const slideImages: ExtractedImage[] = [];

        for (let i = 0; i < imageRefs.length; i++) {
          const imageRef = imageRefs[i];
          const imageBuffer = mediaImages[imageRef];

          if (!imageBuffer) {
            logger.warn("[PPTX Image Extractor] Image referenced but not found in media", {
              imageRef,
              slideNumber: slideNum,
            });
            continue;
          }

          // Save image to temp directory
          const outputFilename = `slide-${slideNum}-image-${i + 1}.png`;
          const outputPath = path.join(tempDir, outputFilename);

          // Convert to PNG with Sharp for consistency
          await sharp(imageBuffer).png({ quality: 90 }).toFile(outputPath);

          slideImages.push({
            slideNumber: slideNum,
            imageNumber: i + 1,
            filename: outputFilename,
            localPath: outputPath,
          });

          totalImagesSaved++;
        }

        if (slideImages.length > 0) {
          slides.push({
            slideNumber: slideNum,
            images: slideImages,
          });
        }
      }

      logger.info("[PPTX Image Extractor] Saved images", {
        totalImagesSaved,
        slideCount: slides.length,
      });

      // 5b. Optionally run Tesseract OCR on extracted images
      const ocrEnabled = config.PPTX_IMAGE_OCR_ENABLED === "true";
      if (ocrEnabled) {
        logger.info("[PPTX Image Extractor] Running Tesseract OCR on images", {
          ocrEnabled: true,
          limit: PPTX_IMAGE_OCR_LIMIT,
        });

        let ocrCount = 0;
        for (const slide of slides) {
          for (const image of slide.images) {
            if (ocrCount >= PPTX_IMAGE_OCR_LIMIT) {
              logger.debug("[PPTX Image Extractor] OCR limit reached", {
                limit: PPTX_IMAGE_OCR_LIMIT,
              });
              break;
            }

            try {
              const imageBuffer = await fs.promises.readFile(image.localPath);
              const ocrResult = await extractWithTesseract(imageBuffer, "eng+por");

              if (ocrResult.text.length > 10) {
                image.ocrText = ocrResult.text;
                logger.debug("[PPTX Image Extractor] OCR text extracted", {
                  slideNumber: image.slideNumber,
                  imageNumber: image.imageNumber,
                  textLength: ocrResult.text.length,
                  confidence: ocrResult.confidence,
                });
              } else {
                logger.debug("[PPTX Image Extractor] OCR text too short, ignoring", {
                  slideNumber: image.slideNumber,
                  imageNumber: image.imageNumber,
                  textLength: ocrResult.text.length,
                });
              }
            } catch (ocrError) {
              logger.warn("[PPTX Image Extractor] OCR failed for image", {
                slideNumber: image.slideNumber,
                imageNumber: image.imageNumber,
                error: ocrError,
              });
            }

            ocrCount++;
          }

          if (ocrCount >= PPTX_IMAGE_OCR_LIMIT) break;
        }

        logger.info("[PPTX Image Extractor] OCR pass complete", {
          imagesProcessed: ocrCount,
          imagesWithText: slides.reduce(
            (sum, s) => sum + s.images.filter((img) => img.ocrText).length,
            0,
          ),
        });
      }

      // 6. Upload to GCS if requested
      if (uploadToGCS) {
        logger.info("[PPTX Image Extractor] Uploading images to GCS");

        for (const slide of slides) {
          for (const image of slide.images) {
            const storagePath = `slides/${documentId}/slide-${slide.slideNumber}-image-${image.imageNumber}.png`;

            try {
              // Read the file buffer
              const fileBuffer = await fs.promises.readFile(image.localPath);

              await uploadFile(storagePath, fileBuffer, "image/png");

              // ✅ FIX: Store the storage key for later signed URL generation
              image.storagePath = storagePath;
              image.gcsPath = storagePath;
              // ✅ FIX: Generate signed URL for immediate use (backward compatibility)
              image.imageUrl = await getSignedUrl(
                storagePath,
                signedUrlExpiration,
              );
              logger.debug("[PPTX Image Extractor] Uploaded image", { storagePath });
            } catch (uploadError) {
              logger.error("[PPTX Image Extractor] Failed to upload image", {
                storagePath,
                error: uploadError,
              });
              // ✅ FIX: Set all fields to null/undefined on failure
              image.imageUrl = null;
              image.storagePath = undefined;
              image.gcsPath = undefined;
            }
          }
        }
      }

      // 6.5. Create composite images for slides with multiple images
      logger.debug("[PPTX Image Extractor] Creating composite images");
      for (const slide of slides) {
        if (slide.images.length > 1) {
          try {
            logger.debug("[PPTX Image Extractor] Creating composite image", {
              slideNumber: slide.slideNumber,
            });

            // Load all images that were successfully uploaded
            const validImages = slide.images.filter(
              (img) => img.imageUrl && img.localPath,
            );

            if (validImages.length === 0) {
              logger.warn("[PPTX Image Extractor] No valid images for slide", {
                slideNumber: slide.slideNumber,
              });
              continue;
            }

            const imageBuffers = await Promise.all(
              validImages.map((img) => sharp(img.localPath).toBuffer()),
            );

            if (imageBuffers.length > 0) {
              // Create a composite by layering images
              // Simple approach: use the first (usually background) as base
              let composite = sharp(imageBuffers[0]);

              // Overlay other images
              if (imageBuffers.length > 1) {
                const composites = imageBuffers.slice(1).map((buffer) => ({
                  input: buffer,
                  blend: "over" as const,
                }));
                composite = composite.composite(composites);
              }

              // Save composite
              const compositeFilename = `slide-${slide.slideNumber}-composite.png`;
              const compositePath = path.join(tempDir, compositeFilename);
              await composite.toFile(compositePath);

              // Upload composite if GCS upload is enabled
              if (uploadToGCS) {
                const compositeStoragePath = `slides/${documentId}/slide-${slide.slideNumber}-composite.png`;
                try {
                  // Read the composite file buffer
                  const compositeBuffer =
                    await fs.promises.readFile(compositePath);

                  await uploadFile(
                    compositeStoragePath,
                    compositeBuffer,
                    "image/png",
                  );

                  // ✅ FIX: Store composite storage path for metadata
                  (slide as any).compositeStoragePath = compositeStoragePath;
                  slide.compositeImageUrl = await getSignedUrl(
                    compositeStoragePath,
                    signedUrlExpiration,
                  );
                  logger.debug("[PPTX Image Extractor] Uploaded composite", {
                    storagePath: compositeStoragePath,
                  });
                } catch (uploadError) {
                  logger.error("[PPTX Image Extractor] Failed to upload composite", {
                    error: uploadError,
                  });
                }
              } else {
                slide.compositeImageUrl = compositePath;
              }
            }
          } catch (compositeError) {
            logger.warn("[PPTX Image Extractor] Failed to create composite for slide", {
              slideNumber: slide.slideNumber,
              error: compositeError,
            });
            // Non-critical error, continue
          }
        } else if (slide.images.length === 1) {
          // Single image - use it as composite
          (slide as any).compositeStoragePath = slide.images[0].storagePath;
          slide.compositeImageUrl = slide.images[0].imageUrl || undefined;
        }
      }

      logger.info("[PPTX Image Extractor] Created composites", {
        compositesCreated: slides.filter((s) => s.compositeImageUrl).length,
      });

      // 7. Clean up temp directory
      if (!outputDir) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }

      return {
        success: true,
        slides,
        totalImages: totalImagesSaved,
      };
    } catch (error: any) {
      logger.error("[PPTX Image Extractor] Error during extraction", { error: error.message });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Parse slide XML relationships to map images to specific slides
   */
  private async mapImagesToSlides(
    zip: AdmZip,
  ): Promise<{ [slideNumber: number]: string[] }> {
    const slideImageMap: { [slideNumber: number]: string[] } = {};

    try {
      const entries = zip.getEntries();

      // Find all slide XML files
      const slideFiles = entries.filter((e) =>
        e.entryName.match(/^ppt\/slides\/slide(\d+)\.xml$/),
      );

      for (const slideFile of slideFiles) {
        const match = slideFile.entryName.match(/slide(\d+)\.xml$/);
        if (!match) continue;

        const slideNumber = parseInt(match[1]);
        const slideXml = slideFile.getData().toString("utf8");

        // Find relationship file for this slide
        const relsPath = `ppt/slides/_rels/slide${slideNumber}.xml.rels`;
        const relsEntry = zip.getEntry(relsPath);

        if (!relsEntry) {
          logger.warn("[PPTX Image Extractor] No relationships file found for slide", {
            slideNumber,
          });
          continue;
        }

        const relsXml = relsEntry.getData().toString("utf8");

        // Extract image relationships (Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" )
        const imageRelRegex =
          /<Relationship[^>]+Type="[^"]*\/image"[^>]+Target="\.\.\/media\/([^"]+)"/g;
        const imageRefs: string[] = [];
        let relMatch;

        while ((relMatch = imageRelRegex.exec(relsXml)) !== null) {
          imageRefs.push(relMatch[1]);
        }

        if (imageRefs.length > 0) {
          slideImageMap[slideNumber] = imageRefs;
          logger.debug("[PPTX Image Extractor] Slide image mapping", {
            slideNumber,
            imageCount: imageRefs.length,
          });
        }
      }

      logger.info("[PPTX Image Extractor] Mapped images to slides", {
        slidesWithImages: Object.keys(slideImageMap).length,
      });
    } catch (error) {
      logger.error("[PPTX Image Extractor] Error parsing slide relationships", { error });
    }

    return slideImageMap;
  }
}
