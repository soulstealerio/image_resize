// import Image from 'next/image'
// import styles from './page.module.css'
import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export default function Home() {
  const router = useRouter();
  const {image_url: imageUrl} = `${router.query}`;
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

  console.log({imageUrl, image})

  return (
    <main className="">
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
  </main>
  )
}
