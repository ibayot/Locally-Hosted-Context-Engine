/**
 * Knowledge Graph Builder
 * Constructs import/export/call-site relationships from AST data
 */

import { ASTParser, FileAnalysis, ImportInfo } from './astParser.js';
import * as path from 'path';
import { log } from '../utils/logger.js';

export interface GraphNode {
  path: string;
  exports: Set<string>;
  imports: Map<string, string>; // symbol -> source file
  callSites: Map<string, number>; // symbol -> usage count
}

export interface DependencyEdge {
  from: string;
  to: string;
  symbols: string[];
}

export class KnowledgeGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private parser: ASTParser;
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.parser = new ASTParser();
  }

  async addFile(filePath: string, content: string): Promise<void> {
    const relativePath = path.relative(this.workspacePath, filePath);
    const analysis = this.parser.analyze(relativePath, content);

    const node: GraphNode = {
      path: relativePath,
      exports: new Set(analysis.exports),
      imports: new Map(),
      callSites: new Map()
    };

    // Process imports
    for (const imp of analysis.imports) {
      for (const symbol of imp.specifiers) {
        node.imports.set(symbol, imp.source);
      }
    }

    // Extract call sites from content (simple regex-based)
    this.extractCallSites(content, node);

    this.nodes.set(relativePath, node);
    log.debug('Added file to knowledge graph', { path: relativePath });
  }

  private extractCallSites(content: string, node: GraphNode): void {
    // Simple heuristic: function calls like funcName(...) 
    const callPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    let match;
    
    while ((match = callPattern.exec(content)) !== null) {
      const symbol = match[1];
      // Exclude common keywords
      if (!['if', 'for', 'while', 'switch', 'catch', 'function', 'return'].includes(symbol)) {
        node.callSites.set(symbol, (node.callSites.get(symbol) || 0) + 1);
      }
    }
  }

  removeFile(filePath: string): void {
    const relativePath = path.relative(this.workspacePath, filePath);
    this.nodes.delete(relativePath);
    log.debug('Removed file from knowledge graph', { path: relativePath });
  }

  getDependencies(filePath: string): DependencyEdge[] {
    const relativePath = path.relative(this.workspacePath, filePath);
    const node = this.nodes.get(relativePath);
    if (!node) return [];

    const edges: DependencyEdge[] = [];
    const importSources = new Map<string, string[]>();

    // Group symbols by source
    for (const [symbol, source] of node.imports) {
      if (!importSources.has(source)) {
        importSources.set(source, []);
      }
      importSources.get(source)!.push(symbol);
    }

    // Create edges
    for (const [source, symbols] of importSources) {
      // Resolve source to actual file path
      const resolvedPath = this.resolveImport(source, relativePath);
      if (resolvedPath) {
        edges.push({
          from: relativePath,
          to: resolvedPath,
          symbols
        });
      }
    }

    return edges;
  }

  getDependents(filePath: string): string[] {
    const relativePath = path.relative(this.workspacePath, filePath);
    const dependents: string[] = [];

    for (const [nodePath, node] of this.nodes) {
      const deps = this.getDependencies(nodePath);
      if (deps.some(d => d.to === relativePath)) {
        dependents.push(nodePath);
      }
    }

    return dependents;
  }

  getRelatedFiles(filePath: string, maxDepth: number = 2): Set<string> {
    const relativePath = path.relative(this.workspacePath, filePath);
    const related = new Set<string>();
    const queue: Array<{ path: string; depth: number }> = [{ path: relativePath, depth: 0 }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { path: currentPath, depth } = queue.shift()!;
      
      if (visited.has(currentPath) || depth > maxDepth) continue;
      visited.add(currentPath);
      
      if (currentPath !== relativePath) {
        related.add(currentPath);
      }

      // Add dependencies
      const deps = this.getDependencies(currentPath);
      for (const dep of deps) {
        queue.push({ path: dep.to, depth: depth + 1 });
      }

      // Add dependents
      const dependents = this.getDependents(currentPath);
      for (const dependent of dependents) {
        queue.push({ path: dependent, depth: depth + 1 });
      }
    }

    return related;
  }

  getSymbolUsage(symbol: string): Array<{ file: string; count: number }> {
    const usage: Array<{ file: string; count: number }> = [];

    for (const [filePath, node] of this.nodes) {
      const count = node.callSites.get(symbol) || 0;
      if (count > 0) {
        usage.push({ file: filePath, count });
      }
    }

    return usage.sort((a, b) => b.count - a.count);
  }

  private resolveImport(source: string, fromFile: string): string | null {
    // Handle relative imports
    if (source.startsWith('.')) {
      const fromDir = path.dirname(fromFile);
      const resolved = path.normalize(path.join(fromDir, source));
      
      // Try common extensions
      const candidates = [
        resolved,
        `${resolved}.ts`,
        `${resolved}.js`,
        `${resolved}/index.ts`,
        `${resolved}/index.js`
      ];

      for (const candidate of candidates) {
        if (this.nodes.has(candidate)) {
          return candidate;
        }
      }
    }

    // For node_modules or absolute imports, return null (external)
    return null;
  }

  getStats() {
    return {
      files: this.nodes.size,
      totalImports: Array.from(this.nodes.values()).reduce((sum, n) => sum + n.imports.size, 0),
      totalExports: Array.from(this.nodes.values()).reduce((sum, n) => sum + n.exports.size, 0),
    };
  }
}
