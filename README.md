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

## Demo
See a page with React usage at http://imageresize.soulstealer.io/.

![demo](./doc/img/demo.gif)

## CI
Builds for Continous Integration are ran by Github Workflows (see ./github/workflows). Builds run within Docker on Github, and the following builds run and are tagged in the following scenarios:

* PR created/updated - `pr-<#>` built and tagged docker image pushed to dockerhub.
* PR merged - `int` (for integration) built and tagged docker image pushed to dockerhub. `minor` version of package.json semver version `<major.minor.patch>` is automatically bumped.
* GH release created as PRERELEASE - `staging` build and tagged docker image pushed to dockerhub.
* GH release created/updated as LATEST RELEASE - from package.json, `<major.minor.patch>` built and tagged docker image pushed to dockerhub.

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
