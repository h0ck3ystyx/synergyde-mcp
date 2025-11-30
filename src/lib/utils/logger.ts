/**
 * Logging utilities with structured output and log levels
 */

import { getConfig } from "../../config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private level: LogLevel | null = null;

  /**
   * Get the current log level, reading from config if not yet set
   */
  private getLevel(): LogLevel {
    if (this.level === null) {
      try {
        this.level = getConfig().logLevel;
      } catch {
        // Config not loaded yet, use default
        this.level = "info";
      }
    }
    return this.level;
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    const currentIndex = levels.indexOf(this.getLevel());
    const messageIndex = levels.indexOf(level);
    return messageIndex >= currentIndex;
  }

  /**
   * Format log message with context
   */
  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: LogContext): void {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage("debug", message, context));
    }
  }

  /**
   * Log an info message
   */
  info(message: string, context?: LogContext): void {
    if (this.shouldLog("info")) {
      console.info(this.formatMessage("info", message, context));
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: LogContext): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message, context));
    }
  }

  /**
   * Log an error message
   */
  error(message: string, context?: LogContext): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", message, context));
    }
  }

  /**
   * Log tool invocation
   */
  logToolInvocation(toolName: string, args: unknown, context?: LogContext): void {
    this.debug(`Tool invoked: ${toolName}`, {
      tool: toolName,
      args,
      ...context,
    });
  }

  /**
   * Log HTTP fetch operation
   */
  logHttpFetch(url: string, method: string = "GET", context?: LogContext): void {
    this.debug(`HTTP ${method} ${url}`, {
      url,
      method,
      ...context,
    });
  }

  /**
   * Log cache operation
   */
  logCacheOperation(operation: "hit" | "miss" | "set", key: string, context?: LogContext): void {
    this.debug(`Cache ${operation}: ${key}`, {
      operation,
      key,
      ...context,
    });
  }

  /**
   * Log parsing operation
   */
  logParsing(operation: string, context?: LogContext): void {
    this.debug(`Parsing: ${operation}`, {
      operation,
      ...context,
    });
  }

  /**
   * Update log level (useful for testing or runtime changes)
   * This overrides the config-based level until resetLevel() is called
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Reset log level to read from config again
   */
  resetLevel(): void {
    this.level = null;
  }

  /**
   * Get current log level (for inspection)
   */
  getCurrentLevel(): LogLevel {
    return this.getLevel();
  }
}

/**
 * Singleton logger instance
 */
export const logger = new Logger();

