#!/usr/bin/env bash
read -s -p "GitHub PAT (repo+workflow): " GITHUB_TOKEN; echo
if [ -z "$GITHUB_TOKEN" ]; then echo "No token, aborting"; exit 1; fi
curl -v -X POST -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/TheAnhD/navody/actions/workflows/build-windows.yml/dispatches" \
  -d '{"ref":"main"}'
