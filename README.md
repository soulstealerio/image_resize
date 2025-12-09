# Image Resize - Soul Stealer

This is a next.js web app for resizing images, specifically for low res, blurry previews. These low res previews can be swapped out for the high res image once it loads. This repo has React code examples that do this, which you can see deployed at http://imageresize.soulstealer.io/.

![demo](./doc/img/demo.gif)

## Features

### API

The main usage of this app is the api endpoint, /api/resize, which takes the following paramaters:

```
POST /api/resize
ContentType: application/json
{
  "image_url": "<url to some jpeg/gif>"
}
```

Result:

```
{
  "content": "<raw byte data>",
  "dataURIBase64": "<URI base64 data; this is what is commonly used for inlining image data>"
}
```

Errors:

```
500
{
  "errorMessage": "..."
}
```

## CI

Builds for Continous Integration are ran by Github Workflows (see ./github/workflows). Builds run within Docker on Github, and the following builds run and are tagged in the following scenarios:

- PR created/updated - `pr-<#>` built and tagged docker image pushed to dockerhub.
- PR merged - `int` (for integration) built and tagged docker image pushed to dockerhub. `minor` version of package.json semver version `<major.minor.patch>` is automatically bumped.
- GH release created as PRERELEASE - `staging` build and tagged docker image pushed to dockerhub.
- GH release created/updated as LATEST RELEASE - from package.json, `<major.minor.patch>` built and tagged docker image pushed to dockerhub.

## CD

For the moment, `kubectl edit deployment imageresize`, search for image:, and bump the version manually. In the near future, ArgoCD config will be deployed to do this for us.

## npm scripts

### Build and dev scripts

- `dev` – start dev server
- `build` – bundle application for production
- `export` – exports static website to `out` folder
- `analyze` – analyzes application bundle with [@next/bundle-analyzer](https://www.npmjs.com/package/@next/bundle-analyzer)

### Testing scripts

- `typecheck` – checks TypeScript types
- `lint` – runs ESLint
- `prettier:check` – checks files with Prettier
- `jest` – runs jest tests
- `jest:watch` – starts jest watch
- `test` – runs `jest`, `prettier:check`, `lint` and `typecheck` scripts

### Other scripts

- `prettier:write` – formats all files with Prettier

---

## Thumbnail API

A new endpoint for generating resized thumbnails, optimized for mobile app scrolling performance.

### Endpoint

```
GET /api/thumbnail?url=<image_url>&width=350&height=350
```

### Query Parameters

| Parameter | Required | Default     | Description                                 |
| --------- | -------- | ----------- | ------------------------------------------- |
| `url`     | Yes      | -           | Source image URL                            |
| `width`   | No       | 350         | Target width in pixels                      |
| `height`  | No       | 350         | Target height in pixels                     |
| `format`  | No       | Auto-detect | Output format: `jpeg`, `png`, `webp`, `gif` |
| `quality` | No       | 80          | JPEG/WebP quality (1-100)                   |

### Response

- Returns the resized image binary with appropriate `Content-Type` header
- For GIFs: Preserves animation (all frames resized)
- Includes `X-Cache: HIT` or `X-Cache: MISS` header

### Examples

```bash
# Auto-detect format (GIF in = GIF out)
curl "http://localhost:3000/api/thumbnail?url=https://example.com/photo.gif&width=350&height=350" -o thumb.gif

# Force JPEG output (static, smaller file)
curl "http://localhost:3000/api/thumbnail?url=https://example.com/photo.gif&width=350&height=350&format=jpeg" -o thumb.jpg

# WebP format (best compression)
curl "http://localhost:3000/api/thumbnail?url=https://example.com/photo.png&width=200&height=200&format=webp&quality=75" -o thumb.webp
```

### Size Comparison

| Format       | Original (992×1488) | Thumbnail (350×350) | Reduction |
| ------------ | ------------------- | ------------------- | --------- |
| Animated GIF | ~2MB                | ~300KB              | 85%       |
| Static JPEG  | ~500KB              | ~10-25KB            | 95-98%    |
| WebP         | ~400KB              | ~8-15KB             | 96-98%    |

### Memory Impact (Decoded)

| Format         | Original | Thumbnail | Reduction |
| -------------- | -------- | --------- | --------- |
| GIF (4 frames) | ~23MB    | ~2MB      | 91%       |
| Static image   | ~6MB     | ~0.5MB    | 92%       |

---

## Caching Strategy

### Current Implementation: In-Memory LRU Cache (Phase 1)

The thumbnail API uses an in-memory LRU (Least Recently Used) cache to avoid re-processing identical requests.

#### Configuration

| Setting  | Value    | Rationale                                   |
| -------- | -------- | ------------------------------------------- |
| Max Size | 300MB    | Leaves room for app memory (~512MB-1GB pod) |
| TTL      | 24 hours | Images are immutable                        |
| Eviction | LRU      | Removes least-recently-accessed items first |

#### Cache Key

```
{url}|{width}x{height}|{format}|q{quality}
```

Example: `https://storage.../image.gif|350x350|gif|q80`

#### Capacity Estimates

| Thumbnail Type | Avg Size | Items in 300MB |
| -------------- | -------- | -------------- |
| Animated GIF   | 300KB    | ~1,000         |
| Static JPEG    | 15KB     | ~20,000        |
| Mixed (50/50)  | 150KB    | ~2,000         |

#### Logging

The cache logs all operations for monitoring:

```
[cache] HIT key="https://storage..." size=312.5KB age=3600s
[cache] MISS key="https://storage..."
[cache] STORED key="https://storage..." size=312.5KB cacheSize=45.2MB/300MB
[cache] EVICTED key="https://storage..." reason=evict size=298.1KB
[cache] STATS hits=1523 misses=47 hitRate=97.0% entries=892 size=267.8MB/300MB
```

#### When This Breaks Down

| Scenario           | Symptom                        | Solution                  |
| ------------------ | ------------------------------ | ------------------------- |
| >1k animated GIFs  | Cache full, high eviction rate | Switch to JPEG or Phase 2 |
| Multiple k8s pods  | Each pod has separate cache    | Move to Phase 2 or 3      |
| Frequent deploys   | Cold cache, high miss rate     | Move to Phase 3           |
| >100k requests/day | Server CPU bottleneck          | Add CDN (Phase 2)         |

---

### Future Caching Options

#### Phase 2: Cloud CDN

Add GCP Cloud CDN in front of this service.

**When to implement:**

- Traffic exceeds 50k requests/day
- Running multiple pods (cache not shared)
- Need global edge caching

**Implementation:**

1. The existing `Cache-Control: public, max-age=31536000` header is already CDN-compatible
2. Configure Cloud CDN to cache responses
3. CDN handles cache invalidation automatically via TTL

**Costs:** ~$0.02-0.08/GB served

#### Phase 3: GCS Bucket Storage

Write thumbnails to GCS alongside original images.

**When to implement:**

- Need persistence across deploys
- Want to serve directly from GCS (bypass this service)
- Very high volume (>500k/day)

**Implementation:**

```
gs://bucket/original.gif           ← Source image
gs://bucket/thumbs/original_350x350.gif  ← Generated thumbnail
```

**Flow:**

1. Check if thumbnail exists in GCS
2. If yes, redirect or serve from GCS
3. If no, generate, store in GCS, then serve

**Costs:** ~$0.02/GB/month storage + $0.12/GB egress

#### Phase 4: Redis/Memcached (if needed)

Shared cache across multiple pods.

**When to implement:**

- Running 3+ pods
- Need shared cache without CDN
- Want fine-grained cache control

**Implementation:**

- Deploy Redis in k8s cluster
- Replace LRU cache with Redis client
- Same key structure, but shared across all pods

**Costs:** ~$50-100/month for managed Redis, or self-host in k8s
