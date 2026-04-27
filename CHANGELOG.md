# Changelog

This file records user-facing changes and data compatibility notes for each release.

## [2.0.1] - 2026-04-27

### Changed

- Improved the installer distribution flow for non-technical users.
- Unified the installer artifact name as `WorkHelper-Setup-x.x.x.exe`.
- Switched the NSIS installer to one-click mode to reduce setup steps.
- Simplified the folder-save bridge for the Electron desktop app.

### Data Compatibility

- No stored data format change.
- Added ignore rules so local user data such as `workhelper-storage.json`, `app-state*.json`, and backup JSON files are not committed.

## [2.0.0] - 2026-04-27

### Added

- Added the Windows Electron desktop app.
- Added NSIS installer generation via `electron-builder`.
- Added GitHub Actions release publishing for `v*` tags.
- Added auto-update support via `electron-updater`.
- Added Electron main-process persistence using `app-state.v1.json` under `userData`, plus optional folder sync via `workhelper-storage.json`.

### Data Compatibility

- 2.0.0 is the compatibility baseline for the desktop app.
- Users migrating from 1.x browser/ZIP builds should use backup JSON export/import.

### Changed

- The primary usage path is now installation with `WorkHelper-Setup-x.x.x.exe`.
- Old portable launch files were removed from the repository.

## [1.4.0] - 2026-04-16

### Added

- Added `WorkHelper-serve.exe` for the old portable browser build.

### Changed

- Unified old launcher priority: exe, Node, direct file open.

## [1.3.1] - 2026-04-16

### Changed

- Simplified the old `??.bat` path.
- Added old `??-server.bat` for localhost startup.

## [1.3.0] - 2026-04-16

### Fixed

- Normalized the old launcher batch files to avoid Windows cmd encoding issues.

### Changed

- Changed yearly overtime aggregation defaults.

## [1.2.0] - 2026-04-16

### Added

- Added folder autosave for the old browser build.
- Added localhost startup support for secure browser folder access.

## [1.1.0] - 2026-04-16

### Added

- Added Excel export for overtime and 36 Agreement views.

## [1.0.0] - 2026-04-16

### Added

- Initial changelog.
- Added user documentation and app version display.
