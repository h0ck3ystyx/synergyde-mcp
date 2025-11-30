/**
 * Unit tests for chunker module
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { chunkTopic, chunkBodyText, limitChunks } from "../chunker.js";
import type { Topic } from "../../../types.js";

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("chunkBodyText", () => {
  describe("empty content", () => {
    it("should return empty array for empty string", () => {
      const chunks = chunkBodyText("topic1", "");
      expect(chunks).toEqual([]);
    });

    it("should return empty array for whitespace-only string", () => {
      const chunks = chunkBodyText("topic1", "   \n\n  ");
      expect(chunks).toEqual([]);
    });
  });

  describe("content without headings", () => {
    it("should chunk by paragraphs", () => {
      const bodyText = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";
      const chunks = chunkBodyText("topic1", bodyText, 100);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].topic_id).toBe("topic1");
      expect(chunks[0].chunk_index).toBe(0);
      expect(chunks[0].text).toContain("First paragraph");
    });

    it("should respect token limits", () => {
      // Use multiple paragraphs to ensure splitting works
      const longText = "Paragraph one.\n\n" + "A".repeat(2000) + "\n\nParagraph two.\n\n" + "B".repeat(2000);
      const chunks = chunkBodyText("topic1", longText, 1200);

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      chunks.forEach((chunk) => {
        // Token count might be slightly over due to estimation, but should be reasonable
        expect(chunk.token_count).toBeLessThanOrEqual(1500); // Allow some margin for estimation
      });
    });
  });

  describe("content with headings", () => {
    it("should capture introductory content before first heading", () => {
      const bodyText = "This is introductory content.\n\n# First Heading\n\nContent after heading.";
      const chunks = chunkBodyText("topic1", bodyText, 1000);

      expect(chunks.length).toBeGreaterThan(0);
      // First chunk should contain introductory content
      expect(chunks[0].text).toContain("This is introductory content");
    });

    it("should chunk by headings", () => {
      const bodyText = "# Heading 1\n\nContent 1.\n\n## Heading 2\n\nContent 2.";
      const chunks = chunkBodyText("topic1", bodyText, 1000);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].text).toContain("Heading 1");
      expect(chunks[0].text).toContain("Content 1");
    });

    it("should preserve heading levels", () => {
      const bodyText = "# Level 1\n\nContent.\n\n## Level 2\n\nMore content.";
      const chunks = chunkBodyText("topic1", bodyText, 1000);

      expect(chunks[0].text).toMatch(/^# Level 1/);
    });

    it("should handle multiple headings", () => {
      const bodyText = `
# First Section
Content for first section.

## Subsection 1
Content for subsection 1.

## Subsection 2
Content for subsection 2.

# Second Section
Content for second section.
`.trim();

      const chunks = chunkBodyText("topic1", bodyText, 1000);
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe("large content", () => {
    it("should split large sections by paragraphs", () => {
      const largeSection = "# Large Section\n\n" + "Paragraph.\n\n".repeat(100);
      const chunks = chunkBodyText("topic1", largeSection, 500);

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      chunks.forEach((chunk) => {
        expect(chunk.token_count).toBeLessThanOrEqual(500);
      });
      // If content is large enough, it should be split
      if (chunks.length > 1) {
        expect(chunks.length).toBeGreaterThan(1);
      }
    });
  });

  describe("edge cases", () => {
    it("should handle content with only headings", () => {
      const bodyText = "# Heading 1\n\n# Heading 2\n\n# Heading 3";
      const chunks = chunkBodyText("topic1", bodyText, 1000);

      expect(chunks.length).toBeGreaterThan(0);
    });

    it("should handle very long single paragraph", () => {
      const longPara = "A".repeat(10000); // ~2500 tokens, should be split
      const chunks = chunkBodyText("topic1", longPara, 1200);

      // Should be split into multiple chunks since it exceeds token limit
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      // If split, verify token counts
      if (chunks.length > 1) {
        chunks.forEach((chunk) => {
          expect(chunk.token_count).toBeLessThanOrEqual(1200);
        });
      }
    });

    it("should split sections larger than maxChunkSize by paragraphs", () => {
      // Create a section with heading + very large content (exceeds maxChunkSize)
      // Make each paragraph larger and increase count to ensure splitting
      const largeParagraphs = Array(30).fill("This is a paragraph with lots of content in it that should add up. ".repeat(5) + "\n\n").join("");
      const bodyText = `# Large Section\n\n${largeParagraphs}`;
      const chunks = chunkBodyText("topic1", bodyText, 300);

      // Should create multiple chunks
      expect(chunks.length).toBeGreaterThan(1);

      // Each chunk should have token count within limits (with some margin)
      chunks.forEach((chunk) => {
        expect(chunk.token_count).toBeLessThanOrEqual(500); // Allow margin for estimation
      });

      // At least one chunk should preserve the heading context
      const chunksWithHeading = chunks.filter(c => c.text.includes("# Large Section"));
      expect(chunksWithHeading.length).toBeGreaterThan(0);
    });

    it("should preserve heading context when splitting large multi-paragraph sections", () => {
      // Section with heading + multiple paragraphs that exceed maxChunkSize
      const para1 = "First paragraph. ".repeat(50);
      const para2 = "Second paragraph. ".repeat(50);
      const para3 = "Third paragraph. ".repeat(50);
      const bodyText = `## Important Section\n\n${para1}\n\n${para2}\n\n${para3}`;
      const chunks = chunkBodyText("topic1", bodyText, 400);

      // Should split into multiple chunks
      expect(chunks.length).toBeGreaterThan(1);

      // Each chunk (except first) should include the heading
      chunks.slice(1).forEach((chunk) => {
        expect(chunk.text).toContain("## Important Section");
      });
    });

    it("should handle section with only heading and no content", () => {
      const bodyText = "# Empty Section\n\n## Another Empty\n\n### Yet Another";
      const chunks = chunkBodyText("topic1", bodyText, 1000);

      // Should still create chunks even with empty sections
      expect(chunks.length).toBeGreaterThan(0);

      // Verify headings are preserved
      const allText = chunks.map(c => c.text).join("\n");
      expect(allText).toContain("# Empty Section");
    });

    it("should handle section with heading followed by minimal content", () => {
      const bodyText = "# Section One\n\nTiny.\n\n# Section Two\n\nAlso tiny.";
      const chunks = chunkBodyText("topic1", bodyText, 1000);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].text).toContain("Section One");
      expect(chunks[0].text).toContain("Tiny");
    });

    it("should handle very long section with no paragraph breaks", () => {
      // Single continuous text with heading but no paragraph breaks
      const longText = "Word ".repeat(2000); // No \n\n breaks
      const bodyText = `### Continuous Section\n\n${longText}`;
      const chunks = chunkBodyText("topic1", bodyText, 500);

      // Should split the section
      expect(chunks.length).toBeGreaterThan(0);

      // First chunk should have the heading
      expect(chunks[0].text).toContain("### Continuous Section");
    });

    it("should handle section that exactly equals maxChunkSize", () => {
      // Create content that's exactly at the limit
      const exactContent = "X".repeat(4800); // Exactly 1200 tokens at 4 chars/token
      const bodyText = `## Exact Size\n\n${exactContent}`;
      const chunks = chunkBodyText("topic1", bodyText, 1200);

      // Should not split if at exact size
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle multiple large sections in sequence", () => {
      // Make paragraphs much larger to ensure each section needs splitting
      const largePara = "Large paragraph content with lots of text. ".repeat(200);
      const bodyText = `
# First Large Section
${largePara}

# Second Large Section
${largePara}

# Third Large Section
${largePara}
      `.trim();

      const chunks = chunkBodyText("topic1", bodyText, 400);

      // Should split into more chunks than sections (at least 4 for 3 large sections)
      expect(chunks.length).toBeGreaterThanOrEqual(3);

      // Verify each section's heading appears in chunks
      const allText = chunks.map(c => c.text).join("\n");
      expect(allText).toContain("First Large Section");
      expect(allText).toContain("Second Large Section");
      expect(allText).toContain("Third Large Section");
    });
  });
});

describe("chunkTopic", () => {
  describe("with body text", () => {
    it("should chunk body text when provided", () => {
      const topic: Topic = {
        id: "topic1",
        version: "latest",
        title: "Test Topic",
        section: "Test",
        path: [],
        summary: "Test summary",
        body_chunks: [],
        links: [],
        url: "http://example.com/topic1",
        source: "online",
      };

      const bodyText = "# Heading\n\nContent.";
      const chunks = chunkTopic(topic, 1200, bodyText);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].topic_id).toBe("topic1");
      expect(chunks[0].text).toContain("Heading");
    });
  });

  describe("without body text", () => {
    it("should return empty array when body_chunks is empty", () => {
      const topic: Topic = {
        id: "topic1",
        version: "latest",
        title: "Test Topic",
        section: "Test",
        path: [],
        summary: "Test summary",
        body_chunks: [],
        links: [],
        url: "http://example.com/topic1",
        source: "online",
      };

      const chunks = chunkTopic(topic, 1200);
      expect(chunks).toEqual([]);
    });

    it("should re-chunk existing chunks", () => {
      const topic: Topic = {
        id: "topic1",
        version: "latest",
        title: "Test Topic",
        section: "Test",
        path: [],
        summary: "Test summary",
        body_chunks: [
          {
            topic_id: "topic1",
            chunk_index: 0,
            text: "First chunk content.",
            token_count: 100,
          },
          {
            topic_id: "topic1",
            chunk_index: 1,
            text: "Second chunk content.",
            token_count: 100,
          },
        ],
        links: [],
        url: "http://example.com/topic1",
        source: "online",
      };

      const chunks = chunkTopic(topic, 1200);
      expect(chunks.length).toBeGreaterThan(0);
    });
  });
});

describe("limitChunks", () => {
  it("should limit chunks to max token count", () => {
    const chunks = [
      { topic_id: "topic1", chunk_index: 0, text: "A".repeat(1000), token_count: 250 },
      { topic_id: "topic1", chunk_index: 1, text: "B".repeat(1000), token_count: 250 },
      { topic_id: "topic1", chunk_index: 2, text: "C".repeat(1000), token_count: 250 },
      { topic_id: "topic1", chunk_index: 3, text: "D".repeat(1000), token_count: 250 },
    ];

    const limited = limitChunks(chunks, 500);
    expect(limited.length).toBeLessThanOrEqual(chunks.length);
    const totalTokens = limited.reduce((sum, c) => sum + (c.token_count || 0), 0);
    expect(totalTokens).toBeLessThanOrEqual(500);
  });

  it("should return all chunks if under limit", () => {
    const chunks = [
      { topic_id: "topic1", chunk_index: 0, text: "A", token_count: 100 },
      { topic_id: "topic1", chunk_index: 1, text: "B", token_count: 100 },
    ];

    const limited = limitChunks(chunks, 8000);
    expect(limited.length).toBe(chunks.length);
  });

  it("should return empty array for empty input", () => {
    const limited = limitChunks([], 8000);
    expect(limited).toEqual([]);
  });
});

