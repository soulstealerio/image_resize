/**
 * Test script for /api/create-filtered-gif endpoint
 * Downloads images from URLs and sends them to the endpoint
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

// Image URLs from the session data
// Using first 4 JPG images which should have uniform dimensions
// (strip.png and .gif have different dimensions)
const imageUrls = [
  "https://storage.googleapis.com/526e6878-501f-4571-bfc8-0e78947cd452/41861edb-a715-4337-a8ed-ad72f225d6ff--7ed1feff-367b-42ae-95ae-4ce4d7d01cd8.jpg",
  "https://storage.googleapis.com/526e6878-501f-4571-bfc8-0e78947cd452/41861edb-a715-4337-a8ed-ad72f225d6ff--291cd2e2-5ff3-4d4d-900e-c56a45119412.jpg",
  "https://storage.googleapis.com/526e6878-501f-4571-bfc8-0e78947cd452/41861edb-a715-4337-a8ed-ad72f225d6ff--a04f0e85-bc89-42af-89fb-7ba7a75fce11.jpg",
  "https://storage.googleapis.com/526e6878-501f-4571-bfc8-0e78947cd452/41861edb-a715-4337-a8ed-ad72f225d6ff--7b12e983-9e52-434f-845b-7e394bd2ef13.jpg",
];

const API_URL = "http://localhost:3000/api/create-filtered-gif";
const FRAME_DELAY = 500; // milliseconds

// Create temp directory (in tests directory)
const tmpDir = path.join(__dirname, "test-tmp");
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

/**
 * Download a file from URL
 */
function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(filepath);

    protocol
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(
            new Error(`Failed to download ${url}: ${response.statusCode}`)
          );
          return;
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve(filepath);
        });
      })
      .on("error", (err) => {
        fs.unlinkSync(filepath);
        reject(err);
      });
  });
}

/**
 * Test the GIF endpoint
 */
async function testGifEndpoint() {
  console.log("🧪 Testing /api/create-filtered-gif endpoint\n");
  console.log(`📥 Downloading ${imageUrls.length} images...`);

  // Download all images
  const imagePaths = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    const filename = path.basename(new URL(url).pathname);
    const filepath = path.join(tmpDir, filename);

    try {
      await downloadFile(url, filepath);
      imagePaths.push(filepath);
      console.log(`  ✓ Downloaded: ${filename}`);
    } catch (error) {
      console.error(`  ✗ Failed to download ${filename}:`, error.message);
      return;
    }
  }

  console.log(`\n📤 Sending ${imagePaths.length} images to endpoint...`);
  console.log(`   URL: ${API_URL}`);
  console.log(`   Frame delay: ${FRAME_DELAY}ms\n`);

  // Create FormData
  const formData = new FormData();

  // Add images (using 'images[]' field name as per React Native example)
  for (const imagePath of imagePaths) {
    const filename = path.basename(imagePath);
    formData.append("images[]", fs.createReadStream(imagePath), {
      filename: filename,
      contentType: imagePath.endsWith(".png")
        ? "image/png"
        : imagePath.endsWith(".gif")
          ? "image/gif"
          : "image/jpeg",
    });
  }

  // Add frame delay
  formData.append("frameDelay", FRAME_DELAY.toString());

  // Send request
  const startTime = Date.now();

  formData.submit(API_URL, (err, res) => {
    if (err) {
      console.error("✗ Request failed:", err.message);
      cleanup();
      return;
    }

    const statusCode = res.statusCode;
    const contentType = res.headers["content-type"];

    console.log(`📥 Response: ${statusCode} ${res.statusMessage}`);
    console.log(`   Content-Type: ${contentType}`);

    if (statusCode !== 200) {
      // Read error response
      let errorData = "";
      res.on("data", (chunk) => {
        errorData += chunk.toString();
      });
      res.on("end", () => {
        try {
          const error = JSON.parse(errorData);
          console.error("✗ Error:", error.message || error.error);
        } catch (e) {
          console.error("✗ Error response:", errorData);
        }
        cleanup();
      });
      return;
    }

    if (!contentType || !contentType.includes("image/gif")) {
      console.error("✗ Unexpected content type:", contentType);
      cleanup();
      return;
    }

    // Save GIF (in tests directory)
    const outputPath = path.join(__dirname, "test-output.gif");
    const fileStream = fs.createWriteStream(outputPath);

    res.pipe(fileStream);

    fileStream.on("finish", () => {
      const duration = Date.now() - startTime;
      const stats = fs.statSync(outputPath);
      const sizeKB = (stats.size / 1024).toFixed(2);

      console.log(`\n✅ Success!`);
      console.log(`   Output: ${outputPath}`);
      console.log(`   Size: ${sizeKB} KB`);
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Frames: ${imagePaths.length}`);
      console.log(`\n🎉 GIF created successfully!\n`);

      cleanup();
    });

    fileStream.on("error", (err) => {
      console.error("✗ Failed to save GIF:", err.message);
      cleanup();
    });
  });
}

/**
 * Cleanup temporary files
 */
function cleanup() {
  console.log("🧹 Cleaning up temporary files...");
  try {
    if (fs.existsSync(tmpDir)) {
      const files = fs.readdirSync(tmpDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tmpDir, file));
      }
      fs.rmdirSync(tmpDir);
    }
  } catch (error) {
    console.warn("⚠ Warning: Failed to cleanup temp files:", error.message);
  }
}

// Run test
testGifEndpoint().catch((error) => {
  console.error("✗ Test failed:", error);
  cleanup();
  process.exit(1);
});
