Drop an `icon.ico` (256x256, multi-resolution) here to give the packaged .exe
and installer a custom icon. Until then, electron-builder falls back to the
default Electron icon — the app builds and runs fine either way.

To wire it up once you have one, add to package.json's `build.win`:
  "icon": "assets/icon.ico"
