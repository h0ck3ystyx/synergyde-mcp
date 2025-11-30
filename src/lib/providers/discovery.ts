/**
 * Documentation discovery utility
 * 
 * Helps understand the structure of the Synergy/DE documentation site
 * by crawling sample topics and capturing DOM structure information.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as cheerio from "cheerio";

import { getConfig } from "../../config.js";
import { OnlineProvider } from "./online-provider.js";
import { logger } from "../utils/logger.js";

// Type for cheerio Element
type CheerioElement = cheerio.Element;

interface DiscoveryResult {
  url: string;
  version?: string;
  title?: string;
  titleSelector?: string;
  breadcrumbs?: string[];
  breadcrumbSelector?: string;
  hasNavigation?: boolean;
  navigationSelectors?: {
    prev?: string;
    next?: string;
    parent?: string;
    related?: string[];
  };
  mainContentSelector?: string;
  structure: {
    hasHeader: boolean;
    headerSelector?: string;
    hasFooter: boolean;
    footerSelector?: string;
    hasSidebar: boolean;
    sidebarSelector?: string;
    hasBreadcrumbs: boolean;
  };
  selectors: {
    [key: string]: string;
  };
}

interface DiscoveryFindings {
  timestamp: string;
  baseUrl: string;
  topics: DiscoveryResult[];
  robotsTxt?: {
    allowed: boolean;
    disallowedPaths: string[];
    crawlDelay?: number;
  };
}

/**
 * Discover structure of a documentation topic by analyzing HTML
 */
export async function discoverTopic(
  provider: OnlineProvider,
  urlOrId: string,
  version?: string
): Promise<DiscoveryResult> {
  try {
    // Build URL - use getConfig for baseUrl and defaultVersion
    const config = getConfig();
    const baseUrl = config.docBaseUrl;
    let url: string;
    
    if (urlOrId.startsWith("http://") || urlOrId.startsWith("https://")) {
      url = urlOrId;
    } else if (urlOrId.startsWith("/")) {
      url = `${baseUrl.replace(/\/$/, "")}${urlOrId}`;
    } else {
      const resolvedVersion = version || config.defaultVersion;
      if (resolvedVersion === "latest") {
        url = `${baseUrl}${urlOrId}`;
      } else {
        url = `${baseUrl}versions/${resolvedVersion}/${urlOrId}`;
      }
    }

    // Fetch raw HTML
    const html = await provider.fetchHtml(url);
    const $ = cheerio.load(html);

    // Extract title
    const title = $("title").text().trim() || undefined;
    const titleSelector = $("title").length > 0 ? "title" : undefined;

    // Find breadcrumbs
    const breadcrumbSelectors = [
      ".breadcrumb",
      ".breadcrumbs",
      "[class*='breadcrumb']",
      "nav[aria-label='breadcrumb']",
      "ol.breadcrumb",
    ];
    
    let breadcrumbSelector: string | undefined;
    let breadcrumbs: string[] | undefined;
    
    for (const selector of breadcrumbSelectors) {
      const $breadcrumb = $(selector);
      if ($breadcrumb.length > 0) {
        breadcrumbSelector = selector;
        breadcrumbs = $breadcrumb
          .find("a, span, li")
          .map((_i: number, el: CheerioElement) => $(el).text().trim())
          .get()
          .filter((text: string) => text.length > 0);
        break;
      }
    }

    // Detect structure elements
    const hasHeader = $("header").length > 0 || $("[class*='header']").length > 0;
    const headerSelector = hasHeader
      ? ($("header").length > 0 ? "header" : "[class*='header']")
      : undefined;

    const hasFooter = $("footer").length > 0 || $("[class*='footer']").length > 0;
    const footerSelector = hasFooter
      ? ($("footer").length > 0 ? "footer" : "[class*='footer']")
      : undefined;

    const hasSidebar = $("aside").length > 0 || $("[class*='sidebar']").length > 0;
    const sidebarSelector = hasSidebar
      ? ($("aside").length > 0 ? "aside" : "[class*='sidebar']")
      : undefined;

    // Find main content area (common patterns)
    const mainContentSelectors = [
      "main",
      ".main-content",
      ".content",
      "#content",
      "[role='main']",
      ".article",
      "article",
    ];

    let mainContentSelector: string | undefined;
    for (const selector of mainContentSelectors) {
      if ($(selector).length > 0) {
        mainContentSelector = selector;
        break;
      }
    }

    // Find navigation links
    const navigationSelectors: DiscoveryResult["navigationSelectors"] = {};
    
    // Previous link
    const prevSelectors = ["a[rel='prev']", ".prev", ".previous", "[class*='prev']"];
    for (const selector of prevSelectors) {
      if ($(selector).length > 0) {
        navigationSelectors.prev = selector;
        break;
      }
    }

    // Next link
    const nextSelectors = ["a[rel='next']", ".next", "[class*='next']"];
    for (const selector of nextSelectors) {
      if ($(selector).length > 0) {
        navigationSelectors.next = selector;
        break;
      }
    }

    // Parent link
    const parentSelectors = ["a[rel='up']", ".parent", "[class*='parent']"];
    for (const selector of parentSelectors) {
      if ($(selector).length > 0) {
        navigationSelectors.parent = selector;
        break;
      }
    }

    // Related links
    const relatedLinks = $("a[rel='related'], .related a, [class*='related'] a");
    if (relatedLinks.length > 0) {
      navigationSelectors.related = [];
      relatedLinks.each((_i: number, el: CheerioElement) => {
        const href = $(el).attr("href");
        if (href) {
          navigationSelectors.related!.push(href);
        }
      });
    }

    // Collect all discovered selectors
    const selectors: Record<string, string> = {};
    if (titleSelector) selectors.title = titleSelector;
    if (breadcrumbSelector) selectors.breadcrumb = breadcrumbSelector;
    if (mainContentSelector) selectors.mainContent = mainContentSelector;
    if (headerSelector) selectors.header = headerSelector;
    if (footerSelector) selectors.footer = footerSelector;
    if (sidebarSelector) selectors.sidebar = sidebarSelector;
    if (navigationSelectors.prev) selectors.navPrev = navigationSelectors.prev;
    if (navigationSelectors.next) selectors.navNext = navigationSelectors.next;
    if (navigationSelectors.parent) selectors.navParent = navigationSelectors.parent;

    const result: DiscoveryResult = {
      url,
      version,
      title,
      titleSelector,
      breadcrumbs,
      breadcrumbSelector,
      hasNavigation: Object.keys(navigationSelectors).length > 0,
      navigationSelectors: Object.keys(navigationSelectors).length > 0 ? navigationSelectors : undefined,
      mainContentSelector,
      structure: {
        hasHeader,
        headerSelector,
        hasFooter,
        footerSelector,
        hasSidebar,
        sidebarSelector,
        hasBreadcrumbs: breadcrumbs !== undefined && breadcrumbs.length > 0,
      },
      selectors,
    };

    logger.debug("Discovered topic structure", {
      url,
      title,
      hasBreadcrumbs: result.structure.hasBreadcrumbs,
      mainContentSelector,
    });

    return result;
  } catch (error) {
    logger.error("Failed to discover topic", {
      url: urlOrId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Check robots.txt to see what paths are allowed
 */
export async function checkRobotsTxt(baseUrl: string): Promise<{
  allowed: boolean;
  disallowedPaths: string[];
  crawlDelay?: number;
}> {
  try {
    const robotsUrl = `${baseUrl.replace(/\/$/, "")}/robots.txt`;
    logger.debug("Checking robots.txt", { url: robotsUrl });

    const response = await fetch(robotsUrl);
    if (!response.ok) {
      return { allowed: true, disallowedPaths: [] };
    }

    const text = await response.text();
    const lines = text.split("\n").map((line) => line.trim());

    const disallowedPaths: string[] = [];
    let crawlDelay: number | undefined;

    for (const line of lines) {
      if (line.startsWith("Disallow:")) {
        const path = line.substring(9).trim();
        if (path) {
          disallowedPaths.push(path);
        }
      } else if (line.startsWith("Crawl-delay:")) {
        crawlDelay = parseInt(line.substring(12).trim(), 10);
      }
    }

    return {
      allowed: disallowedPaths.length === 0,
      disallowedPaths,
      crawlDelay,
    };
  } catch (error) {
    logger.warn("Failed to fetch robots.txt", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { allowed: true, disallowedPaths: [] };
  }
}

/**
 * Discover structure across multiple topics
 */
export async function discoverMultipleTopics(
  provider: OnlineProvider,
  urls: string[],
  version?: string
): Promise<DiscoveryResult[]> {
  const results: DiscoveryResult[] = [];

  for (const url of urls) {
    try {
      const result = await discoverTopic(provider, url, version);
      results.push(result);
      logger.debug("Discovered topic structure", {
        url,
        title: result.title,
        structure: result.structure,
      });
    } catch (error) {
      logger.warn("Failed to discover topic", {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

/**
 * Save discovery findings to a JSON file
 */
export async function saveDiscoveryFindings(
  findings: DiscoveryFindings,
  outputPath: string = "./discovery-findings.json"
): Promise<void> {
  try {
    const json = JSON.stringify(findings, null, 2);
    await writeFile(resolve(outputPath), json, "utf-8");
    logger.info("Saved discovery findings", { outputPath, topicCount: findings.topics.length });
  } catch (error) {
    logger.error("Failed to save discovery findings", {
      outputPath,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Load discovery findings from a JSON file
 */
export async function loadDiscoveryFindings(
  inputPath: string = "./discovery-findings.json"
): Promise<DiscoveryFindings | null> {
  try {
    const json = await readFile(resolve(inputPath), "utf-8");
    const findings = JSON.parse(json) as DiscoveryFindings;
    logger.debug("Loaded discovery findings", { inputPath, topicCount: findings.topics.length });
    return findings;
  } catch (error) {
    logger.warn("Failed to load discovery findings", {
      inputPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Run full discovery: check robots.txt, discover topics, and save findings
 */
export async function runDiscovery(
  provider: OnlineProvider,
  baseUrl: string,
  sampleUrls: string[],
  version?: string,
  outputPath: string = "./discovery-findings.json"
): Promise<DiscoveryFindings> {
  logger.info("Starting documentation discovery", {
    baseUrl,
    sampleCount: sampleUrls.length,
    version,
  });

  // Check robots.txt
  const robotsTxt = await checkRobotsTxt(baseUrl);
  logger.info("Checked robots.txt", {
    allowed: robotsTxt.allowed,
    disallowedPaths: robotsTxt.disallowedPaths.length,
    crawlDelay: robotsTxt.crawlDelay,
  });

  // Discover topics
  const topics = await discoverMultipleTopics(provider, sampleUrls, version);

  const findings: DiscoveryFindings = {
    timestamp: new Date().toISOString(),
    baseUrl,
    topics,
    robotsTxt,
  };

  // Save findings
  await saveDiscoveryFindings(findings, outputPath);

  logger.info("Discovery complete", {
    topicsDiscovered: topics.length,
    outputPath,
  });

  return findings;
}

