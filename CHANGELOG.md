# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-09-25

### Added

- Usurp the Shadow Throne (IAR) cards, plus Armory Deck - Malice (AMA) and other
  new printings — 252 new cards, 463 new versions. Pulled from the upstream
  `usurp-the-shadow-throne` branch ahead of its merge to `main`.

### Changed

- Most card images are now served as `.webp` from Legend Story, following the
  upstream database.
- Foil printings no longer show up as duplicate versions now that upstream gives
  each foil its own image URL.
- `build-data.mjs` can name sets that upstream still lists under a placeholder
  (currently Usurp the Shadow Throne), so the banner announces them.

## [0.2.0] - 2026-08-12

### Added

- Mastery Pack Warrior (MPW) cards, plus Armory Deck - Olympia (AOL) and other
  new printings — 80 new cards, 402 new versions.
- Dismissible announcement banner for posting site updates.

### Fixed

- `Update card data` workflow now opens a pull request instead of pushing
  directly to `main`, which branch protection rejects.

## [0.1.3] - 2026-07-08

### Fixed

- Mobile rendering is better now

## [0.1.2] - 2026-07-08

### Fixed

- Firefox centering issues for icons
- Safari print pages were cut off on top


## [0.1.1] - 2026-07-08

### Added

- Update GH action runners to more recent versions
- Tweak the UI elements a bit

## [0.1.0] - 2026-07-08

### Added

- Initial commit, adds the first version of the webpage.
- True-to-size printing
- Light/dark mode
- Accessibility options
