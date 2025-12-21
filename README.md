Navody
======

Electron app for processing product PDFs and generating labels.

Quick start
-----------

- Install dependencies: `npm ci`
- Start in development: `npm start` (if configured)
- Build distributables locally: `npm run dist` (requires electron-builder)

Build Windows on GitHub Actions
-------------------------------

This repository includes a workflow that builds Windows artifacts on each push to `main` or `master` and uploads the output as workflow artifacts.

Notes
-----
- The `samples/` folder and `data.sqlite` are excluded from git and from the packaged build by default.
- If you want a Windows .exe but don't have a Windows machine, use the included GitHub Actions workflow or run a Windows VM/container.
