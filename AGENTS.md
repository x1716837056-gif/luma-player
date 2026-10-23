# Project workflow

- Preserve the existing Luma design and local/NAS media-library behavior.
- Treat media folders as read-only. Keep credentials, library databases, viewing history, local caches, and runtime binaries out of Git.
- Run checks appropriate to each change before committing. For application changes, use the unit tests, TypeScript build, and relevant browser or Electron smoke checks.
- The user requested GitHub synchronization for future updates. After completing and verifying an authorized project change, commit the relevant source changes and push to the configured GitHub origin. Do not include unrelated work or secrets. If authentication or the network blocks synchronization, report that clearly and retain the local commit for retry.
- Keep the repository private unless the user explicitly requests public visibility. Do not force-push, rewrite published history, or publish releases without a task that calls for it.
