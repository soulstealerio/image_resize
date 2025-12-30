const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Image Resize API",
      version: "1.0.0",
      description:
        "API for image processing operations including thumbnail generation and GIF creation from filtered images.",
      contact: {
        name: "Soul Stealer",
      },
    },
    servers: [
      {
        url: process.env.API_BASE_URL || "http://localhost:3000",
        description: "Development server",
      },
    ],
  },
  apis: [
    "./pages/api/**/*.ts", // Path to the API files
    "./pages/api/**/*.js", // Also check JS files if any
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
