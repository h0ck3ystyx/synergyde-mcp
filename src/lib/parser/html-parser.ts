/**
 * HTML parser for extracting structured content from documentation pages
 */

import * as cheerio from "cheerio";
import type { Topic, TopicLink } from "../../types.js";
import { parseError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

// Type for cheerio Element
type CheerioElement = cheerio.Element;

interface ParseOptions {
  url: string;
  version?: string;
  source: "online" | "local" | "hybrid";
}

/**
 * Extract title from HTML
 */
function extractTitle($: cheerio.CheerioAPI): string {
  // Try title tag first
  const titleTag = $("title").text().trim();
  if (titleTag) {
    return titleTag;
  }

  // Try main heading (h1)
  const h1 = $("h1").first().text().trim();
  if (h1) {
    return h1;
  }

  // Try page title in common locations
  const pageTitle = $(".page-title, .title, [class*='title']").first().text().trim();
  if (pageTitle) {
    return pageTitle;
  }

  return "Untitled";
}

/**
 * Extract breadcrumb navigation
 */
function extractBreadcrumbs($: cheerio.CheerioAPI): string[] {
  const breadcrumbSelectors = [
    ".breadcrumb",
    ".breadcrumbs",
    "[class*='breadcrumb']",
    "nav[aria-label='breadcrumb']",
    "ol.breadcrumb",
    "nav ol",
  ];

  for (const selector of breadcrumbSelectors) {
    const $breadcrumb = $(selector);
    if ($breadcrumb.length > 0) {
      const crumbs = $breadcrumb
        .find("a, span, li")
        .map((_i: number, el: CheerioElement) => $(el).text().trim())
        .get()
        .filter((text: string) => text.length > 0 && text !== "Home");
      
      if (crumbs.length > 0) {
        return crumbs;
      }
    }
  }

  return [];
}

/**
 * Find and extract main content area
 */
function extractMainContent($: cheerio.CheerioAPI): cheerio.Cheerio {
  // Try common main content selectors
  const mainContentSelectors = [
    "main",
    ".main-content",
    ".content",
    "#content",
    "[role='main']",
    ".article",
    "article",
    ".documentation-content",
    ".doc-content",
  ];

  for (const selector of mainContentSelectors) {
    const $content = $(selector);
    if ($content.length > 0) {
      return $content.first();
    }
  }

  // Fallback: try to find the largest content area
  // Remove common non-content elements first
  $("header, footer, nav, aside, .sidebar, .navigation, .menu").remove();
  
  // Return body if no main content found
  return $("body");
}

/**
 * Extract body text from HTML (exported for use in providers)
 */
export function extractBodyText($: cheerio.CheerioAPI | cheerio.Root): string {
  // cheerio.Root is compatible with CheerioAPI for our use case
  const $api = $ as cheerio.CheerioAPI;
  const $mainContent = extractMainContent($api);
  return htmlToText($api, $mainContent);
}

/**
 * Convert HTML element to plain text while preserving structure
 */
function htmlToText($: cheerio.CheerioAPI, $element: cheerio.Cheerio): string {
  // Clone to avoid modifying original
  const $clone = $element.clone();

  // Remove scripts, styles, and other non-content elements
  $clone.find("script, style, noscript, iframe, embed, object").remove();

  // Convert headings to markdown-style
  $clone.find("h1, h2, h3, h4, h5, h6").each((_i: number, el: CheerioElement) => {
    const $el = $(el);
    const tagName = $el.prop("tagName") || "";
    const level = parseInt(tagName.charAt(1), 10) || 1;
    const text = $el.text().trim();
    $el.replaceWith(`\n\n${"#".repeat(level)} ${text}\n\n`);
  });

  // Convert lists to markdown-style
  $clone.find("ul, ol").each((_i: number, el: CheerioElement) => {
    const $el = $(el);
    const isOrdered = $el.is("ol");
    const items = $el
      .find("> li")
      .map((_j: number, li: CheerioElement) => {
        const text = $(li).text().trim();
        return isOrdered ? `${_j + 1}. ${text}` : `- ${text}`;
      })
      .get()
      .join("\n");
    $el.replaceWith(`\n${items}\n`);
  });

  // Convert code blocks (preserve formatting)
  $clone.find("pre, code").each((_i: number, el: CheerioElement) => {
    const $el = $(el);
    const text = $el.text();
    const isBlock = $el.is("pre") || $el.parent().is("pre");
    if (isBlock) {
      $el.replaceWith(`\n\`\`\`\n${text}\n\`\`\`\n`);
    } else {
      $el.replaceWith(`\`${text}\``);
    }
  });

  // Convert links to markdown-style (text only for now)
  $clone.find("a").each((_i: number, el: CheerioElement) => {
    const text = $(el).text().trim();
    $(el).replaceWith(text);
  });

  // Convert paragraphs to have line breaks
  $clone.find("p, div").each((_i: number, el: CheerioElement) => {
    const text = $(el).text().trim();
    if (text) {
      $(el).replaceWith(`\n${text}\n`);
    } else {
      $(el).remove();
    }
  });

  // Get text and clean up
  let text = $clone.text();
  
  // Normalize whitespace
  text = text
    .replace(/\n{3,}/g, "\n\n") // Max 2 consecutive newlines
    .replace(/[ \t]+/g, " ") // Normalize spaces
    .trim();

  return text;
}

/**
 * Extract navigation links (prev, next, parent, related)
 */
function extractNavigationLinks(
  $: cheerio.CheerioAPI,
  baseUrl: string
): TopicLink[] {
  const links: TopicLink[] = [];

  // Previous link
  const prevSelectors = ["a[rel='prev']", ".prev", ".previous", "[class*='prev']"];
  for (const selector of prevSelectors) {
    const $link = $(selector).first();
    if ($link.length > 0) {
      const href = $link.attr("href");
      const title = $link.text().trim() || $link.attr("title") || undefined;
      if (href) {
        const topicId = normalizeUrlToTopicId(href, baseUrl);
        links.push({
          type: "prev",
          target_topic_id: topicId,
          title,
          url: href.startsWith("http") ? href : new URL(href, baseUrl).toString(),
        });
        break;
      }
    }
  }

  // Next link
  const nextSelectors = ["a[rel='next']", ".next", "[class*='next']"];
  for (const selector of nextSelectors) {
    const $link = $(selector).first();
    if ($link.length > 0) {
      const href = $link.attr("href");
      const title = $link.text().trim() || $link.attr("title") || undefined;
      if (href) {
        const topicId = normalizeUrlToTopicId(href, baseUrl);
        links.push({
          type: "next",
          target_topic_id: topicId,
          title,
          url: href.startsWith("http") ? href : new URL(href, baseUrl).toString(),
        });
        break;
      }
    }
  }

  // Parent link
  const parentSelectors = ["a[rel='up']", ".parent", "[class*='parent']"];
  for (const selector of parentSelectors) {
    const $link = $(selector).first();
    if ($link.length > 0) {
      const href = $link.attr("href");
      const title = $link.text().trim() || $link.attr("title") || undefined;
      if (href) {
        const topicId = normalizeUrlToTopicId(href, baseUrl);
        links.push({
          type: "parent",
          target_topic_id: topicId,
          title,
          url: href.startsWith("http") ? href : new URL(href, baseUrl).toString(),
        });
        break;
      }
    }
  }

  // Related links
  const relatedSelectors = [
    "a[rel='related']",
    ".related a",
    "[class*='related'] a",
    ".see-also a",
  ];
  for (const selector of relatedSelectors) {
    $(selector).each((_i, el) => {
      const href = $(el).attr("href");
      const title = $(el).text().trim() || $(el).attr("title") || undefined;
      if (href && !href.startsWith("#") && !href.startsWith("mailto:")) {
        const topicId = normalizeUrlToTopicId(href, baseUrl);
        links.push({
          type: "related",
          target_topic_id: topicId,
          title,
          url: href.startsWith("http") ? href : new URL(href, baseUrl).toString(),
        });
      }
    });
  }

  return links;
}

/**
 * Normalize URL to topic ID
 */
/**
 * Normalize a URL to a topic ID
 * @param href - The URL or href to normalize
 * @param baseUrl - The base URL for resolving relative URLs
 * @returns The normalized topic ID
 */
export function normalizeUrlToTopicId(href: string, baseUrl: string): string {
  try {
    const url = new URL(href, baseUrl);
    // Remove base URL to get relative path
    const base = new URL(baseUrl);
    if (url.origin === base.origin) {
      let pathname = url.pathname.replace(/^\//, "").replace(/\/$/, "");
      // Remove base path if present (e.g., "docs/" from "docs/topic1")
      const basePath = base.pathname.replace(/^\//, "").replace(/\/$/, "");
      if (basePath && pathname.startsWith(basePath + "/")) {
        pathname = pathname.substring(basePath.length + 1);
      }
      return pathname || url.pathname;
    }
    return url.toString();
  } catch {
    // If URL parsing fails, return the href as-is
    return href.replace(/^\//, "");
  }
}

/**
 * Extract section from breadcrumbs or URL
 */
function extractSection(breadcrumbs: string[], url: string): string {
  // Try to get section from breadcrumbs (usually first or second item)
  if (breadcrumbs.length > 0) {
    // Skip "Home" or "Documentation" if present
    const section = breadcrumbs.find(
      (crumb) => !["Home", "Documentation", "Docs"].includes(crumb)
    );
    if (section) {
      return section;
    }
  }

  // Try to extract from URL path
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/").filter((p) => p);
    // Common section names in path
    const commonSections = [
      "Language",
      "General Guides",
      "Data Access",
      "Development Tools",
      "Updating",
    ];
    for (const part of pathParts) {
      const normalized = part.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
      if (commonSections.some((s) => s.toLowerCase().includes(normalized.toLowerCase()))) {
        return normalized;
      }
    }
  } catch {
    // Ignore URL parsing errors
  }

  return "Unknown";
}

/**
 * Parse HTML and extract structured Topic information
 */
export function parseHtml(html: string, options: ParseOptions): Topic {
  try {
    logger.logParsing("Parsing HTML", { url: options.url });

    const $: cheerio.CheerioAPI = cheerio.load(html) as cheerio.CheerioAPI;

    // Extract title
    const title = extractTitle($);
    logger.debug("Extracted title", { title, url: options.url });

    // Extract breadcrumbs
    const breadcrumbs = extractBreadcrumbs($);
    logger.debug("Extracted breadcrumbs", { breadcrumbs, url: options.url });

    // Extract section
    const section = extractSection(breadcrumbs, options.url);

    // Extract main content
    const $mainContent = extractMainContent($);
    const bodyText = htmlToText($, $mainContent);

    // Generate summary (first 200 characters of body)
    let summary = bodyText.substring(0, 200).trim();
    if (bodyText.length > 200) {
      // Try to end at a sentence boundary
      const lastPeriod = summary.lastIndexOf(".");
      if (lastPeriod > 100) {
        summary = summary.substring(0, lastPeriod + 1);
      } else {
        // Fallback: just truncate and add ellipsis
        summary = summary + "...";
      }
    }

    // Extract navigation links
    const links = extractNavigationLinks($, options.url);
    logger.debug("Extracted navigation links", {
      count: links.length,
      types: links.map((l) => l.type),
      url: options.url,
    });

    // Normalize topic ID from URL
    const topicId = normalizeUrlToTopicId(options.url, options.url);

    // Create topic (chunking will be done separately)
    const topic: Topic = {
      id: topicId,
      version: options.version ?? "latest",
      title,
      section,
      path: breadcrumbs,
      summary,
      body_chunks: [], // Will be populated by chunker
      links,
      url: options.url,
      source: options.source,
    };

    logger.debug("Parsed HTML successfully", {
      topic_id: topicId,
      title,
      section,
      breadcrumb_count: breadcrumbs.length,
      link_count: links.length,
    });

    return topic;
  } catch (error) {
    const errorPayload = parseError(
      "HTML parsing",
      error instanceof Error ? error.message : String(error),
      {
        url: options.url,
        version: options.version,
      }
    );
    const err = new Error(errorPayload.message);
    (err as any).payload = errorPayload;
    throw err;
  }
}

