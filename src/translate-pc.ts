import { createTranslateContext, TranslateContext, addBuffer, startBlock, endBlock } from "./translate-utils";
import {Node, NodeType, VectorNodeProps, hasVectorProps, flattenNodes, getUniqueNodeName, hasChildren, Document, cleanupNodeId, getNodeById, getAllTextNodes} from "./state";
import { pascalCase } from "./utils";


export const translateFigmaProjectToPaperclip = (file) => {
  let context = createTranslateContext();

  context = addBuffer(`\n\n<!-- STYLES -->\n\n`, context);
  context = translateStyles(file.document, context);

  context = addBuffer(`\n<!-- COMPONENTS -->\n\n`, context);
  context = translateComponents(file.document, context);

  context = addBuffer(`<!-- PREVIEWS -->\n\n`, context);
  context = translatePreviews(file.document, context);
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
const translatePreviews = (document: Document, context: TranslateContext) => {
  const canvas = document.children[0];

  if (!hasChildren(canvas)) {
    return;
  }

  for (const child of canvas.children) {
    context = translatePreview(child, document, context);

    // some space between previews
    context = addBuffer(`\n`, context);
  }

  return context;
}

const getPreviewComponentName = (nodeId: string, document: Document) => "_" + pascalCase(getNodeById(nodeId, document).name + "_" + cleanupNodeId(nodeId));

const translatePreview = (node: Node, document: Document, context: TranslateContext, inComponent?: boolean) => {




  if (node.type === NodeType.Instance) {
    context = translateInstancePreview(node, document, node.componentId, context);
  } else {


    context = addBuffer(`<${getNodeComponentName(node)}`, context);
    const isComponent = node.type === NodeType.Component;

    if (isComponent) {
      context = addBuffer(` component as="${getPreviewComponentName(node.id, document)}"`, context);
      inComponent = true;
    }

    context = addBuffer(`>\n`, context);
    context = startBlock(context);
    if (node.type === NodeType.Text) {
      if (inComponent) {
        context = addBuffer(`{_${getUniqueNodeName(node)}_text}\n`, context);
      } else {
        context = addBuffer(`${node.characters}\n`, context);
      }

    } else if (hasChildren(node)) {
      for (const child of node.children) {
        context = translatePreview(child, document, context, inComponent);
      }
    }
    context = endBlock(context);
    context = addBuffer(`</${getNodeComponentName(node)}>\n`, context);

    if (isComponent) {
      context = addBuffer(`\n`, context);
      context = translateInstancePreview(node, document, node.id, context, false);
    }
  }
  return context;
};

const translateInstancePreview = (node: Node, document: Document, componentId: string, context: TranslateContext, includeClasses: boolean = true) => {
  context = addBuffer(`<${getPreviewComponentName(componentId, document)}`, context);
  if (includeClasses) {
    context = addBuffer(` className="${getNodeClassName(node)}"`, context);
  }
  for (const textNode of getAllTextNodes(node)) {
    context = addBuffer(` ${getUniqueNodeName(textNode)}_text=${JSON.stringify(textNode.characters)}`, context);
  }
  context = addBuffer(` />\n`, context);
  return context;
};


const translateStyles = (document: Node, context: TranslateContext) => {
  const allNodes: Node[] = flattenNodes(document);
  context = addBuffer(`<style>\n`, context);
  context = startBlock(context);
  for (const node of allNodes) {
    if (node.type === NodeType.Document || node.type === NodeType.Canvas) {
      continue;
    }
    context = addBuffer(`:global(.${getNodeClassName(node)}) {\n`, context);
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