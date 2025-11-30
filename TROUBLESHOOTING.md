# Troubleshooting Guide

This guide helps resolve common issues when using the Synergy/DE MCP Server.

## Error Payload Fields

All tools and resources return structured error payloads with the following fields:

### Error Payload Structure

```typescript
{
  code: string;           // Error code (see below)
  message: string;        // Human-readable error message
  details?: {             // Additional context
    // Fields vary by error type
  };
  retryable?: boolean;    // Whether the error is retryable
}
```

### Error Codes and Common Resolutions

#### `INVALID_INPUT`
**Meaning:** Invalid input parameters provided to a tool.

**Common Causes:**
- Empty or missing required fields
- Invalid data types
- Negative values where not allowed

**Resolution:**
- Check the tool's input schema
- Verify all required fields are provided
- Ensure data types match expected types (string, number, etc.)
- Check for negative values in limit/max_chunks parameters

**Example:**
```json
{
  "code": "INVALID_INPUT",
  "message": "Invalid input for query:  (must be a non-empty string)",
  "details": {
    "field": "query",
    "value": "",
    "reason": "must be a non-empty string"
  },
  "retryable": false
}
```

#### `TOPIC_NOT_FOUND`
**Meaning:** The requested topic doesn't exist.

**Common Causes:**
- Incorrect topic ID or URL
- Topic doesn't exist in the specified version
- Network error during fetch (may be reported as TOPIC_NOT_FOUND)

**Resolution:**
- Verify the topic ID is correct
- Check if the topic exists in the specified version
- Try using `describe_docs` to see available versions
- Check server logs for network errors
- If using local docs, verify the file exists

**Example:**
```json
{
  "code": "TOPIC_NOT_FOUND",
  "message": "Topic not found: Language/nonexistent.htm (version: latest)",
  "details": {
    "topic_id": "Language/nonexistent.htm",
    "version": "latest",
    "lookup_method": "provider",
    "provider_source": "online"
  },
  "retryable": false
}
```

#### `SECTION_NOT_FOUND`
**Meaning:** The requested section doesn't exist.

**Common Causes:**
- Incorrect section name
- Section doesn't exist in the specified version
- Typo in section name

**Resolution:**
- Use `describe_docs` to get available sections
- Check the section name spelling
- Verify the section exists in the specified version
- Check if section names are case-sensitive

**Example:**
```json
{
  "code": "SECTION_NOT_FOUND",
  "message": "Section not found: Langauge (version: latest)",
  "details": {
    "section": "Langauge",
    "version": "latest",
    "available_sections": ["Language", "Reference", "Getting Started"]
  },
  "retryable": false
}
```

#### `VERSION_NOT_FOUND`
**Meaning:** The requested documentation version doesn't exist.

**Common Causes:**
- Incorrect version string
- Version not available in the documentation

**Resolution:**
- Use `describe_docs` to get available versions
- Check version format (e.g., "v111", "latest")
- Verify the version exists on the documentation site

**Example:**
```json
{
  "code": "VERSION_NOT_FOUND",
  "message": "Version not found: v999",
  "details": {
    "version": "v999",
    "available_versions": ["latest", "v111", "v112"]
  },
  "retryable": false
}
```

#### `NETWORK_ERROR`
**Meaning:** Network or HTTP error occurred.

**Common Causes:**
- No internet connection
- Documentation site is down
- Rate limiting or timeout
- Invalid URL

**Resolution:**
- Check internet connectivity
- Verify the documentation site is accessible
- Wait and retry (error is usually retryable)
- Check `SYNERGYDE_DOC_BASE_URL` configuration
- Review server logs for specific HTTP error codes

**Example:**
```json
{
  "code": "NETWORK_ERROR",
  "message": "Network error fetching https://www.synergex.com/docs/topic.htm: Connection timeout",
  "details": {
    "url": "https://www.synergex.com/docs/topic.htm",
    "reason": "Connection timeout"
  },
  "retryable": true
}
```

#### `CACHE_ERROR`
**Meaning:** Cache operation failed.

**Common Causes:**
- Disk full
- Permission issues
- Corrupted cache files

**Resolution:**
- Check disk space
- Verify `SYNERGYDE_CACHE_DIR` is writable
- Check file permissions
- Clear cache directory if corrupted
- Review server logs for specific error details

**Example:**
```json
{
  "code": "CACHE_ERROR",
  "message": "Cache error during write: Permission denied",
  "details": {
    "operation": "write",
    "reason": "Permission denied"
  },
  "retryable": true
}
```

#### `PROVIDER_ERROR`
**Meaning:** Provider-specific error occurred.

**Common Causes:**
- Local provider: File system issues
- Online provider: HTTP errors
- Hybrid provider: Both local and online failed

**Resolution:**
- Check provider source in error details
- For local provider: Verify `SYNERGYDE_LOCAL_DOC_PATH` is correct and readable
- For online provider: Check network connectivity
- Review server logs for specific error messages

**Example:**
```json
{
  "code": "PROVIDER_ERROR",
  "message": "Provider error (local): File not found",
  "details": {
    "provider": "local",
    "reason": "File not found",
    "section": "Language",
    "version": "latest"
  },
  "retryable": false
}
```

#### `INTERNAL_ERROR`
**Meaning:** Unexpected internal error occurred.

**Common Causes:**
- Bug in the server code
- Unexpected data format
- Memory issues

**Resolution:**
- Check server logs for stack traces
- Report the issue with error details
- Try restarting the server
- Verify all dependencies are up to date

**Example:**
```json
{
  "code": "INTERNAL_ERROR",
  "message": "Internal error: Unexpected state",
  "details": {
    "component": "parser",
    "error": "Cannot read property 'text' of undefined"
  },
  "retryable": false
}
```

## Common Issues

### Server Won't Start

**Symptoms:**
- Server exits immediately
- Error messages in console
- "Configuration not loaded" errors

**Solutions:**
1. **Check Node.js version:**
   ```bash
   node --version  # Must be 18.0.0 or higher
   ```

2. **Verify dependencies:**
   ```bash
   npm install
   ```

3. **Check TypeScript compilation:**
   ```bash
   npm run build
   ```

4. **Verify environment variables:**
   - Check `.env` file syntax
   - Ensure all paths are absolute or relative to project root
   - Verify `SYNERGYDE_LOCAL_DOC_PATH` exists if set

5. **Check logs:**
   - Look for specific error messages
   - Verify file permissions
   - Check disk space

### Tools Return Errors

**Symptoms:**
- All tool calls return error payloads
- "TOPIC_NOT_FOUND" for valid topics
- Network errors

**Solutions:**
1. **Verify network connectivity:**
   ```bash
   curl https://www.synergex.com/docs/
   ```

2. **Check topic IDs:**
   - Use `describe_docs` to see available sections
   - Verify topic ID format matches expected pattern
   - Check if topic exists in specified version

3. **Review server logs:**
   - Enable debug logging: `LOG_LEVEL=debug`
   - Look for HTTP errors
   - Check for rate limiting messages

4. **Test with known topics:**
   - Try topics from `list_section_topics`
   - Use topics returned by `search_docs`

### Cache Not Working

**Symptoms:**
- Cache directory not created
- Topics always fetched from provider
- Cache errors in logs

**Solutions:**
1. **Check cache directory:**
   ```bash
   ls -la cache/  # Should exist and be writable
   ```

2. **Verify permissions:**
   ```bash
   chmod 755 cache/
   ```

3. **Check disk space:**
   ```bash
   df -h .
   ```

4. **Clear and rebuild cache:**
   ```bash
   rm -rf cache/
   # Server will recreate on next run
   ```

5. **Check logs:**
   - Look for "Cache write error" messages
   - Verify cache operations are logged

### Cursor Integration Issues

**Symptoms:**
- Server not appearing in Cursor
- "Connection failed" errors
- Tools not available

**Solutions:**
1. **Verify MCP configuration:**
   - Check JSON syntax is valid
   - Use absolute paths for server executable
   - Verify environment variables are set

2. **Check Cursor logs:**
   - Look in Cursor's MCP server logs
   - Check for connection errors
   - Verify server is starting

3. **Test server manually:**
   ```bash
   node dist/server.js
   # Should start and wait for input
   ```

4. **Restart Cursor:**
   - Close and reopen Cursor
   - Configuration changes require restart

5. **Verify Node.js path:**
   - Cursor needs to find `node` executable
   - May need full path: `/usr/local/bin/node` or similar

### Search Returns No Results

**Symptoms:**
- Search queries return empty arrays
- Valid terms don't match

**Solutions:**
1. **Check search index:**
   - Search index is populated lazily
   - Topics must be fetched first to be indexed
   - Use `get_topic` to populate index

2. **Try different queries:**
   - Use simpler terms
   - Check spelling
   - Try programming language names (e.g., "c-plus-plus" for "C++")

3. **Verify version filter:**
   - Check if topics exist in specified version
   - Try without version filter

4. **Check tokenization:**
   - Special characters are normalized
   - "C++" becomes "c-plus-plus"
   - ".NET" becomes "dot-net"

### Resources Return Empty Content

**Symptoms:**
- Resource URIs return empty text
- Truncation notices appear

**Solutions:**
1. **Check token budget:**
   - Resources are limited to ~8k tokens
   - Large topics may be truncated
   - This is expected behavior

2. **Verify topic exists:**
   - Use `get_topic` tool first
   - Check if topic has content

3. **Check URI format:**
   - Verify URI syntax is correct
   - Use proper encoding for special characters
   - Check version is correct

## Getting Help

If you encounter issues not covered here:

1. **Check server logs** with `LOG_LEVEL=debug`
2. **Review error payloads** for specific error codes and details
3. **Test with minimal configuration** (defaults only)
4. **Verify all prerequisites** (Node.js version, dependencies)
5. **Check GitHub issues** for known problems
6. **Create a new issue** with:
   - Error messages
   - Configuration (sanitized)
   - Steps to reproduce
   - Server logs

## Debug Mode

Enable debug logging for detailed information:

```bash
LOG_LEVEL=debug node dist/server.js
```

This will show:
- All tool invocations
- HTTP requests and responses
- Cache operations
- Search index operations
- Detailed error information

