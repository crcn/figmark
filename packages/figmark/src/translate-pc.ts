import { createTranslateContext, TranslateContext, addBuffer, startBlock, endBlock } from "./translate-utils";
import {Node, NodeType, Document, VectorNodeProps} from "./state";
import {snakeCase, camelCase} from "lodash";
import { pascalCase } from "./utils";
const memoize = require("fast-memoize");


export const translateFigmaProjectToPaperclip = (file) => {
  let context = createTranslateContext();
  context = addBuffer(`\n\n<!-- STYLES -->\n\n`, context);
  context = translateStyles(file, context);
  context = addBuffer(`\n<!-- COMPONENTS -->\n\n`, context);
  context = translateComponents(file.document, context);

  context = addBuffer(`<!-- PREVIEWS -->\n\n`, context);
  context = translatePreview(file.document, context);
  console.log(context.buffer);
  return context.buffer;
}

const translateComponents = (node: Node, context: TranslateContext) => {
  const allNodes: Node[] = flattenNodes(node);
  for (const child of allNodes) {
    if (child.type === NodeType.Document || child.type === NodeType.Canvas) {
      continue;
    }
    context = translateComponent(child, context);
  }
  return context;
};

const translateComponent = (node: Node, context: TranslateContext) => {
  const componentName = getNodeComponentName(node);
  context = addBuffer(`<div export component as="${componentName}" class="${getNodeClassName(node)} {className?}">\n`, context);
  context = startBlock(context);
  context = addBuffer(`{children}\n`, context);
  context = endBlock(context);
  context = addBuffer(`</div>\n\n`, context);
  return context;
}

const translatePreview = (node: Node, context: TranslateContext, extraLineBreak: boolean) => {

  const shouldIncludeTag = node.type !== NodeType.Document && node.type !== NodeType.Canvas;

  if (shouldIncludeTag) {
    context = addBuffer(`<${getNodeComponentName(node)}>\n`, context);
    context = startBlock(context);
  }
  if (node.type === NodeType.Document || node.type === NodeType.Canvas || node.type === NodeType.Frame || node.type === NodeType.Group) {
    for (const child of node.children) {
      context = translatePreview(child, context, !shouldIncludeTag);
    }
  }
  if (shouldIncludeTag) {
    context = endBlock(context);
    context = addBuffer(`</${getNodeComponentName(node)}>\n`, context);
    if (extraLineBreak) {
      context = addBuffer(`\n`, context);
    }
  }
  return context;
};


const translateStyles = (file, context: TranslateContext) => {
  const allNodes: Node[] = flattenNodes(file.document);
  context = addBuffer(`<style>\n`, context);
  context = startBlock(context);
  for (const node of allNodes) {
    if (node.type === NodeType.Rectangle) {
      context = addBuffer(`.${getNodeClassName(node)} {\n`, context);
      context = addVectorPropStyles(node, context);
      context = addBuffer(`}\n\n`, context);
    }
  }
  context = endBlock(context);
  context = addBuffer(`</style>\n\n`, context);
  return context
}

// TODO - need to use compoennt name
const getNodeClassName = (node: Node) => {
  return "_" + snakeCase(node.name);
}


// TODO - need to use compoennt name
const getNodeComponentName = (node: Node) => {
  return pascalCase(node.name);
}

const addVectorPropStyles = ({ opacity, fills, absoluteBoundingBox }: VectorNodeProps, context: TranslateContext) => {
  if (opacity != null) {
    context = addBuffer(`opacity: ${opacity};\n`, context);
  }
  for (const fill of fills) {
    
  }
  return context;
};

const flattenNodes = memoize((node: Node): Node[] => {
  return flattenNodes2(node)
});

const flattenNodes2 = (node: Node, allNodes: Node[] = []) => {
  allNodes.push(node);
  if ((node as any).children) {
    for (const child of (node as any).children) {
      flattenNodes2(child, allNodes);
    }
  }
  return allNodes;
};