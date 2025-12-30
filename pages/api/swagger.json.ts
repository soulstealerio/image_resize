import { NextApiRequest, NextApiResponse } from "next";
// @ts-ignore - swagger.config.js is a CommonJS module
const swaggerSpec = require("../../swagger.config");

/**
 * @swagger
 * /api/swagger.json:
 *   get:
 *     summary: Get OpenAPI/Swagger specification
 *     tags: [Documentation]
 *     responses:
 *       200:
 *         description: OpenAPI JSON specification
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Content-Type", "application/json");
  res.status(200).json(swaggerSpec);
}
