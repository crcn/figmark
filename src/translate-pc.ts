import { createTranslateContext, TranslateContext, addBuffer, startBlock, endBlock } from "./translate-utils";
import {Node, NodeType, VectorNodeProps, hasVectorProps, flattenNodes, getUniqueNodeName, hasChildren} from "./state";
import { pascalCase } from "./utils";


export const translateFigmaProjectToPaperclip = (file) => {
  let context = createTranslateContext();

  context = addBuffer(`\n\n<!-- STYLES -->\n\n`, context);
  context = translateStyles(file, context);

  context = addBuffer(`\n<!-- COMPONENTS -->\n\n`, context);
  context = translateComponents(file.document, context);

  context = addBuffer(`<!-- PREVIEWS -->\n\n`, context);
  context = translatePreview(file.document, context);
  // console.log(JSON.stringify(file, null, 2));
  console.log(context.buffer);
  // console.log(JSON.stringify(file, null, 2));
  return context.buffer;
}

const translateComponents = (node: Node, context: TranslateContext) => {
  context = translateComponent(node, context);

  if (!hasChildren(node) || node.type === NodeType.Instance) {
    return context;
  }

  for (const child of node.children) {
    context = translateComponents(child, context);
  }
  return context;
};

const translateComponent = (node: Node, context: TranslateContext) => {
  if (node.type === NodeType.Document || node.type === NodeType.Canvas || node.type === NodeType.Instance) {
    return context;
  }

  const componentName = getNodeComponentName(node);
  if (node.type === NodeType.Vector) {
    context = addBuffer(`<svg export component as="${componentName}" class="${getNodeClassName(node)} {className?}">\n`, context);
    context = startBlock(context);
    // context = addBuffer(``)
    context = endBlock(context);
    context = addBuffer(`</svg>\n\n`, context);
  } else {
    const tagName = node.type === NodeType.Text ? `span` : `div`;

    context = addBuffer(`<${tagName} export component as="${componentName}" class="${getNodeClassName(node)} {className?}">\n`, context);
    context = startBlock(context);
    context = addBuffer(`{children}\n`, context);
    context = endBlock(context);
    context = addBuffer(`</${tagName}>\n\n`, context);
  }
  return context;
}

const translatePreview = (node: Node, context: TranslateContext, extraLineBreak: boolean = false) => {

  const shouldIncludeTag = node.type !== NodeType.Document && node.type !== NodeType.Canvas;

  if (shouldIncludeTag) {
    context = addBuffer(`<${getNodeComponentName(node)}>\n`, context);
    context = startBlock(context);
  }
  if (hasChildren(node)) {
    for (const child of node.children) {
      context = translatePreview(child, context, !shouldIncludeTag);
    }
  }
  if (node.type === NodeType.Text) {
    context = addBuffer(`${node.characters}\n`, context);
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
    if (node.type === NodeType.Document || node.type === NodeType.Canvas) {
      continue;
    }
    context = addBuffer(`.${getNodeClassName(node)} {\n`, context);
    context = addVectorPropStyles(node, context);
    context = addBuffer(`}\n\n`, context);
  }
  context = endBlock(context);
  context = addBuffer(`</style>\n\n`, context);
  return context
}

// TODO - need to use compoennt name
const getNodeClassName = (node: Node) => {
  return `_${getUniqueNodeName(node)}`
}



// TODO - need to use compoennt name
const getNodeComponentName = (node: Node) => {
  return pascalCase(node.name);
}

const addVectorPropStyles = ({ opacity, fills, absoluteBoundingBox }: Partial<VectorNodeProps>, context: TranslateContext) => {
  if (opacity != null) {
    context = addBuffer(`opacity: ${opacity};\n`, context);
  }
  for (const fill of fills) {
    
  }
  return context;
};