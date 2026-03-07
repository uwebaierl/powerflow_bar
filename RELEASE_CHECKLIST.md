# Release Checklist (powerflow_bar)

- [ ] Move relevant `Unreleased` entries into a dated version section.
- [ ] Keep a fresh `## [Unreleased]` section for next changes.
- [ ] Bump `package.json` version for the release.
- [ ] Run `npm run build`.
- [ ] Run `npm run check:syntax`.
- [ ] Verify `dist/*.js` is regenerated and committed.
- [ ] Verify `hacs.json` fields are correct (`name`, `filename`, `content_in_root`).
- [ ] Verify release workflow uploads the correct dist asset.
- [ ] Re-check root governance docs:
  - [ ] `../CARD_CONTRACT.md`
  - [ ] `../DOCS_RELEASE_HYGIENE.md`
