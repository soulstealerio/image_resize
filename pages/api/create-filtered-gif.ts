import { NextApiRequest, NextApiResponse } from "next";
import sharp from "sharp";
import formidable from "formidable";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import fs from "fs";
import path from "path";

/**
 * @swagger
 * /api/create-filtered-gif:
 *   post:
 *     summary: Create an animated GIF from multiple already-filtered images
 *     description: |
 *       This endpoint accepts already-filtered images (processed client-side) and combines them
 *       into an animated GIF. The client applies CSS filters in the web app, captures
 *       the filtered frames, and sends them to this endpoint for GIF creation.
 *
 *       ## Design Decisions
 *
 *       ### 1. Technology Stack: Node.js with Sharp + gifenc
 *       - **Sharp**: Fast, native image processing (already in use for thumbnails)
 *       - **gifenc**: Pure JavaScript GIF encoder (no native dependencies like canvas)
 *
 *       ### 2. Data Format: multipart/form-data
 *       - Standard for file uploads
 *       - Better for low/spotty internet: streams data, can resume
 *       - More efficient than base64 (33% size overhead)
 *       - Standard HTTP format, works with all clients
 *
 *       ### 3. Image Size Limit: 10MB per image
 *       - Prevents memory exhaustion
 *       - Reasonable for mobile app captures (typically 1-5MB)
 *       - Validated before processing
 *
 *       ### 4. Uniform Sizes: Assumed and validated
 *       - All images must have identical dimensions
 *       - Required for proper GIF animation
 *       - First image sets the dimensions, others must match
 *
 *       ### 5. Frame Delay: Configurable via form field
 *       - Default: 500ms (0.5 seconds per frame)
 *       - Specified in milliseconds
 *       - Applied uniformly to all frames
 *     tags:
 *       - GIF Creation
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - images
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: |
 *                   Multiple image files (JPEG, PNG, or GIF) that are already filtered.
 *                   Images must have uniform dimensions. Maximum 10MB per image.
 *                   Field name can be 'images' or 'images[]' (both supported).
 *                 example: ["frame1.jpg", "frame2.jpg", "frame3.jpg", "frame4.jpg"]
 *               frameDelay:
 *                 type: integer
 *                 minimum: 10
 *                 maximum: 10000
 *                 default: 500
 *                 description: Frame delay in milliseconds (default: 500ms = 0.5 seconds per frame)
 *                 example: 500
 *     responses:
 *       '200':
 *         description: Successfully created animated GIF
 *         content:
 *           image/gif:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Type:
 *             schema:
 *               type: string
 *               example: image/gif
 *           Content-Length:
 *             schema:
 *               type: integer
 *               example: 245760
 *       '400':
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to create GIF
 *                 message:
 *                   type: string
 *                   examples:
 *                     noImages:
 *                       value: "No images provided. Use 'images[]' field."
 *                     sizeExceeded:
 *                       value: "Image 1 exceeds 10MB limit: 12.5MB"
 *                     dimensionMismatch:
 *                       value: "Image 2 dimensions (800x600) do not match first image (1024x768). All images must have uniform dimensions."
 *                     invalidFrameDelay:
 *                       value: "frameDelay must be between 10 and 10000 milliseconds"
 *       '405':
 *         description: Method Not Allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Method not allowed
 *                 message:
 *                   type: string
 *                   example: Only POST requests are accepted
 *       '500':
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to create GIF
 *                 message:
 *                   type: string
 *                   example: Unknown error
 */

/**
 * Create Filtered GIF API - Creates an animated GIF from multiple already-filtered images
 *
 * This endpoint accepts already-filtered images (processed client-side) and combines them
 * into an animated GIF. The client applies CSS filters in the React Native app, captures
 * the filtered frames, and sends them to this endpoint for GIF creation.
 *
 * Design Decisions:
 * =================
 *
 * 1. Technology Stack: Node.js with Sharp + gifenc
 *    - Sharp: Fast, native image processing (already in use for thumbnails)
 *    - gifenc: Pure JavaScript GIF encoder (no native dependencies like canvas)
 *
 * 2. Data Format: multipart/form-data
 *    - Standard for file uploads
 *    - Better for low/spotty internet: streams data, can resume
 *    - More efficient than base64 (33% size overhead)
 *    - Standard HTTP format, works with all clients
 *
 * 3. Image Size Limit: 10MB per image
 *    - Prevents memory exhaustion
 *    - Reasonable for mobile app captures (typically 1-5MB)
 *    - Validated before processing
 *
 * 4. Uniform Sizes: Assumed and validated
 *    - All images must have identical dimensions
 *    - Required for proper GIF animation
 *    - First image sets the dimensions, others must match
 *
 * 5. Frame Delay: Configurable via form field
 *    - Default: 500ms (0.5 seconds per frame)
 *    - Specified in milliseconds
 *    - Applied uniformly to all frames
 *
 * Usage:
 *   POST /api/create-filtered-gif
 *   Content-Type: multipart/form-data
 *
 * Form Fields:
 *   - images[]: Multiple image files (JPEG, PNG, or GIF) - already filtered
 *   - frameDelay: Number (milliseconds, default: 500)
 *
 * Response:
 *   - Success: Returns animated GIF binary with Content-Type: image/gif
 *   - Error: JSON error object with status code
 *
 * Example (curl):
 *   curl -X POST http://localhost:3000/api/create-filtered-gif \
 *     -F "images[]=@frame1.jpg" \
 *     -F "images[]=@frame2.jpg" \
 *     -F "images[]=@frame3.jpg" \
 *     -F "images[]=@frame4.jpg" \
 *     -F "frameDelay=500" \
 *     -o output.gif
 *
 * Example (JavaScript/React Native):
 *   const formData = new FormData();
 *   formData.append('images[]', { uri: frame1Uri, type: 'image/jpeg', name: 'frame1.jpg' });
 *   formData.append('images[]', { uri: frame2Uri, type: 'image/jpeg', name: 'frame2.jpg' });
 *   formData.append('images[]', { uri: frame3Uri, type: 'image/jpeg', name: 'frame3.jpg' });
 *   formData.append('images[]', { uri: frame4Uri, type: 'image/jpeg', name: 'frame4.jpg' });
 *   formData.append('frameDelay', '500');
 *
 *   const response = await fetch('https://api.example.com/api/create-filtered-gif', {
 *     method: 'POST',
 *     body: formData,
 *   });
 *
 *   const gifBlob = await response.blob();
 *
 * Error Responses:
 *   - 400: Bad Request (missing images, invalid frameDelay, size exceeded, dimension mismatch)
 *   - 405: Method Not Allowed (only POST accepted)
 *   - 500: Internal Server Error (processing failure)
 *
 * Performance Notes:
 *   - Processing time: ~100-500ms per frame (depends on image size)
 *   - Memory usage: ~2-3x input size during processing
 *   - Output size: Typically 50-200KB for 4 frames at mobile resolutions
 */

// Configuration constants
const MAX_IMAGE_SIZE_MB = 10;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const MAX_TOTAL_FILES = 20; // Maximum number of files
const MAX_TOTAL_FILE_SIZE_BYTES = MAX_IMAGE_SIZE_BYTES * MAX_TOTAL_FILES; // Total size limit for all files
const DEFAULT_FRAME_DELAY_MS = 500;
const MIN_FRAME_DELAY_MS = 10; // Minimum 10ms (100fps max)
const MAX_FRAME_DELAY_MS = 10000; // Maximum 10 seconds per frame

// Disable Next.js body parser for multipart/form-data
export const config = {
  api: {
    bodyParser: false,
  },
};

interface ProcessedFrame {
  width: number;
  height: number;
  pixels: Uint8Array; // RGBA pixel data
}

/**
 * Parse multipart/form-data request
 */
async function parseFormData(
  req: NextApiRequest
): Promise<{ images: formidable.File[]; frameDelay: number }> {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: MAX_IMAGE_SIZE_BYTES, // Per-file limit: 10MB
      maxTotalFileSize: MAX_TOTAL_FILE_SIZE_BYTES, // Total limit: 10MB * 20 files = 200MB
      maxFiles: MAX_TOTAL_FILES, // Maximum number of files
      keepExtensions: true,
      uploadDir: path.join(process.cwd(), "tmp"),
    });

    // Ensure tmp directory exists
    const tmpDir = path.join(process.cwd(), "tmp");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err);
        return;
      }

      // Extract images array - support both 'images' and 'images[]' field names
      // Formidable treats 'images[]' as a literal field name with brackets
      let images: formidable.File[] = [];

      if (files.images) {
        images = Array.isArray(files.images) ? files.images : [files.images];
      } else if ((files as any)["images[]"]) {
        // Handle 'images[]' field name (brackets are part of the name)
        const imagesArray = (files as any)["images[]"];
        images = Array.isArray(imagesArray) ? imagesArray : [imagesArray];
      }

      if (images.length === 0) {
        reject(
          new Error("No images provided. Use 'images' or 'images[]' field.")
        );
        return;
      }

      // Extract frameDelay
      const frameDelayStr = Array.isArray(fields.frameDelay)
        ? fields.frameDelay[0]
        : fields.frameDelay;
      const frameDelay = frameDelayStr
        ? parseInt(frameDelayStr, 10)
        : DEFAULT_FRAME_DELAY_MS;

      // Validate frameDelay
      if (
        isNaN(frameDelay) ||
        frameDelay < MIN_FRAME_DELAY_MS ||
        frameDelay > MAX_FRAME_DELAY_MS
      ) {
        reject(
          new Error(
            `frameDelay must be between ${MIN_FRAME_DELAY_MS} and ${MAX_FRAME_DELAY_MS} milliseconds`
          )
        );
        return;
      }

      resolve({ images, frameDelay });
    });
  });
}

/**
 * Process a single image file: validate size, extract dimensions, convert to RGBA pixels
 */
async function processImageFrame(
  file: formidable.File,
  index: number
): Promise<ProcessedFrame> {
  const filePath = file.filepath;
  const fileSize = file.size;

  // Validate file size
  if (fileSize > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(
      `Image ${index + 1} exceeds ${MAX_IMAGE_SIZE_MB}MB limit: ${(
        fileSize /
        1024 /
        1024
      ).toFixed(2)}MB`
    );
  }

  // Read and process image with sharp
  const imageBuffer = fs.readFileSync(filePath);
  const image = sharp(imageBuffer);

  // Get metadata
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Image ${index + 1}: Unable to read dimensions`);
  }

  // Convert to RGBA raw pixel data (required by gifenc)
  const { data, info } = await image
    .ensureAlpha() // Ensure alpha channel exists
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    width: info.width,
    height: info.height,
    pixels: new Uint8Array(data), // RGBA format
  };
}

/**
 * Create animated GIF from processed frames
 */
function createAnimatedGIF(
  frames: ProcessedFrame[],
  frameDelay: number
): Uint8Array {
  if (frames.length === 0) {
    throw new Error("No frames to encode");
  }

  // All frames must have same dimensions (validated earlier)
  const { width, height } = frames[0];

  // Create GIF encoder
  const gif = GIFEncoder({
    width,
    height,
  });

  // Process and add each frame
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];

    // Quantize colors to 256-color palette
    const palette = quantize(frame.pixels, 256, {
      format: "rgb565", // Better quality
    });

    // Apply palette to get indexed bitmap
    const index = applyPalette(frame.pixels, palette, "rgb565");

    // Write frame with delay (gifenc expects delay in milliseconds)
    gif.writeFrame(index, width, height, {
      palette,
      delay: frameDelay, // Already in milliseconds
      first: i === 0, // First frame needs to set global color table
    });
  }

  // Finish encoding
  gif.finish();

  // Return GIF bytes
  return gif.bytes();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
      message: "Only POST requests are accepted",
    });
  }

  let tempFiles: formidable.File[] = [];

  try {
    // Parse multipart/form-data
    const { images, frameDelay } = await parseFormData(req);
    tempFiles = images;

    console.log(
      `[create-filtered-gif] Processing ${images.length} images, frameDelay: ${frameDelay}ms`
    );

    // Process all images
    const processedFrames: ProcessedFrame[] = [];
    let firstDimensions: { width: number; height: number } | null = null;

    for (let i = 0; i < images.length; i++) {
      const frame = await processImageFrame(images[i], i);

      // Validate uniform dimensions
      if (firstDimensions === null) {
        firstDimensions = { width: frame.width, height: frame.height };
      } else {
        if (
          frame.width !== firstDimensions.width ||
          frame.height !== firstDimensions.height
        ) {
          throw new Error(
            `Image ${i + 1} dimensions (${frame.width}x${frame.height}) do not match first image (${firstDimensions.width}x${firstDimensions.height}). All images must have uniform dimensions.`
          );
        }
      }

      processedFrames.push(frame);
      console.log(
        `[create-filtered-gif] Processed frame ${i + 1}/${images.length}: ${frame.width}x${frame.height}`
      );
    }

    if (processedFrames.length === 0) {
      throw new Error("No valid frames processed");
    }

    // Create animated GIF
    console.log(
      `[create-filtered-gif] Creating GIF from ${processedFrames.length} frames`
    );
    const gifBytes = createAnimatedGIF(processedFrames, frameDelay);

    console.log(
      `[create-filtered-gif] GIF created: ${(gifBytes.length / 1024).toFixed(1)}KB, ${processedFrames.length} frame(s)`
    );

    // Clean up temp files
    for (const file of tempFiles) {
      try {
        if (fs.existsSync(file.filepath)) {
          fs.unlinkSync(file.filepath);
        }
      } catch (cleanupError) {
        console.warn(
          `[create-filtered-gif] Failed to cleanup temp file: ${file.filepath}`,
          cleanupError
        );
      }
    }

    // Return GIF as binary
    // Use res.end() for binary data to ensure proper encoding
    res.status(200);
    res.setHeader("Content-Type", "image/gif");
    res.setHeader("Content-Length", gifBytes.length.toString());
    res.end(Buffer.from(gifBytes));
    return;
  } catch (error: any) {
    // Clean up temp files on error
    for (const file of tempFiles) {
      try {
        if (fs.existsSync(file.filepath)) {
          fs.unlinkSync(file.filepath);
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }

    console.error("[create-filtered-gif] Error:", error);

    // Determine status code
    const statusCode =
      error.message?.includes("exceeds") ||
      error.message?.includes("dimensions") ||
      error.message?.includes("frameDelay") ||
      error.message?.includes("No images")
        ? 400
        : 500;

    return res.status(statusCode).json({
      error: "Failed to create GIF",
      message: error.message || "Unknown error",
    });
  }
}
