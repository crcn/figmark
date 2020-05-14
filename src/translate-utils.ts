export type TranslateContext = {
  buffer: string;
  lineNumber: number;
  currentIndexKey?: string;
  isNewLine: boolean;
  indent: string;
  keyCount: number;
};

export const createTranslateContext = (
  indent: string = "  "
): TranslateContext => ({
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
