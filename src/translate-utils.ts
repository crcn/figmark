import { CompilerOptions, Document, DependencyMap } from "./state";

export type TranslateContext = {
  buffer: string;
  filePath: string;
  document: Document;
  lineNumber: number;
  currentIndexKey?: string;
  compilerOptions: CompilerOptions;
  importedDependencyMap: DependencyMap;
  isNewLine: boolean;
  indent: string;
  keyCount: number;
};

export const createTranslateContext = (
  document: Document,
  filePath: string,
  compilerOptions: CompilerOptions,
  importedDependencyMap: DependencyMap,
  indent: string = "  "
): TranslateContext => ({
  document,
  filePath,
  importedDependencyMap,
  compilerOptions,
  buffer: "",
  isNewLine: true,
  lineNumber: 0,
  indent,
  keyCount: 0,
});

export const addBuffer = (buffer: string, context: TranslateContext) => ({
  ...context,
  buffer:
    context.buffer +
    (context.isNewLine ? context.indent.repeat(context.lineNumber) : "") +
    buffer,
  isNewLine: buffer.lastIndexOf("\n") === buffer.length - 1,
});

export const startBlock = (context: TranslateContext) => ({
  ...context,
  lineNumber: context.lineNumber + 1,
});

export const endBlock = (context: TranslateContext) => ({
  ...context,
  lineNumber: context.lineNumber - 1,
});
