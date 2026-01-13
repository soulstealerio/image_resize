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
const MIN_FRAME_DELAY_MS = 10; // Minimum 10ms (100fps max) - user input validation
const MAX_FRAME_DELAY_MS = 10000; // Maximum 10 seconds per frame
// Note: For iOS Photos compatibility, we enforce a minimum of 20 centiseconds (200ms)
// in the GIF encoding, even if user requests smaller delays

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
        console.error(`[parseFormData] Formidable parse error:`, err);
        reject(err);
        return;
      }

      console.log(`[parseFormData] Formidable parsed successfully`);
      console.log(`[parseFormData] Fields received:`, Object.keys(fields));
      console.log(`[parseFormData] Files received:`, Object.keys(files));
      console.log(`[parseFormData] Field values:`, {
        frameDelay: fields.frameDelay,
        otherFields: Object.keys(fields).filter((k) => k !== "frameDelay"),
      });

      // Extract images array - support both 'images' and 'images[]' field names
      // Formidable treats 'images[]' as a literal field name with brackets
      let images: formidable.File[] = [];

      if (files.images) {
        images = Array.isArray(files.images) ? files.images : [files.images];
        console.log(
          `[parseFormData] Found ${images.length} images in 'images' field`
        );
      } else if ((files as any)["images[]"]) {
        // Handle 'images[]' field name (brackets are part of the name)
        const imagesArray = (files as any)["images[]"];
        images = Array.isArray(imagesArray) ? imagesArray : [imagesArray];
        console.log(
          `[parseFormData] Found ${images.length} images in 'images[]' field`
        );
      } else {
        console.warn(
          `[parseFormData] No images found in 'images' or 'images[]' fields`
        );
        console.log(
          `[parseFormData] Available file fields:`,
          Object.keys(files)
        );
      }

      if (images.length === 0) {
        reject(
          new Error("No images provided. Use 'images' or 'images[]' field.")
        );
        return;
      }

      // Log each image file received
      images.forEach((img, idx) => {
        console.log(`[parseFormData] Image ${idx + 1}:`, {
          originalFilename: img.originalFilename,
          newFilename: img.newFilename,
          mimetype: img.mimetype,
          size: img.size,
          filepath: img.filepath,
        });
      });

      // Extract frameDelay
      const frameDelayStr = Array.isArray(fields.frameDelay)
        ? fields.frameDelay[0]
        : fields.frameDelay;
      const frameDelay = frameDelayStr
        ? parseInt(frameDelayStr, 10)
        : DEFAULT_FRAME_DELAY_MS;

      console.log(
        `[parseFormData] Frame delay: ${frameDelayStr} -> ${frameDelay}ms`
      );

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
 * @param file - The image file to process
 * @param index - The index of the image (0-based)
 * @param cropTo - Optional dimensions to crop to (if provided, image will be cropped to these dimensions)
 */
async function processImageFrame(
  file: formidable.File,
  index: number,
  cropTo?: { width: number; height: number }
): Promise<ProcessedFrame> {
  const filePath = file.filepath;
  const fileSize = file.size;

  // Log what we received
  console.log(
    `[processImageFrame] Image ${index + 1}: received size=${fileSize} bytes, path=${filePath}`
  );

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

  // Check if file is suspiciously small (might be corrupted or empty)
  if (fileSize < 1000) {
    console.warn(
      `[processImageFrame] WARNING: Image ${index + 1} is very small (${fileSize} bytes). This might indicate the file wasn't uploaded correctly.`
    );
  }

  // Read and process image with sharp
  console.log(`[processImageFrame] Reading file from disk: ${filePath}`);
  const readStartTime = Date.now();
  const imageBuffer = fs.readFileSync(filePath);
  const readDuration = Date.now() - readStartTime;
  const actualFileSize = imageBuffer.length;

  console.log(
    `[processImageFrame] File read in ${readDuration}ms: ${actualFileSize} bytes`
  );

  if (actualFileSize !== fileSize) {
    console.warn(
      `[processImageFrame] WARNING: File size mismatch. Reported: ${fileSize} bytes, Actual: ${actualFileSize} bytes (diff: ${actualFileSize - fileSize} bytes)`
    );
  }

  console.log(`[processImageFrame] Creating sharp image object...`);
  let image = sharp(imageBuffer);

  // Get metadata
  console.log(`[processImageFrame] Extracting image metadata...`);
  const metadataStartTime = Date.now();
  const metadata = await image.metadata();
  const metadataDuration = Date.now() - metadataStartTime;

  console.log(
    `[processImageFrame] Metadata extracted in ${metadataDuration}ms:`,
    {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      channels: metadata.channels,
      hasAlpha: metadata.hasAlpha,
      size: metadata.size,
    }
  );

  if (!metadata.width || !metadata.height) {
    throw new Error(`Image ${index + 1}: Unable to read dimensions`);
  }

  // Apply cropping if needed
  if (
    cropTo &&
    (metadata.width !== cropTo.width || metadata.height !== cropTo.height)
  ) {
    console.log(
      `[processImageFrame] Cropping image from ${metadata.width}x${metadata.height} to ${cropTo.width}x${cropTo.height}`
    );
    // Use sharp's resize with cover mode to crop to exact dimensions
    // Position 'left' aligns horizontally to the left (crops from right for width)
    // For height, 'cover' mode will center by default, but since differences are small (1-2px),
    // this should be acceptable. For exact bottom alignment, we'd need more complex logic.
    image = image.resize(cropTo.width, cropTo.height, {
      fit: "cover",
      position: "left", // Crop from left (width), center vertically
    });
    console.log(
      `[processImageFrame] Image cropped to ${cropTo.width}x${cropTo.height}`
    );
  }

  // Convert to RGBA raw pixel data (required by gifenc)
  console.log(`[processImageFrame] Converting to RGBA raw pixel data...`);
  const pixelStartTime = Date.now();
  const { data, info } = await image
    .ensureAlpha() // Ensure alpha channel exists
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelDuration = Date.now() - pixelStartTime;

  const pixelDataSize = data.length;
  const expectedPixelSize = info.width * info.height * 4; // RGBA = 4 bytes per pixel

  console.log(
    `[processImageFrame] Pixel data extracted in ${pixelDuration}ms:`,
    {
      width: info.width,
      height: info.height,
      channels: info.channels,
      pixelDataSize: pixelDataSize,
      expectedSize: expectedPixelSize,
      sizeMatch: pixelDataSize === expectedPixelSize,
    }
  );

  if (pixelDataSize !== expectedPixelSize) {
    console.warn(
      `[processImageFrame] WARNING: Pixel data size mismatch. Expected ${expectedPixelSize} bytes, got ${pixelDataSize} bytes`
    );
  }

  const pixels = new Uint8Array(data);
  console.log(`[processImageFrame] Created Uint8Array: ${pixels.length} bytes`);

  // Sample first few pixels for debugging
  if (pixels.length >= 16) {
    const samplePixels = Array.from(pixels.slice(0, 16));
    console.log(`[processImageFrame] First 4 pixels (RGBA):`, samplePixels);
  }

  return {
    width: info.width,
    height: info.height,
    pixels: pixels, // RGBA format
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
  console.log(`[createAnimatedGIF] Initializing GIF encoder...`);
  console.log(`[createAnimatedGIF] Dimensions: ${width}x${height}`);
  console.log(`[createAnimatedGIF] Total frames: ${frames.length}`);
  const initialDelayCentiseconds = Math.round(frameDelay / 10);
  console.log(
    `[createAnimatedGIF] Frame delay: ${frameDelay}ms (will be ${initialDelayCentiseconds} centiseconds in GIF after gifenc conversion)`
  );

  const encoderStartTime = Date.now();
  const gif = GIFEncoder({
    width,
    height,
  });
  const encoderDuration = Date.now() - encoderStartTime;
  console.log(
    `[createAnimatedGIF] GIF encoder created in ${encoderDuration}ms`
  );

  // Process and add each frame
  let previousFramePixels: Uint8Array | null = null;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];

    // Log frame pixel data info
    const pixelDataSize = frame.pixels.length;
    const expectedSize = width * height * 4; // RGBA = 4 bytes per pixel
    if (pixelDataSize !== expectedSize) {
      console.warn(
        `[createAnimatedGIF] Frame ${i + 1}: Pixel data size mismatch. Expected ${expectedSize} bytes (${width}x${height}x4), got ${pixelDataSize} bytes`
      );
    }

    // Check if this frame is identical to the previous one
    console.log(
      `[createAnimatedGIF] Processing frame ${i + 1}/${frames.length}...`
    );

    // Compare with previous frame
    if (i > 0 && previousFramePixels) {
      console.log(
        `[createAnimatedGIF] Comparing frame ${i + 1} with frame ${i}...`
      );

      // Sample comparison: check first 100 pixels (400 bytes for RGBA)
      const sampleSize = Math.min(100, frame.pixels.length / 4);
      let identicalPixels = 0;
      let totalDiff = 0;

      for (let j = 0; j < sampleSize * 4; j += 4) {
        const r1 = frame.pixels[j];
        const g1 = frame.pixels[j + 1];
        const b1 = frame.pixels[j + 2];
        const a1 = frame.pixels[j + 3];

        const r2 = previousFramePixels[j];
        const g2 = previousFramePixels[j + 1];
        const b2 = previousFramePixels[j + 2];
        const a2 = previousFramePixels[j + 3];

        if (r1 === r2 && g1 === g2 && b1 === b2 && a1 === a2) {
          identicalPixels++;
        } else {
          totalDiff +=
            Math.abs(r1 - r2) +
            Math.abs(g1 - g2) +
            Math.abs(b1 - b2) +
            Math.abs(a1 - a2);
        }
      }

      const similarityPercent = (identicalPixels / sampleSize) * 100;
      const avgDiff = totalDiff / (sampleSize - identicalPixels);

      console.log(
        `[createAnimatedGIF] Frame ${i + 1} vs ${i} comparison (first ${sampleSize} pixels):`,
        {
          identicalPixels: identicalPixels,
          similarityPercent: similarityPercent.toFixed(2) + "%",
          averageDifference: avgDiff.toFixed(2),
        }
      );

      if (similarityPercent > 99) {
        console.warn(
          `[createAnimatedGIF] WARNING: Frame ${i + 1} appears to be nearly identical to frame ${i} (${similarityPercent.toFixed(2)}% similar). This will result in a very small GIF.`
        );
      }
    }

    // Store previous frame pixels for comparison
    previousFramePixels = new Uint8Array(frame.pixels);

    // Quantize colors to 256-color palette
    console.log(`[createAnimatedGIF] Quantizing colors for frame ${i + 1}...`);
    const quantizeStartTime = Date.now();
    const palette = quantize(frame.pixels, 256, {
      format: "rgb565", // Better quality
    });
    const quantizeDuration = Date.now() - quantizeStartTime;
    console.log(
      `[createAnimatedGIF] Quantization completed in ${quantizeDuration}ms, palette size: ${palette.length} bytes`
    );

    // Apply palette to get indexed bitmap
    console.log(`[createAnimatedGIF] Applying palette to frame ${i + 1}...`);
    const applyStartTime = Date.now();
    const index = applyPalette(frame.pixels, palette, "rgb565");
    const applyDuration = Date.now() - applyStartTime;
    console.log(
      `[createAnimatedGIF] Palette applied in ${applyDuration}ms, index size: ${index.length} bytes`
    );

    // Write frame with delay
    // gifenc expects delay in MILLISECONDS and converts to centiseconds internally (divides by 10)
    // So we pass frameDelay directly in milliseconds: 500ms stays as 500ms
    // The library will convert: 500ms -> 50 centiseconds internally
    //
    // IMPORTANT: iOS Photos and many GIF viewers have minimum delay requirements:
    // - Delays < 2 centiseconds are often treated as "as fast as possible" (defaulting to 10cs = 100ms)
    // - iOS Photos specifically plays GIFs faster if delays are below ~20 centiseconds (200ms)
    // - For reliable playback across all viewers, enforce minimum of 200ms (which becomes 20 centiseconds)
    // - This ensures consistent timing, especially on iOS devices
    let delayMs = frameDelay;

    // Enforce minimum delay for iOS Photos compatibility
    // Minimum 200ms ensures proper playback on iOS (becomes 20 centiseconds after gifenc conversion)
    const MIN_DELAY_MS = 200; // 200ms minimum for iOS compatibility
    if (delayMs < MIN_DELAY_MS) {
      console.warn(
        `[createAnimatedGIF] Frame ${i + 1}: Requested delay ${delayMs}ms is below iOS minimum of ${MIN_DELAY_MS}ms (20 centiseconds). Enforcing minimum for iOS Photos compatibility.`
      );
      delayMs = MIN_DELAY_MS;
    }

    const delayCentiseconds = Math.round(delayMs / 10); // For logging only
    console.log(`[createAnimatedGIF] Writing frame ${i + 1} to GIF...`);
    const writeStartTime = Date.now();
    gif.writeFrame(index, width, height, {
      palette,
      delay: delayMs, // Pass milliseconds directly - gifenc converts to centiseconds internally
      first: i === 0, // First frame needs to set global color table
    });
    const writeDuration = Date.now() - writeStartTime;

    console.log(
      `[createAnimatedGIF] Frame ${i + 1}/${frames.length} written in ${writeDuration}ms: ${width}x${height}, pixels: ${pixelDataSize} bytes, delay: ${delayMs}ms (${delayCentiseconds}cs after gifenc conversion), first: ${i === 0}`
    );
  }

  // Finish encoding
  console.log(`[createAnimatedGIF] Finishing GIF encoding...`);
  gif.finish();

  // Get GIF bytes
  const gifBytes = gif.bytes();
  console.log(
    `[createAnimatedGIF] GIF bytes() returned ${gifBytes.length} bytes`
  );

  // Verify GIF header (should start with GIF87a or GIF89a)
  if (gifBytes.length >= 6) {
    const header = String.fromCharCode(
      gifBytes[0],
      gifBytes[1],
      gifBytes[2],
      gifBytes[3],
      gifBytes[4],
      gifBytes[5]
    );
    console.log(
      `[createAnimatedGIF] GIF header: ${header}, total size: ${gifBytes.length} bytes`
    );

    if (!header.startsWith("GIF")) {
      console.error(`[createAnimatedGIF] ERROR: Invalid GIF header: ${header}`);
      throw new Error("GIF encoding failed - invalid header");
    }
  } else {
    console.error(
      `[createAnimatedGIF] ERROR: GIF bytes too short (${gifBytes.length} bytes), expected at least 6 bytes for header`
    );
    throw new Error("GIF encoding failed - bytes too short");
  }

  // Expected size calculation: for 4 frames at 1170x1560, even with heavy compression, should be > 100KB
  const expectedMinSize = (width * height * frames.length) / 10; // Rough estimate: 10% of raw pixel data
  if (gifBytes.length < expectedMinSize) {
    console.warn(
      `[createAnimatedGIF] WARNING: GIF size (${gifBytes.length} bytes) is much smaller than expected minimum (${expectedMinSize} bytes). This might indicate all frames are identical or encoding issue.`
    );
  }

  return gifBytes;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const requestStartTime = Date.now();
  console.log(`[create-filtered-gif] ===== REQUEST RECEIVED =====`);
  console.log(`[create-filtered-gif] Method: ${req.method}`);
  console.log(`[create-filtered-gif] URL: ${req.url}`);
  console.log(`[create-filtered-gif] Headers:`, {
    "content-type": req.headers["content-type"],
    "content-length": req.headers["content-length"],
    "user-agent": req.headers["user-agent"]?.substring(0, 100),
  });

  // Only allow POST requests
  if (req.method !== "POST") {
    console.log(
      `[create-filtered-gif] Rejected: Method not allowed (${req.method})`
    );
    return res.status(405).json({
      error: "Method not allowed",
      message: "Only POST requests are accepted",
    });
  }

  let tempFiles: formidable.File[] = [];

  try {
    console.log(`[create-filtered-gif] Starting FormData parsing...`);
    const parseStartTime = Date.now();

    // Parse multipart/form-data
    const { images, frameDelay } = await parseFormData(req);
    tempFiles = images;

    const parseDuration = Date.now() - parseStartTime;
    console.log(`[create-filtered-gif] FormData parsed in ${parseDuration}ms`);

    console.log(
      `[create-filtered-gif] Processing ${images.length} images, frameDelay: ${frameDelay}ms`
    );

    // Log file details for debugging
    images.forEach((file, index) => {
      console.log(
        `[create-filtered-gif] Image ${index + 1}: ${file.originalFilename || file.newFilename}, size: ${file.size} bytes, path: ${file.filepath}`
      );
    });

    // Step 1: Get dimensions for all images first (metadata only, lightweight)
    console.log(
      `[create-filtered-gif] Step 1: Checking dimensions for ${images.length} images...`
    );
    const imageDimensions: Array<{
      width: number;
      height: number;
      index: number;
    }> = [];

    for (let i = 0; i < images.length; i++) {
      const file = images[i];
      const filePath = file.filepath;
      const imageBuffer = fs.readFileSync(filePath);
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();

      if (!metadata.width || !metadata.height) {
        throw new Error(`Image ${i + 1}: Unable to read dimensions`);
      }

      imageDimensions.push({
        width: metadata.width,
        height: metadata.height,
        index: i,
      });

      console.log(
        `[create-filtered-gif] Image ${i + 1} dimensions: ${metadata.width}x${metadata.height}`
      );
    }

    // Step 2: Find minimum dimensions
    const minWidth = Math.min(...imageDimensions.map((d) => d.width));
    const minHeight = Math.min(...imageDimensions.map((d) => d.height));

    console.log(
      `[create-filtered-gif] Minimum dimensions found: ${minWidth}x${minHeight}`
    );

    // Step 3: Check if dimensions differ and validate 10% rule
    const hasDimensionMismatch = imageDimensions.some(
      (d) => d.width !== minWidth || d.height !== minHeight
    );

    if (hasDimensionMismatch) {
      console.log(
        `[create-filtered-gif] ===== DIMENSION MISMATCH DETECTED =====`
      );
      console.log(
        `[create-filtered-gif] Smallest width: ${minWidth}, Smallest height: ${minHeight}`
      );

      // Check each image's difference from minimum
      for (const dim of imageDimensions) {
        const widthDiff = dim.width - minWidth;
        const heightDiff = dim.height - minHeight;
        const widthDiffPercent = (widthDiff / minWidth) * 100;
        const heightDiffPercent = (heightDiff / minHeight) * 100;

        if (widthDiff > 0 || heightDiff > 0) {
          console.log(
            `[create-filtered-gif] Image ${dim.index + 1}: ${dim.width}x${dim.height} differs from min: width +${widthDiff} (${widthDiffPercent.toFixed(2)}%), height +${heightDiff} (${heightDiffPercent.toFixed(2)}%)`
          );
        }

        // Check if difference exceeds 10%
        if (widthDiffPercent > 10 || heightDiffPercent > 10) {
          throw new Error(
            `Image ${dim.index + 1} dimensions (${dim.width}x${dim.height}) differ from minimum (${minWidth}x${minHeight}) by more than 10%. Width difference: ${widthDiffPercent.toFixed(2)}%, Height difference: ${heightDiffPercent.toFixed(2)}%. All images must have dimensions within 10% of each other.`
          );
        }
      }

      console.log(
        `[create-filtered-gif] All dimension differences are within 10%, proceeding with normalization...`
      );
    } else {
      console.log(
        `[create-filtered-gif] All images have uniform dimensions, no normalization needed`
      );
    }

    // Step 4: Process all images, cropping to minimum dimensions if needed
    const processedFrames: ProcessedFrame[] = [];

    for (let i = 0; i < images.length; i++) {
      const file = images[i];
      const dim = imageDimensions[i];
      const needsCropping = dim.width !== minWidth || dim.height !== minHeight;

      if (needsCropping) {
        console.log(
          `[create-filtered-gif] Image ${i + 1}: ${dim.width}x${dim.height} - Cropping to ${minWidth}x${minHeight}`
        );
      } else {
        console.log(
          `[create-filtered-gif] Image ${i + 1}: ${dim.width}x${dim.height} - Already matches min dimensions`
        );
      }

      const frame = await processImageFrame(
        images[i],
        i,
        needsCropping ? { width: minWidth, height: minHeight } : undefined
      );

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
    console.log(
      `[create-filtered-gif] Frame dimensions: ${processedFrames[0].width}x${processedFrames[0].height}`
    );
    console.log(
      `[create-filtered-gif] Frame delay: ${frameDelay}ms (${Math.round(frameDelay / 10)} centiseconds)`
    );

    const gifBytes = createAnimatedGIF(processedFrames, frameDelay);

    console.log(
      `[create-filtered-gif] GIF created: ${(gifBytes.length / 1024).toFixed(1)}KB, ${processedFrames.length} frame(s)`
    );

    if (gifBytes.length < 10000) {
      console.warn(
        `[create-filtered-gif] WARNING: GIF size is suspiciously small (${(gifBytes.length / 1024).toFixed(1)}KB). Expected larger size for ${processedFrames.length} frames at ${processedFrames[0].width}x${processedFrames[0].height}`
      );
    }

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
    const totalDuration = Date.now() - requestStartTime;
    console.log(
      `[create-filtered-gif] Total request processing time: ${totalDuration}ms`
    );
    console.log(
      `[create-filtered-gif] Sending response: ${gifBytes.length} bytes, Content-Type: image/gif`
    );

    res.status(200);
    res.setHeader("Content-Type", "image/gif");
    res.setHeader("Content-Length", gifBytes.length.toString());
    res.end(Buffer.from(gifBytes));

    console.log(
      `[create-filtered-gif] ===== REQUEST COMPLETED SUCCESSFULLY =====`
    );
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
