# semantic-release-firefox

[![npm version](https://img.shields.io/npm/v/semantic-release-firefox.svg)](https://www.npmjs.com/package/semantic-release-firefox)
[![travis](https://img.shields.io/travis/felixfbecker/semantic-release-firefox/master.svg)](https://travis-ci.org/felixfbecker/semantic-release-firefox)
[![codecov](https://codecov.io/gh/felixfbecker/semantic-release-firefox/branch/master/graph/badge.svg)](https://codecov.io/gh/felixfbecker/semantic-release-firefox)
[![dependencies ](https://david-dm.org/felixfbecker/semantic-release-firefox/status.svg)](https://david-dm.org/felixfbecker/semantic-release-firefox)
[![peerDependencies](https://david-dm.org/felixfbecker/semantic-release-firefox/peer-status.svg)](https://david-dm.org/felixfbecker/semantic-release-firefox?type=peer)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

A [`semantic-release`](https://github.com/semantic-release/semantic-release) plugin for you to be able to easily publish Firefox Extensions using it's automated release.
Will update the version in the manifest, create a `.xpi`, zip your sources and submit everything for review, including semantic release notes.

Since Mozilla does not expose an API to do fully automated extension releases, runs a headless Chrome through [Puppeteer](https://github.com/GoogleChrome/puppeteer) to upload the files through the web form.

## Plugins

### verifyConditions

Verify the presence of the authentication (set via environment variables).

### prepare

Write the correct version to the `manifest.json` and creates a `xpi` file of the whole dist folder.

- `xpiPath`: Required, the filename of the xpi file.
- `distFolder`: Required, the folder that will be zipped.
- `manifestPath`: Optional, the path of the manifest inside the dist folder. Defaults to `${distFolder}/manifest.json`.
- `sourcesGlob`: Optional, a glob pattern of source files that will be zipped and submitted for review. Defaults to all files in the cwd (`**`)
- `sourcesGlobOptions`: Optional, glob options passed to [node-glob](https://github.com/isaacs/node-glob#options). Defaults to ignore `node_modules`, `distFolder`, `xpiPath` and `sourcesArchivePath`. You can use this for example if
  - you need to include dotfiles (set `{ dot: true }`)
  - if you need to include certain private packages from `node_modules` (set `ignore: 'node_modules/!(privatepkg|privatepkg2)/**'`). Make sure to still exclude `sourcesArchivePath` or the plugin may get stuck in an infinite loop trying to add the archive to itself!
- `sourcesArchivePath`: Optional, the file path for the zip with the source files that will be created. Defaults to `./sources.zip`. Set this to `null` to not create a sources archive.

### publish

Uploads the generated xpi file, a zip of the sources and submits it together with release notes.

- `xpiPath`: Required, the filename of the xpi file.
- `addOnSlug`: Required, The URL slug of the extension, as in `https://addons.mozilla.org/en-US/firefox/addon/SLUG/`
- `sourcesArchivePath`: Optional, the file path for the zip with the source code that will be uploaded. Defaults to `./sources.zip`. Set this to `null` to not upload a sources archive.
- `notesToReviewer`: Optional, notes to the reviewer that will be submitted for every version. For example, you could link to the source code on GitHub.

## Configuration

### Mozilla Add-On hub authentication

The following environment variables have to be made available in your CI environment: `FIREFOX_EMAIL` and `FIREFOX_PASSWORD`.
It is recommended to create a bot account for them.
The account must have 2FA disabled.
Make sure the account accepted the terms & agreements by visiting the submit page once (otherwise the release will fail).

### Release configs

Use `semantic-release-chrome` as part of `verifyConditions`, `prepare` and `publish`.

A basic config file example is available below:

```json
{
  "verifyConditions": ["semantic-release-firefox", "@semantic-release/github"],
  "prepare": [
    {
      "path": "semantic-release-firefox",
      "xpiPath": "my-extension.xpi",
      "distFolder": "dist"
    }
  ],
  "publish": [
    {
      "path": "semantic-release-firefox",
      "xpiPath": "my-extension.xpi",
      "addOnSlug": "my-extension"
    },
    {
      "path": "@semantic-release/github",
      "assets": [
        {
          "path": "my-extension.xpi"
        }
      ]
    }
  ]
}
```

## Development

Tests for the `publish` plugin are running against a mock AMO server written with Express.
Run them with `npm test`.
