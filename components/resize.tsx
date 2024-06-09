import {
  Alert,
  Button,
  Card,
  CardSection,
  Center,
  Grid,
  Group,
  Image,
  Loader,
  Skeleton,
  Text,
} from "@mantine/core";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import NextImage from "next/image";
import { IconLoader } from "@tabler/icons-react";

export default function Resize() {
  const router = useRouter();
  const imageUrl =
    router?.query?.image_url?.toString() ||
    "https://storage.googleapis.com/526e6878-501f-4571-bfc8-0e78947cd452/5e8d2bcc-9c93-4c32-b7e4-1ea8303434f9.gif";
  const [previewImage, setPreviewImage] = useState("");
  const [previewImageSize, setPreviewImageSize] = useState(0);
  const [reload, setReload] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);

  // Preview image
  useEffect(() => {
    if (imageUrl) {
      // In case this is a reload.
      setPreviewImage("");
      setPreviewImageSize(0);

      // Fetch preview image.
      // We use fetch() here instead of something like axios or useAxios, because
      // axios can have a lot of problem with CORS and setting needed headers.
      // For this demo, we show the sure fire way to get it, although urls to image paths
      // may need to be listed in next.config.js's remotePatterns.
      fetch("/api/resize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*", // CORS
        },
        body: JSON.stringify({ image_url: imageUrl }),
      })
        .then(async (response) => response.json())
        .then((response) => {
          const { dataURIBase64 } = response;
          setPreviewImage(dataURIBase64);
          setPreviewImageSize(dataURIBase64.length);
          console.log(
            `Preview image loaded with size ${dataURIBase64.length} bytes.`,
          );
        })
        .catch((error) => {
          console.warn(`Error loading preview image, try again: ${error}`);
        })
        .finally(() => {
          setReload(false);
        });
    }
  }, [imageUrl, reload]);

  return (
    <main>
      <div>
        <Alert color="blue" title="Image Resize">
          <p>
            Provide this page with an HTTP URL param{" "}
            <code>?image_url=(url)</code> to resize whichever image you like.
          </p>
          <p>JPG and GIF formats officially tested and supported.</p>
        </Alert>

        <h4>Resize for {imageUrl}</h4>

        {reload ? (
          <Loader
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
            size="md"
          />
        ) : (
          <Button onClick={() => setReload(true)} color="blue">
            Reload
          </Button>
        )}

        <hr />

        <Grid>
          <Grid.Col span={4}>
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Card.Section>
                <Center>
                  {previewImage ? (
                    <Image
                      alt="blur"
                      src={previewImage}
                      // width={400}
                      height={500}
                    />
                  ) : (
                    <Skeleton height={468} circle mb="xl" />
                  )}
                </Center>
              </Card.Section>

              <Group justify="space-between" mt="md" mb="xs">
                <Text fw={500}>Blurred Preview</Text>
                <Text fw={500}>{previewImageSize} bytes</Text>
              </Group>
            </Card>
          </Grid.Col>

          <Grid.Col span={4}>
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <CardSection>
                <Center>
                  {previewImage ? (
                    <NextImage
                      alt="original with blur"
                      src={imageUrl || ""}
                      width={350}
                      height={500}
                      sizes="(max-width: 768px) 100vw, 33vw"
                      blurDataURL={previewImage || ""}
                      placeholder="blur"
                    />
                  ) : (
                    <Skeleton height={468} circle mb="xl" />
                  )}
                </Center>
              </CardSection>

              <Group justify="space-between" mt="md" mb="xs">
                <Text fw={500}>
                  Full image using blur as placeholder. Final full load may be
                  longer than raw due to Next.js render order.
                </Text>
              </Group>
            </Card>
          </Grid.Col>

          <Grid.Col span={4}>
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <CardSection>
                <Center>
                  {showFullImage && previewImage ? (
                    <Image alt="original" src={imageUrl} height={500} />
                  ) : (
                    <Skeleton height={468} circle mb="xl" />
                  )}
                </Center>
              </CardSection>

              <Group justify="space-between" mt="md" mb="xs">
                <Text fw={500}>Full, raw original image.</Text>
                <Button
                  onClick={() => setShowFullImage(!showFullImage)}
                  color="blue"
                >
                  {showFullImage ? "Hide" : "Show"} Full Image
                </Button>
              </Group>
            </Card>
          </Grid.Col>
        </Grid>
      </div>
    </main>
  );
}
