export interface LintViolation {
  filePath: string;
  line: number;
  column: number;
  message: string;
}

export function lintSourceCode(sourceText: string, filePath?: string): LintViolation[];
export function lintAllSources(rootDir?: string): LintViolation[];
