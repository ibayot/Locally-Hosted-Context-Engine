/**
 * Hierarchical chunking strategy
 * Chunks at multiple levels: file → class → function → block
 */

import { ASTParser, CodeSymbol } from './astParser.js';
import * as crypto from 'crypto';

export interface HierarchicalChunk {
  content: string;
  startLine: number;
  endLine: number;
  type: 'file' | 'definition' | 'block';
  symbolName?: string;
  level: number; // 0 = file, 1 = class/interface, 2 = function/method, 3 = block
  parentSymbol?: string;
}

export class HierarchicalChunker {
  private parser: ASTParser;
  private maxChunkSize: number;
  private minChunkSize: number;
  private overlap: number;

  constructor(maxChunkSize: number = 150, minChunkSize: number = 20, overlap: number = 20) {
    this.parser = new ASTParser();
    this.maxChunkSize = maxChunkSize;
    this.minChunkSize = minChunkSize;
    this.overlap = overlap;
  }

  createChunks(content: string, filePath: string): HierarchicalChunk[] {
    const lines = content.split('\n');
    const chunks: HierarchicalChunk[] = [];

    // First: create file-level summary chunk (top N lines or first significant comment block)
    const summaryLines = this.extractFileSummary(lines);
    if (summaryLines.length > 0) {
      chunks.push({
        content: summaryLines.join('\n'),
        startLine: 1,
        endLine: summaryLines.length,
        type: 'file',
        level: 0,
      });
    }

    // Second: extract symbols and create definition-level chunks
    const analysis = this.parser.analyze(filePath, content);
    const symbolChunks = this.createSymbolChunks(lines, analysis.symbols);
    chunks.push(...symbolChunks);

    // Third: fill gaps with block-level chunks (lines not covered by symbols)
    const coveredLines = new Set<number>();
    symbolChunks.forEach(chunk => {
      for (let i = chunk.startLine; i <= chunk.endLine; i++) {
        coveredLines.add(i);
      }
    });

    const gapChunks = this.createGapChunks(lines, coveredLines);
    chunks.push(...gapChunks);

    return chunks;
  }

  private extractFileSummary(lines: string[]): string[] {
    // Extract top comment block or first 10 meaningful lines
    const summary: string[] = [];
    let inCommentBlock = false;
    let meaningfulLines = 0;

    for (let i = 0; i < Math.min(lines.length, 50); i++) {
      const line = lines[i].trim();

      // Multi-line comment detection
      if (line.startsWith('/**') || line.startsWith('/*')) {
        inCommentBlock = true;
      }

      if (inCommentBlock) {
        summary.push(lines[i]);
        if (line.includes('*/')) {
          inCommentBlock = false;
          break;
        }
        continue;
      }

      // Skip empty lines and imports at beginning
      if (!line || line.startsWith('import ') || line.startsWith('from ')) {
        continue;
      }

      summary.push(lines[i]);
      meaningfulLines++;

      if (meaningfulLines >= 10) {
        break;
      }
    }

    return summary;
  }

  private createSymbolChunks(lines: string[], symbols: CodeSymbol[]): HierarchicalChunk[] {
    const chunks: HierarchicalChunk[] = [];

    for (const symbol of symbols) {
      const startLine = symbol.startLine;
      let endLine = startLine;

      // Find the end of the symbol definition
      if (symbol.kind === 'class' || symbol.kind === 'interface') {
        endLine = this.findMatchingBrace(lines, startLine - 1) + 1;
      } else if (symbol.kind === 'function' || symbol.kind === 'method') {
        endLine = this.findMatchingBrace(lines, startLine - 1) + 1;
      } else {
        // For variables/properties, take just the declaration
        endLine = startLine;
      }

      const lineCount = endLine - startLine + 1;

      // If symbol is too large, create sub-chunks
      if (lineCount > this.maxChunkSize) {
        const subChunks = this.splitLargeSymbol(lines, startLine, endLine, symbol.name, symbol.kind);
        chunks.push(...subChunks);
      } else if (lineCount >= this.minChunkSize) {
        chunks.push({
          content: lines.slice(startLine - 1, endLine).join('\n'),
          startLine,
          endLine,
          type: 'definition',
          symbolName: symbol.name,
          level: this.getSymbolLevel(symbol.kind),
        });
      }
    }

    return chunks;
  }

  private findMatchingBrace(lines: string[], startLine: number): number {
    let braceCount = 0;
    let foundFirstBrace = false;

    for (let i = startLine; i < Math.min(lines.length, startLine + this.maxChunkSize * 2); i++) {
      const line = lines[i];
      
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          foundFirstBrace = true;
        } else if (char === '}') {
          braceCount--;
          if (foundFirstBrace && braceCount === 0) {
            return i + 1; // 1-indexed
          }
        }
      }
    }

    // If no matching brace found, return startLine + reasonable default
    return Math.min(startLine + this.maxChunkSize, lines.length);
  }

  private splitLargeSymbol(
    lines: string[],
    startLine: number,
    endLine: number,
    symbolName: string,
    kind: string
  ): HierarchicalChunk[] {
    const chunks: HierarchicalChunk[] = [];
    let currentStart = startLine;

    while (currentStart < endLine) {
      const currentEnd = Math.min(currentStart + this.maxChunkSize - 1, endLine);
      
      chunks.push({
        content: lines.slice(currentStart - 1, currentEnd).join('\n'),
        startLine: currentStart,
        endLine: currentEnd,
        type: 'definition',
        symbolName,
        level: this.getSymbolLevel(kind),
        parentSymbol: symbolName,
      });

      currentStart = currentEnd - this.overlap + 1;
    }

    return chunks;
  }

  private createGapChunks(lines: string[], coveredLines: Set<number>): HierarchicalChunk[] {
    const chunks: HierarchicalChunk[] = [];
    let gapStart: number | null = null;

    for (let i = 1; i <= lines.length; i++) {
      if (!coveredLines.has(i)) {
        if (gapStart === null) {
          gapStart = i;
        }
      } else {
        if (gapStart !== null) {
          const gapEnd = i - 1;
          const gapSize = gapEnd - gapStart + 1;

          if (gapSize >= this.minChunkSize) {
            // Split large gaps into multiple chunks
            let currentStart = gapStart;
            while (currentStart <= gapEnd) {
              const currentEnd = Math.min(currentStart + this.maxChunkSize - 1, gapEnd);
              
              chunks.push({
                content: lines.slice(currentStart - 1, currentEnd).join('\n'),
                startLine: currentStart,
                endLine: currentEnd,
                type: 'block',
                level: 3,
              });

              currentStart = currentEnd - this.overlap + 1;
              if (currentStart > gapEnd) break;
            }
          }

          gapStart = null;
        }
      }
    }

    // Handle final gap
    if (gapStart !== null) {
      const gapEnd = lines.length;
      const gapSize = gapEnd - gapStart + 1;

      if (gapSize >= this.minChunkSize) {
        chunks.push({
          content: lines.slice(gapStart - 1, gapEnd).join('\n'),
          startLine: gapStart,
          endLine: gapEnd,
          type: 'block',
          level: 3,
        });
      }
    }

    return chunks;
  }

  private getSymbolLevel(kind: string): number {
    switch (kind) {
      case 'class':
      case 'interface':
        return 1;
      case 'function':
      case 'method':
        return 2;
      default:
        return 3;
    }
  }

  hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
