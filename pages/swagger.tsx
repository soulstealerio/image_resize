import { useEffect } from "react";
import Head from "next/head";

/**
 * Swagger UI page for API documentation
 */
export default function SwaggerPage() {
  useEffect(() => {
    // Dynamically load Swagger UI
    const script = document.createElement("script");
    script.src = "https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js";
    script.async = true;
    script.onload = () => {
      // @ts-ignore - SwaggerUIBundle is loaded dynamically
      const ui = window.SwaggerUIBundle({
        url: "/api/swagger.json",
        dom_id: "#swagger-ui",
        presets: [
          // @ts-ignore
          window.SwaggerUIBundle.presets.apis,
          // @ts-ignore
          window.SwaggerUIBundle.presets.standalone,
        ],
        layout: "BaseLayout",
      });
    };

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/swagger-ui-dist@5/swagger-ui.css";
    document.head.appendChild(link);
    document.body.appendChild(script);

    return () => {
      // Cleanup
      document.head.removeChild(link);
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  return (
    <>
      <Head>
        <title>API Documentation - Image Resize</title>
        <meta
          name="description"
          content="API documentation for Image Resize service"
        />
      </Head>
      <div id="swagger-ui" style={{ padding: "20px" }} />
    </>
  );
}
