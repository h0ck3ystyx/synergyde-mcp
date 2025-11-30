/**
 * Topic chunker for splitting long documentation topics into LLM-friendly chunks
 */

import type { Topic, TopicChunk } from "../../types.js";
import { logger } from "../utils/logger.js";

/**
 * Estimate token count for text (rough approximation: ~4 characters per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into chunks based on headings and token limits
 * 
 * This function can either:
 * 1. Re-chunk existing chunks (if bodyText is not provided)
 * 2. Chunk raw body text (if bodyText is provided)
 */
export function chunkTopic(
  topic: Topic,
  maxChunkSize: number = 1200,
  bodyText?: string
): TopicChunk[] {
  // If body text is provided, use chunkBodyText directly
  if (bodyText !== undefined) {
    return chunkBodyText(topic.id, bodyText, maxChunkSize);
  }

  // Otherwise, re-chunk existing chunks
  const chunks: TopicChunk[] = [];

  // If topic has no body chunks, return empty chunks
  if (!topic.body_chunks || topic.body_chunks.length === 0) {
    logger.warn("Topic has no body content to chunk", { topic_id: topic.id });
    return [];
  }

  // Re-chunk existing chunks if needed
  let currentChunk = "";
  let currentChunkIndex = 0;

  for (const existingChunk of topic.body_chunks) {
    const chunkText = existingChunk.text;
    const chunkTokens = estimateTokens(chunkText);

    // If single chunk fits, add it as-is
    if (chunkTokens <= maxChunkSize) {
      if (currentChunk && estimateTokens(currentChunk) + chunkTokens > maxChunkSize) {
        // Current chunk is full, save it and start new one
        chunks.push({
          topic_id: topic.id,
          chunk_index: currentChunkIndex++,
          text: currentChunk.trim(),
          token_count: estimateTokens(currentChunk),
        });
        currentChunk = chunkText;
      } else {
        // Add to current chunk
        currentChunk = currentChunk ? `${currentChunk}\n\n${chunkText}` : chunkText;
      }
    } else {
      // Chunk is too large, split it by headings
      if (currentChunk) {
        chunks.push({
          topic_id: topic.id,
          chunk_index: currentChunkIndex++,
          text: currentChunk.trim(),
          token_count: estimateTokens(currentChunk),
        });
        currentChunk = "";
      }

      // Split large chunk by headings
      const headingRegex = /^(#{1,6})\s+(.+)$/gm;
      const parts: string[] = [];
      let lastIndex = 0;
      let match;

      while ((match = headingRegex.exec(chunkText)) !== null) {
        if (match.index > lastIndex) {
          parts.push(chunkText.substring(lastIndex, match.index));
        }
        lastIndex = match.index;
      }
      if (lastIndex < chunkText.length) {
        parts.push(chunkText.substring(lastIndex));
      }

      // Process parts
      for (const part of parts) {
        const partTokens = estimateTokens(part);
        if (partTokens <= maxChunkSize) {
          if (currentChunk && estimateTokens(currentChunk) + partTokens > maxChunkSize) {
            chunks.push({
              topic_id: topic.id,
              chunk_index: currentChunkIndex++,
              text: currentChunk.trim(),
              token_count: estimateTokens(currentChunk),
            });
            currentChunk = part;
          } else {
            currentChunk = currentChunk ? `${currentChunk}\n\n${part}` : part;
          }
        } else {
          // Part is still too large, split by sentences
          if (currentChunk) {
            chunks.push({
              topic_id: topic.id,
              chunk_index: currentChunkIndex++,
              text: currentChunk.trim(),
              token_count: estimateTokens(currentChunk),
            });
            currentChunk = "";
          }

          // Split by sentences (rough approximation)
          const sentences = part.split(/(?<=[.!?])\s+/);
          let sentenceChunk = "";
          for (const sentence of sentences) {
            const sentenceTokens = estimateTokens(sentence);
            if (estimateTokens(sentenceChunk) + sentenceTokens > maxChunkSize && sentenceChunk) {
              chunks.push({
                topic_id: topic.id,
                chunk_index: currentChunkIndex++,
                text: sentenceChunk.trim(),
                token_count: estimateTokens(sentenceChunk),
              });
              sentenceChunk = sentence;
            } else {
              sentenceChunk = sentenceChunk ? `${sentenceChunk} ${sentence}` : sentence;
            }
          }
          if (sentenceChunk) {
            currentChunk = sentenceChunk;
          }
        }
      }
    }
  }

  // Add remaining chunk
  if (currentChunk.trim()) {
    chunks.push({
      topic_id: topic.id,
      chunk_index: currentChunkIndex++,
      text: currentChunk.trim(),
      token_count: estimateTokens(currentChunk),
    });
  }

  logger.debug("Chunked topic", {
    topic_id: topic.id,
    chunk_count: chunks.length,
    total_tokens: chunks.reduce((sum, c) => sum + (c.token_count || 0), 0),
  });

  return chunks;
}

/**
 * Chunk a topic's body text (for initial parsing)
 */
export function chunkBodyText(
  topicId: string,
  bodyText: string,
  maxChunkSize: number = 1200
): TopicChunk[] {
  const chunks: TopicChunk[] = [];

  if (!bodyText || bodyText.trim().length === 0) {
    return chunks;
  }

  // Split by headings first (markdown-style headers)
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const sections: Array<{ level: number; title: string; content: string }> = [];
  let match;

  // Find all headings
  const headingMatches: Array<{ index: number; level: number; title: string }> = [];
  while ((match = headingRegex.exec(bodyText)) !== null) {
    headingMatches.push({
      index: match.index,
      level: match[1].length,
      title: match[2].trim(),
    });
  }

  // If no headings, split by paragraphs
  if (headingMatches.length === 0) {
    const paragraphs = bodyText.split(/\n\s*\n/).filter((p) => p.trim());
    let currentChunk = "";
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      const paraTokens = estimateTokens(paragraph);
      if (estimateTokens(currentChunk) + paraTokens > maxChunkSize && currentChunk) {
        chunks.push({
          topic_id: topicId,
          chunk_index: chunkIndex++,
          text: currentChunk.trim(),
          token_count: estimateTokens(currentChunk),
        });
        currentChunk = paragraph;
      } else {
        currentChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        topic_id: topicId,
        chunk_index: chunkIndex++,
        text: currentChunk.trim(),
        token_count: estimateTokens(currentChunk),
      });
    }

    return chunks;
  }

  // Capture content before first heading (introductory content)
  if (headingMatches.length > 0 && headingMatches[0].index > 0) {
    const introText = bodyText.substring(0, headingMatches[0].index).trim();
    if (introText) {
      sections.push({
        level: 0, // Special level for introductory content
        title: "",
        content: introText,
      });
    }
  }

  // Process sections between headings
  for (let i = 0; i < headingMatches.length; i++) {
    const heading = headingMatches[i];
    const nextHeading = headingMatches[i + 1];
    const startIndex = heading.index;
    const endIndex = nextHeading ? nextHeading.index : bodyText.length;

    // Extract heading line
    const headingLineEnd = bodyText.indexOf("\n", startIndex);
    const headingLine = headingLineEnd >= 0
      ? bodyText.substring(startIndex, headingLineEnd + 1)
      : bodyText.substring(startIndex);
    const contentStart = startIndex + headingLine.length;
    const content = bodyText.substring(contentStart, endIndex).trim();

    sections.push({
      level: heading.level,
      title: heading.title,
      content,
    });
  }

  // Group sections into chunks
  let currentChunk = "";
  let chunkIndex = 0;

  for (const section of sections) {
    // Format section text (introductory content has no heading)
    const sectionText = section.level === 0
      ? section.content
      : `#${"#".repeat(section.level - 1)} ${section.title}\n\n${section.content}`;
    const sectionTokens = estimateTokens(sectionText);

    if (sectionTokens > maxChunkSize) {
      // Section is too large, save current chunk and split section
      if (currentChunk) {
        chunks.push({
          topic_id: topicId,
          chunk_index: chunkIndex++,
          text: currentChunk.trim(),
          token_count: estimateTokens(currentChunk),
        });
        currentChunk = "";
      }

      // Split large section by paragraphs
      const paragraphs = section.content.split(/\n\s*\n/).filter((p) => p.trim());
      let sectionChunk = section.level === 0
        ? ""
        : `#${"#".repeat(section.level - 1)} ${section.title}\n\n`;

      for (const paragraph of paragraphs) {
        const paraTokens = estimateTokens(paragraph);
        const minLength = section.level === 0 ? 10 : section.title.length + 10;
        if (estimateTokens(sectionChunk) + paraTokens > maxChunkSize && sectionChunk.trim().length > minLength) {
          chunks.push({
            topic_id: topicId,
            chunk_index: chunkIndex++,
            text: sectionChunk.trim(),
            token_count: estimateTokens(sectionChunk),
          });
          sectionChunk = section.level === 0
            ? paragraph
            : `#${"#".repeat(section.level - 1)} ${section.title}\n\n${paragraph}`;
        } else {
          sectionChunk = `${sectionChunk}${paragraph}\n\n`;
        }
      }

      const minLength = section.level === 0 ? 10 : section.title.length + 10;
      if (sectionChunk.trim().length > minLength) {
        currentChunk = sectionChunk;
      }
    } else if (estimateTokens(currentChunk) + sectionTokens > maxChunkSize && currentChunk) {
      // Current chunk is full, save it
      chunks.push({
        topic_id: topicId,
        chunk_index: chunkIndex++,
        text: currentChunk.trim(),
        token_count: estimateTokens(currentChunk),
      });
      currentChunk = sectionText;
    } else {
      // Add to current chunk
      currentChunk = currentChunk ? `${currentChunk}\n\n${sectionText}` : sectionText;
    }
  }

  // Add remaining chunk
  if (currentChunk.trim()) {
    chunks.push({
      topic_id: topicId,
      chunk_index: chunkIndex++,
      text: currentChunk.trim(),
      token_count: estimateTokens(currentChunk),
    });
  }

  logger.debug("Chunked body text", {
    topic_id: topicId,
    chunk_count: chunks.length,
    total_tokens: chunks.reduce((sum, c) => sum + (c.token_count || 0), 0),
  });

  return chunks;
}

/**
 * Limit chunks to a maximum token count (for tool/resource responses)
 */
export function limitChunks(chunks: TopicChunk[], maxTokens: number = 8000): TopicChunk[] {
  let totalTokens = 0;
  const limited: TopicChunk[] = [];

  for (const chunk of chunks) {
    const chunkTokens = chunk.token_count || estimateTokens(chunk.text);
    if (totalTokens + chunkTokens > maxTokens) {
      break;
    }
    limited.push(chunk);
    totalTokens += chunkTokens;
  }

  if (limited.length < chunks.length) {
    logger.debug("Limited chunks due to token budget", {
      original_count: chunks.length,
      limited_count: limited.length,
      total_tokens: totalTokens,
      max_tokens: maxTokens,
    });
  }

  return limited;
}

