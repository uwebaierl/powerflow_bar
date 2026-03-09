# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project uses Semantic Versioning.

## [Unreleased]

### Changed
- Updated README combined setup section to link both companion cards (Battery Bar + House Energy Bar).
- Replaced `powerflow_bar_combined_01.png` with the newer combined screenshot used by House Energy Bar.

## [1.1.0] - 2026-03-04

### Added
- Per-segment visibility hysteresis for PV, Battery, Battery Output, and Grid.
- Editor controls for hysteresis thresholds with nested `hysteresis.*` YAML output.

### Changed
- Segment visibility changes now use a softer reveal/hide transition.

## [1.0.1] - 2026-03-02

### Changed
- Updated README screenshots to use absolute raw GitHub image URLs for better compatibility with HACS rendering.

## [1.0.0] - 2026-03-02

### Changed
- Refreshed the README installation instructions with recommended HACS, manual HACS, and manual installation flows.
- Added README screenshots and updated their layout for GitHub rendering.

## [0.1.0] - 2026-02-25

### Added
- Initial public release of PowerFlow Bar.
- HACS metadata (`hacs.json`) and GitHub release workflow.
- Single-row animated segmented power card with configurable entities, icons, palette, and motion tuning.
