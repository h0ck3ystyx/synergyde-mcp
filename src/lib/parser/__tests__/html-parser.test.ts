/**
 * Unit tests for HTML parser module
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseHtml, extractBodyText } from "../html-parser.js";
import * as cheerio from "cheerio";

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    logParsing: vi.fn(),
  },
}));

describe("parseHtml", () => {
  describe("title extraction", () => {
    it("should extract title from title tag", () => {
      const html = "<html><head><title>Test Title</title></head><body>Content</body></html>";
      const topic = parseHtml(html, {
        url: "http://example.com/topic",
        source: "online",
      });

      expect(topic.title).toBe("Test Title");
    });

    it("should extract title from h1 if no title tag", () => {
      const html = "<html><body><h1>Main Heading</h1><p>Content</p></body></html>";
      const topic = parseHtml(html, {
        url: "http://example.com/topic",
        source: "online",
      });

      expect(topic.title).toBe("Main Heading");
    });

    it("should fallback to 'Untitled' if no title found", () => {
      const html = "<html><body><p>Content</p></body></html>";
      const topic = parseHtml(html, {
        url: "http://example.com/topic",
        source: "online",
      });

      expect(topic.title).toBe("Untitled");
    });
  });

  describe("breadcrumb extraction", () => {
    it("should extract breadcrumbs from .breadcrumb", () => {
      const html = `
        <html>
          <body>
            <nav class="breadcrumb">
              <a href="/">Home</a>
              <span>Section</span>
              <span>Topic</span>
            </nav>
            <main>Content</main>
          </body>
        </html>
      `;
      const topic = parseHtml(html, {
        url: "http://example.com/topic",
        source: "online",
      });

      expect(topic.path.length).toBeGreaterThan(0);
      expect(topic.path).toContain("Section");
    });

    it("should return empty array if no breadcrumbs", () => {
      const html = "<html><body><main>Content</main></body></html>";
      const topic = parseHtml(html, {
        url: "http://example.com/topic",
        source: "online",
      });

      expect(topic.path).toEqual([]);
    });
  });

  describe("navigation links", () => {
    it("should extract previous link", () => {
      const html = `
        <html>
          <body>
            <main>Content</main>
            <a rel="prev" href="/prev-topic">Previous</a>
          </body>
        </html>
      `;
      const topic = parseHtml(html, {
        url: "http://example.com/topic",
        source: "online",
      });

      const prevLink = topic.links.find((l) => l.type === "prev");
      expect(prevLink).toBeDefined();
      expect(prevLink?.target_topic_id).toBeDefined();
    });

    it("should extract next link", () => {
      const html = `
        <html>
          <body>
            <main>Content</main>
            <a rel="next" href="/next-topic">Next</a>
          </body>
        </html>
      `;
      const topic = parseHtml(html, {
        url: "http://example.com/topic",
        source: "online",
      });

      const nextLink = topic.links.find((l) => l.type === "next");
      expect(nextLink).toBeDefined();
    });

    it("should extract parent link", () => {
      const html = `
        <html>
          <body>
            <main>Content</main>
            <a rel="up" href="/parent-topic">Parent</a>
          </body>
        </html>
      `;
      const topic = parseHtml(html, {
        url: "http://example.com/topic",
        source: "online",
      });

      const parentLink = topic.links.find((l) => l.type === "parent");
      expect(parentLink).toBeDefined();
    });

    it("should extract related links", () => {
      const html = `
        <html>
          <body>
            <main>Content</main>
            <div class="related">
              <a href="/related1">Related 1</a>
              <a href="/related2">Related 2</a>
            </div>
          </body>
        </html>
      `;
      const topic = parseHtml(html, {
        url: "http://example.com/topic",
        source: "online",
      });

      const relatedLinks = topic.links.filter((l) => l.type === "related");
      expect(relatedLinks.length).toBeGreaterThan(0);
    });
  });

  describe("main content extraction", () => {
    it("should extract content from main tag", () => {
      const html = `
        <html>
          <body>
            <header>Header</header>
            <main>Main content here</main>
            <footer>Footer</footer>
          </body>
        </html>
      `;
      const topic = parseHtml(html, {
        url: "http://example.com/topic",
        source: "online",
      });

      expect(topic.summary).toContain("Main content");
    });

    it("should strip header and footer", () => {
      const html = `
        <html>
          <body>
            <header>Header content</header>
            <main>Main content</main>
            <footer>Footer content</footer>
          </body>
        </html>
      `;
      const topic = parseHtml(html, {
        url: "http://example.com/topic",
        source: "online",
      });

      expect(topic.summary).not.toContain("Header content");
      expect(topic.summary).not.toContain("Footer content");
    });
  });

  describe("topic structure", () => {
    it("should set correct topic ID", () => {
      const html = "<html><body><main>Content</main></body></html>";
      const topic = parseHtml(html, {
        url: "http://example.com/topic-id",
        source: "online",
      });

      expect(topic.id).toBeDefined();
    });

    it("should set version", () => {
      const html = "<html><body><main>Content</main></body></html>";
      const topic = parseHtml(html, {
        url: "http://example.com/topic",
        version: "12.3",
        source: "online",
      });

      expect(topic.version).toBe("12.3");
    });

    it("should set source", () => {
      const html = "<html><body><main>Content</main></body></html>";
      const topic = parseHtml(html, {
        url: "http://example.com/topic",
        source: "local",
      });

      expect(topic.source).toBe("local");
    });
  });
});

describe("extractBodyText", () => {
  it("should extract text from main content", () => {
    const html = `
      <html>
        <body>
          <main>
            <h1>Heading</h1>
            <p>Paragraph text.</p>
          </main>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const bodyText = extractBodyText($);

    expect(bodyText).toContain("Heading");
    expect(bodyText).toContain("Paragraph text");
  });

  it("should convert headings to markdown", () => {
    const html = `
      <html>
        <body>
          <main>
            <h1>Level 1</h1>
            <h2>Level 2</h2>
          </main>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const bodyText = extractBodyText($);

    expect(bodyText).toMatch(/^# Level 1/);
    expect(bodyText).toMatch(/## Level 2/);
  });

  it("should convert lists to markdown", () => {
    const html = `
      <html>
        <body>
          <main>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
          </main>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const bodyText = extractBodyText($);

    expect(bodyText).toContain("- Item 1");
    expect(bodyText).toContain("- Item 2");
  });

  it("should preserve code blocks", () => {
    const html = `
      <html>
        <body>
          <main>
            <pre><code>code content</code></pre>
          </main>
        </body>
      </html>
    `;
    const $ = cheerio.load(html);
    const bodyText = extractBodyText($);

    expect(bodyText).toContain("```");
    expect(bodyText).toContain("code content");
  });
});

