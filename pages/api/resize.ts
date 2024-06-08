import { NextApiRequest, NextApiResponse } from "next";
const lqip = require('lqip-modern')

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
    const image_url = req.body.image_url || "";
    let data:any;
    let status = 200;

    try {
      // This will throw if the URL doesn't exist.
      console.log(`Fetching image for URL "${image_url}"...`)
      console.time('fetch')
      data = await fetch(image_url);
      console.log("... done fetch.")
      console.timeEnd('fetch')
      
      // This will throw if data isn't a response image like we expect.
      console.log(`Converting image "${image_url}" to local buffer...`);
      console.time('convert_buffer')
      data = Buffer.from(await data.arrayBuffer());
      console.log("... done converting to local buffer.")
      console.timeEnd('convert_buffer')
      
      console.log(`Converting image "${image_url}" to to preview...`);
      console.time('convert_preview')
      const result = await lqip(data,
        {
          outputFormat: "jpeg",
        });
      data = {
        content: result.content.data,
        dataURIBase64: result.metadata.dataURIBase64,
      };
      console.log("... done converting to preview.")
      console.timeEnd('convert_preview')

      console.log(`Done with image "${image_url}".`);
    } catch (error) {
      status = 500;
      console.error(error);
      data = {errorMessage: "Error loading image"};
    }

    res.status(status).send(data);
} 
