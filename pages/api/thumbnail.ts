import { NextApiRequest, NextApiResponse } from "next";
import sharp from "sharp";
import { LRUCache } from "lru-cache";

/**
 * Thumbnail API - Returns resized images for efficient mobile display
 *
 * Usage:
 *   GET /api/thumbnail?url=<image_url>&width=350&height=350
 *   GET /api/thumbnail?url=<image_url>&width=350&height=350&format=jpeg
 *
 * Query params:
 *   - url: Source image URL (required)
 *   - width: Target width in pixels (default: 350)
 *   - height: Target height in pixels (default: 350)
 *   - format: Output format - jpeg, png, webp, gif (default: auto-detect from URL)
 *   - quality: JPEG/WebP quality 1-100 (default: 80)
 *
 * Response:
 *   - Returns the resized image binary with appropriate Content-Type
 *   - For GIFs: Preserves animation (all frames resized)
 *
 * Caching:
 *   - In-memory LRU cache (300MB max)
 *   - Cache key: url + dimensions + format + quality
 *   - TTL: 24 hours (images don't change)
 *   - See README.md for caching strategy and future plans
 *
 * Memory savings example:
 *   - Original: 992x1488 = 5.9MB decoded
 *   - Thumbnail: 350x350 = 0.5MB decoded (~12x reduction)
 */

// ============================================================================
// THUMBNAIL CACHE
// ============================================================================
// In-memory LRU cache for processed thumbnails
// - Max 300MB to leave room for app memory
// - 24 hour TTL (images are immutable)
// - LRU eviction when full
// ============================================================================

interface CacheEntry {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
}

// Cache configuration
const CACHE_MAX_SIZE_MB = 300;
const CACHE_MAX_SIZE_BYTES = CACHE_MAX_SIZE_MB * 1024 * 1024;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Create LRU cache instance (module-level singleton)
const thumbnailCache = new LRUCache<string, CacheEntry>({
  maxSize: CACHE_MAX_SIZE_BYTES,
  sizeCalculation: (entry: CacheEntry) => entry.buffer.length,
  ttl: CACHE_TTL_MS,
  updateAgeOnGet: true, // Refresh TTL on access
  dispose: (value: CacheEntry, key: string, reason: string) => {
    console.log(
      `[cache] EVICTED key="${key.substring(0, 80)}..." ` +
        `reason=${reason} size=${(value.buffer.length / 1024).toFixed(1)}KB`
    );
  },
});

// Cache statistics for logging
let cacheStats = {
  hits: 0,
  misses: 0,
  lastLogTime: Date.now(),
};

// Generate cache key from request parameters
function getCacheKey(
  url: string,
  width: number,
  height: number,
  format: string,
  quality: number
): string {
  return `${url}|${width}x${height}|${format}|q${quality}`;
}

// Log cache statistics periodically
function logCacheStats() {
  const now = Date.now();
  // Log stats every 60 seconds if there's activity
  if (now - cacheStats.lastLogTime > 60000) {
    const hitRate =
      cacheStats.hits + cacheStats.misses > 0
        ? (
            (cacheStats.hits / (cacheStats.hits + cacheStats.misses)) *
            100
          ).toFixed(1)
        : "0";

    console.log(
      `[cache] STATS hits=${cacheStats.hits} misses=${cacheStats.misses} ` +
        `hitRate=${hitRate}% entries=${thumbnailCache.size} ` +
        `size=${(thumbnailCache.calculatedSize / 1024 / 1024).toFixed(1)}MB/${CACHE_MAX_SIZE_MB}MB`
    );
    cacheStats.lastLogTime = now;
  }
}

// ============================================================================
// API HANDLER
// ============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow GET and HEAD requests
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", ["GET", "HEAD"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  // For HEAD requests, we'll process normally but Next.js will strip the body
  const isHeadRequest = req.method === "HEAD";

  const { url, width, height, format, quality } = req.query;

  // Validate URL
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing required 'url' parameter" });
  }

  // Parse dimensions with defaults
  const targetWidth = parseInt(width as string, 10) || 350;
  const targetHeight = parseInt(height as string, 10) || 350;
  const outputQuality = parseInt(quality as string, 10) || 80;

  // Auto-detect format from URL if not specified
  const detectFormatFromUrl = (imageUrl: string): string => {
    const lowerUrl = imageUrl.toLowerCase();
    if (lowerUrl.includes(".gif")) return "gif";
    if (lowerUrl.includes(".png")) return "png";
    if (lowerUrl.includes(".webp")) return "webp";
    return "jpeg"; // default for .jpg, .jpeg, or unknown
  };

  const outputFormat = (format as string) || detectFormatFromUrl(url);

  // Validate format
  const validFormats = ["jpeg", "jpg", "png", "webp", "gif"];
  if (!validFormats.includes(outputFormat.toLowerCase())) {
    return res.status(400).json({
      error: `Invalid format '${outputFormat}'. Valid formats: ${validFormats.join(", ")}`,
    });
  }

  // Normalize format
  const normalizedFormat =
    outputFormat.toLowerCase() === "jpg" ? "jpeg" : outputFormat.toLowerCase();

  // Generate cache key
  const cacheKey = getCacheKey(
    url,
    targetWidth,
    targetHeight,
    normalizedFormat,
    outputQuality
  );

  // Check cache first
  const cachedEntry = thumbnailCache.get(cacheKey);
  if (cachedEntry) {
    cacheStats.hits++;
    const ageSeconds = Math.floor((Date.now() - cachedEntry.createdAt) / 1000);
    console.log(
      `[cache] HIT key="${cacheKey.substring(0, 60)}..." ` +
        `size=${(cachedEntry.buffer.length / 1024).toFixed(1)}KB age=${ageSeconds}s`
    );
    logCacheStats();

    // Serve from cache
    res.setHeader("Content-Type", cachedEntry.contentType);
    res.setHeader("Content-Length", cachedEntry.buffer.length);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Cache", "HIT");
    return res.status(200).send(cachedEntry.buffer);
  }

  // Cache miss - need to generate thumbnail
  cacheStats.misses++;
  console.log(`[cache] MISS key="${cacheKey.substring(0, 60)}..."`);
  logCacheStats();

  // Determine if we should preserve animation (for GIFs)
  const isAnimated = normalizedFormat === "gif";

  try {
    console.log(`[thumbnail] Fetching: ${url}`);
    console.time("[thumbnail] fetch");

    // Fetch the source image
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch image: ${response.status} ${response.statusText}`
      );
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    console.timeEnd("[thumbnail] fetch");
    console.log(
      `[thumbnail] Source size: ${(imageBuffer.length / 1024).toFixed(1)}KB`
    );

    console.time("[thumbnail] resize");
    console.log(
      `[thumbnail] Format: ${normalizedFormat}, Animated: ${isAnimated}`
    );

    // Resize with sharp
    // animated: true preserves all GIF frames, false extracts first frame only
    let pipeline = sharp(imageBuffer, { animated: isAnimated }).resize(
      targetWidth,
      targetHeight,
      {
        fit: "cover", // Cover the area, cropping if needed
        position: "center", // Center the crop
      }
    );

    // Apply output format
    switch (normalizedFormat) {
      case "jpeg":
        pipeline = pipeline.jpeg({ quality: outputQuality });
        break;
      case "png":
        pipeline = pipeline.png();
        break;
      case "webp":
        pipeline = pipeline.webp({ quality: outputQuality });
        break;
      case "gif":
        pipeline = pipeline.gif();
        break;
    }

    const resizedBuffer = await pipeline.toBuffer();
    console.timeEnd("[thumbnail] resize");
    console.log(
      `[thumbnail] Output size: ${(resizedBuffer.length / 1024).toFixed(1)}KB`
    );

    // Determine content type
    const contentTypes: Record<string, string> = {
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
    };
    const contentType = contentTypes[normalizedFormat] || "image/jpeg";

    // Store in cache
    const cacheEntry: CacheEntry = {
      buffer: resizedBuffer,
      contentType,
      createdAt: Date.now(),
    };
    thumbnailCache.set(cacheKey, cacheEntry);
    console.log(
      `[cache] STORED key="${cacheKey.substring(0, 60)}..." ` +
        `size=${(resizedBuffer.length / 1024).toFixed(1)}KB ` +
        `cacheSize=${(thumbnailCache.calculatedSize / 1024 / 1024).toFixed(1)}MB/${CACHE_MAX_SIZE_MB}MB`
    );

    // Set response headers
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", resizedBuffer.length);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Cache", "MISS");

    return res.status(200).send(resizedBuffer);
  } catch (error) {
    console.error("[thumbnail] Error:", error);
    return res.status(500).json({
      error: "Failed to process image",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// Increase body size limit for larger images
export const config = {
  api: {
    responseLimit: false,
  },
};
