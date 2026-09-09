# Changelog

All notable changes to this skill will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] - 2026-09-09

### Added
- Initial skill: generate a Shop Builder storefront from a Steam store listing using the
  four store-listing import commands (`parse-listing`, `generate-structure`, `add-template`,
  `create-portal`), plus the surrounding steps that are easy to miss —
  `create-website` before the import, `set-landing-type` after it (without which the preview
  404s), and `get-structure` to verify, since the mutation response is not evidence the
  import worked.
- Documents the slug-vs-landing-id split that 500s the block commands, and flags the three
  unverified parts of the underlying API (`parse-listing` request and response shapes,
  `create-portal` payload).
