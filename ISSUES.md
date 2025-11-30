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

### Issue #4: Index Key Collisions Across Versions ✅
**Severity**: High  
**File**: `src/lib/search/index.ts` (lines 24-44), `src/lib/providers/online-provider.ts` (lines 157-169)  
**Description**: SearchIndex stores each topic by `topic.id`, and OnlineProvider explicitly sets that id to the caller-supplied `urlOrId`, which for relative lookups is just the path segment without versioning. If you fetch `/language/topic.htm` for v111 and later for v112, the second `addTopic` overwrites the first in the Map, leaving only one copy in the index. As a result, searching with `version: "v111"` will never return anything once another version of the same topic gets indexed.

**Fix**: Include the resolved version in the index key (e.g., `${topic.version}:${topic.id}`) or store a nested map keyed by version to keep versions isolated.

**Status**: ✅ Fixed - Changed index key from `topic.id` to `${topic.version}:${topic.id}` to prevent collisions. Added comprehensive tests to verify version isolation.

---

### Issue #5: Limit Parameter Ignores Zero/Negative Values ✅
**Severity**: Medium  
**File**: `src/lib/search/index.ts` (lines 103-106)  
**Description**: The guard `if (limit !== undefined && limit > 0)` means passing `limit: 0` (a common pattern to ask "give me zero results but report metadata") returns the full result set, and negative limits behave the same. Enforce the caller's request by clamping values < 0 to 0 (return []) and treating 0 as an empty result instead of the unbounded branch.

**Fix**: Handle `limit === 0` explicitly to return empty array, and clamp negative values to 0.

**Status**: ✅ Fixed - Updated limit handling to explicitly return empty array when limit is 0, and clamp negative values to 0. Added tests to verify this behavior.

---

### Issue #6: Tokenization Drops Meaning-Critical Symbols ✅
**Severity**: Medium  
**File**: `src/lib/search/index.ts` (lines 165-170)  
**Description**: Stripping everything that is not `[A-Za-z0-9_]` turns "C++", "C#", ".NET", "XFILENAME.DBR", etc. into meaningless tokens ("c" or "net"), so users cannot search for the actual terms that appear verbatim throughout the Synergy docs.

**Fix**: Update the tokenizer to keep language/significant symbols (at least +, #, ., /) or normalize them into canonical replacements (e.g., map C++ → c-plus-plus) so queries for these topics produce usable matches.

**Status**: ✅ Fixed - Updated tokenizer to normalize programming language symbols: C++ → c-plus-plus, C# → c-sharp, .NET → dot-net. Dots and forward slashes are converted to spaces for better tokenization. Added tests to verify programming language name preservation.

---

