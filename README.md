# Image Resize - Soul Stealer

This is a next.js web app for resizing images.

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
  dataURIBase64: "<URI base64 data; this is what is commonly used for inlining image data>"
}
```
Errors: 
```
500
{
  "errorMessage": "..."
}
```

## Demo
See a page with React usage at http://imageresize.soulstealer.io/

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
