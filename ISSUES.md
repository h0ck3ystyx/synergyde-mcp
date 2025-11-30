# Security and Code Quality Issues

## High Priority

### Issue #1: Directory Traversal via Unsanitized Version ✅
**Severity**: High  
**File**: `src/lib/cache/cache-manager.ts` (lines 91, 138)  
**Description**: The `set()`, `get()`, and `has()` methods pass the `version` argument directly into `join()` while only sanitizing the topic ID. A caller can supply a version such as `../../tmp/pwned`, which resolves outside `SYNERGYDE_CACHE_DIR`, allowing read/write of arbitrary files with the server's privileges.

**Fix**: Sanitize/whitelist version strings (e.g., allow `[A-Za-z0-9._-]`) before using them in file-system paths.

**Status**: ✅ Fixed - Added `sanitizeVersion()` method that whitelists only `[A-Za-z0-9._-]` characters, preventing directory traversal attacks. All version parameters are now sanitized before use in file paths.

---

## Medium Priority

### Issue #2: Blocking existsSync Calls in Async Methods ✅
**Severity**: Medium  
**File**: `src/lib/cache/cache-manager.ts` (lines 32, 52, 95, 128)  
**Description**: Every cache operation performs multiple synchronous `existsSync` checks, which block the event loop and defeat the purpose of exposing async APIs. Under load (especially once MCP tools start making many concurrent topic lookups), this will show up as latency spikes.

**Fix**: Switch to the `fs/promises` equivalents (`await access(...)` or `stat`) so reads/writes stay non-blocking.

**Status**: ✅ Fixed - Replaced all `existsSync()` calls with async `access()` from `fs/promises`. All file system checks are now non-blocking and properly async.

---

### Issue #3: Coverage Gates (Already Resolved)
**Severity**: Medium  
**File**: `vitest.config.ts`, `src/lib/cache/cache-manager.ts`  
**Description**: ~~The Vitest config now includes `src/lib/cache/**/*.ts` in coverage targets and enforces 80% global thresholds, but there are no tests that load or exercise the cache manager. Running `npm run test -- --coverage` will therefore drop overall coverage sharply below 80% and fail Phase 2a's quality gate.~~

**Status**: ✅ Resolved - Comprehensive test suite exists with 91.95% statement coverage

---

