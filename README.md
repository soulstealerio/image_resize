This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

API requests for resize from a JS client should look like:
```
fetch('/api/resize', {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({image_url: imageUrl}),
})
.then(async response => response.json())
.then(response => {
    const {dataURIBase64} = response
    // Do something like use a React set-state callback from useState.
    // setImage(dataURIBase64)

    // dataURIBase64 is useful for things like next/image's 
    // blurDataURL.
});
```

A resize demo for the webpage is http://localhost:3000/resize?image_url=https://storage.googleapis.com/526e6878-501f-4571-bfc8-0e78947cd452/e55334ae-75ac-42ab-8ab1-dc613b20261e--b27b7f6e-672d-4cbe-bd80-8cdd206b11d1.jpg