import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export default function Home() {
  const router = useRouter();
  const imageUrl = router.query.image_url || "https://storage.googleapis.com/526e6878-501f-4571-bfc8-0e78947cd452/5e8d2bcc-9c93-4c32-b7e4-1ea8303434f9.gif";
  const [image, setImage] = useState("")

  useEffect(() => {
    if (imageUrl) {
      fetch('/api/resize', {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({image_url: imageUrl}),
      })
        .then(async response => response.json())
        .then(response => {
          const {dataURIBase64} = response
          setImage(dataURIBase64)
        });
    }
  }, [imageUrl]);

  return (
    <main>
      <div>
        <p>Provide this page with an HTTP URL param <code>?image_url=(url)</code> to resize whichever image you like.</p>
        <p>JPG and GIF formats officially tested and supported.</p>
        <p>Resize for {imageUrl}, blur:</p>
        {image && 
          <Image
            alt="blur"
            src={image}
            width={400}
            height={400}
          />
        }
        <p>Full image using blur as placeholder:</p>
        {image && 
          <Image
            alt="original with blur"
            src={imageUrl || ""}
            height={400}
            width={400}
            // fill={true}
            blurDataURL={image}
            placeholder="blur"
          />
        }
        <p>Full image:</p>
        {image && 
          <Image
            alt="original"
            src={imageUrl}
            height={400}
            width={400}
          />
        }
    </div>
  </main>
  )
}
