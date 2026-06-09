/**
 * Language Detector
 * Detects programming languages from file extensions
 */

/**
 * Language detection map from file extensions to language names
 */
export const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'zsh',
  '.fish': 'fish',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.json': 'json',
  '.toml': 'toml',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.sql': 'sql',
  '.xml': 'xml',
  '.dart': 'dart',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.lua': 'lua',
  '.r': 'r',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hs': 'haskell',
  '.clj': 'clojure',
  '.fs': 'fsharp',
  '.vb': 'visualbasic',
  '.pl': 'perl',
  '.pm': 'perl',
};

/**
 * Language Detector handles language detection
 * This is extracted from electron/tools/coding-tool.ts
 */
export class LanguageDetector {
  /**
   * Detect language from file path
   */
  detectFromPath(filePath: string): string {
    const ext = this.getExtension(filePath);
    return LANGUAGE_MAP[`.` + ext] || ext || 'unknown';
  }

  /**
   * Get file extension from path
   */
  private getExtension(filePath: string): string {
    const parts = filePath.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  }

  /**
   * Check if file is of a specific language
   */
  isLanguage(filePath: string, language: string): boolean {
    return this.detectFromPath(filePath) === language;
  }

  /**
   * Get all supported extensions
   */
  getSupportedExtensions(): string[] {
    return Object.keys(LANGUAGE_MAP).map(ext => ext.slice(1));
  }

  /**
   * Get language by extension
   */
  getLanguage(extension: string): string | undefined {
    const normalizedExt = extension.startsWith('.') ? extension : `.${extension}`;
    return LANGUAGE_MAP[normalizedExt];
  }

  /**
   * Check if extension is supported
   */
  isSupported(extension: string): boolean {
    const normalizedExt = extension.startsWith('.') ? extension : `.${extension}`;
    return normalizedExt in LANGUAGE_MAP;
  }

  /**
   * Get languages by category
   */
  getLanguagesByCategory(): Record<string, string[]> {
    const categories: Record<string, string[]> = {
      javascript: ['typescript', 'javascript'],
      compiled: ['rust', 'go', 'c', 'cpp'],
      scripting: ['python', 'ruby', 'php', 'perl'],
      jvm: ['java', 'kotlin', 'scala', 'clojure'],
      functional: ['haskell', 'elixir', 'erlang', 'fsharp'],
      markup: ['html', 'xml', 'markdown'],
      stylesheet: ['css', 'scss', 'sass', 'less'],
      data: ['json', 'yaml', 'toml'],
      shell: ['bash', 'zsh', 'fish'],
    };

    return categories;
  }

  /**
   * Get common file patterns for a language
   */
  getFilePatterns(language: string): string[] {
    const patterns: Record<string, string[]> = {
      typescript: ['*.ts', '*.tsx'],
      javascript: ['*.js', '*.jsx', '*.mjs'],
      python: ['*.py'],
      rust: ['*.rs'],
      go: ['*.go'],
      java: ['*.java'],
    };

    return patterns[language] || [];
  }
}
