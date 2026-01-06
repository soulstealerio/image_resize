/**
 * Test script for /api/create-filtered-gif endpoint
 * Downloads images from URLs and sends them to the endpoint
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

// Image URLs - can be provided via command line arguments or use defaults
// Usage: node test-gif-endpoint.js [url1] [url2] [url3] [url4]
// Or set IMAGE_URLS environment variable as JSON array

let imageUrls;

if (process.argv.length > 2) {
  // Use URLs from command line arguments
  imageUrls = process.argv.slice(2);
  console.log(
    `Using ${imageUrls.length} image URLs from command line arguments`
  );
} else if (process.env.IMAGE_URLS) {
  // Use URLs from environment variable (JSON array)
  try {
    imageUrls = JSON.parse(process.env.IMAGE_URLS);
    console.log(
      `Using ${imageUrls.length} image URLs from IMAGE_URLS environment variable`
    );
  } catch (error) {
    console.error("Error parsing IMAGE_URLS:", error.message);
    process.exit(1);
  }
} else {
  // Default URLs from session c3e84c84-6516-4dcf-8648-0e51c8cbc228
  // Using 4 JPG images (filtering out strip.png and .gif)
  imageUrls = [
    "https://storage.googleapis.com/526e6878-501f-4571-bfc8-0e78947cd452/c3e84c84-6516-4dcf-8648-0e51c8cbc228--be03d2e7-2e0e-4892-8336-6ee4f1eaf469.jpg",
    "https://storage.googleapis.com/526e6878-501f-4571-bfc8-0e78947cd452/c3e84c84-6516-4dcf-8648-0e51c8cbc228--75a48c0f-31a1-49fd-acdf-6e1d54740927.jpg",
    "https://storage.googleapis.com/526e6878-501f-4571-bfc8-0e78947cd452/c3e84c84-6516-4dcf-8648-0e51c8cbc228--ff3b32bc-7f52-4a6f-be29-67b7a7baa176.jpg",
    "https://storage.googleapis.com/526e6878-501f-4571-bfc8-0e78947cd452/c3e84c84-6516-4dcf-8648-0e51c8cbc228--ea7b7c88-cfbe-4d66-9df9-ffdad2b509ac.jpg",
  ];
  console.log(
    `Using default image URLs from session c3e84c84-6516-4dcf-8648-0e51c8cbc228 (${imageUrls.length} images)`
  );
}

const API_URL = "http://imageresize.soulstealer.io/api/create-filtered-gif";
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
