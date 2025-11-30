/**
 * Rate limiter utility for HTTP requests
 */

interface RateLimitState {
  requests: number[];
  windowStart: number;
}

/**
 * Simple rate limiter using a sliding window
 */
export class RateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private state: RateLimitState;

  /**
   * Create a rate limiter
   * 
   * @param maxRequests - Maximum number of requests allowed
   * @param windowMs - Time window in milliseconds
   */
  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.state = {
      requests: [],
      windowStart: Date.now(),
    };
  }

  /**
   * Check if a request is allowed and record it if so
   * 
   * @returns true if request is allowed, false otherwise
   */
  async check(): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Remove requests outside the current window
    this.state.requests = this.state.requests.filter(
      (timestamp) => timestamp > windowStart
    );

    // Check if we're at the limit
    if (this.state.requests.length >= this.maxRequests) {
      return false;
    }

    // Record this request
    this.state.requests.push(now);
    return true;
  }

  /**
   * Wait until a request is allowed, then record it
   * 
   * @returns Promise that resolves when request is allowed
   */
  async waitForSlot(): Promise<void> {
    while (!(await this.check())) {
      // Calculate how long to wait
      const oldestRequest = this.state.requests[0];
      const waitTime = oldestRequest + this.windowMs - Date.now() + 100; // +100ms buffer
      
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * Get current request count in the window
   */
  getCurrentCount(): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    this.state.requests = this.state.requests.filter(
      (timestamp) => timestamp > windowStart
    );
    return this.state.requests.length;
  }
}

