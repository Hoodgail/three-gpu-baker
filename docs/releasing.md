# Release guide

This repository is prepared for `Hoodgail/three-gpu-baker` and the public npm package `three-gpu-baker`. Update repository URLs if the final location differs.

## Verify a release

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:gpu
npm run package:check
npm pack
```

Review the packed file list and install the tarball in a clean consumer. Verify CPU import without a DOM, generated declarations, browser imports, and the Node-only OptiX entry. Hardware-specific native validation remains separate.

## GitHub Pages

In repository settings, choose GitHub Actions as the Pages source. Run the **Documentation** workflow. It builds with `/three-gpu-baker/` as the Vite base and uploads `site-dist`. For a custom domain/root deployment, change `DOCS_BASE` to `/`.

The workflow is manual so preparing the repository does not implicitly publish a website.

## npm

The **Publish** workflow runs on published GitHub releases, validates the version tag, tests and packs the package, then publishes with npm OIDC trusted publishing. Configure the exact repository, `publish.yml` workflow, and `npm` environment in the package's npm trusted-publisher settings; allow publishing. Require maintainer approval on the GitHub `npm` environment.

For a new package that does not yet have trusted publishing configured, an authorized maintainer must perform the first publish using their own npm account:

```sh
npm publish --access public
```

Never commit npm tokens. Verify ownership of the scope and package name before publishing. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and [Vite static deployment](https://vite.dev/guide/static-deploy).

A public version is immutable. Update `package.json`, lockfile, changelog, and documentation version labels before creating the next release tag.
