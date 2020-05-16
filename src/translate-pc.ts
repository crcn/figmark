// inspired by https://github.com/KarlRombauts/Figma-SCSS-Generator/blob/master/gradients.js
import {
  createTranslateContext,
  TranslateContext,
  addBuffer,
  startBlock,
  endBlock,
} from "./translate-utils";
import {
  Node,
  NodeType,
  hasVectorProps,
  flattenNodes,
  getUniqueNodeName,
  LinearGradient,
  Vector,
  hasChildren,
  Document,
  cleanupNodeId,
  Rectangle,
  getNodeById,
  getAllTextNodes,
  Color,
  FillType,
} from "./state";
import { pascalCase } from "./utils";
const memoize = require("fast-memoize");

export const translateFigmaProjectToPaperclip = (file) => {
  let context = createTranslateContext();

  context = addBuffer(`\n<!--\n`, context);
  context = startBlock(context);
  context = addBuffer(`!! AUTO GENERATED, EDIT WITH CAUTION !!\n`, context);
  context = endBlock(context);
  context = addBuffer(`-->`, context);

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
};

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
  if (
    node.type === NodeType.Document ||
    node.type === NodeType.Canvas ||
    node.type === NodeType.Instance
  ) {
    return context;
  }

  const componentName = getNodeComponentName(node);
  if (node.type === NodeType.Vector) {
    context = addBuffer(
      `<svg export component as="${componentName}" className="${getNodeClassName(
        node
      )} {className?}">\n`,
      context
    );
    context = startBlock(context);
    // context = addBuffer(``)
    context = endBlock(context);
    context = addBuffer(`</svg>\n\n`, context);
  } else {
    const tagName = node.type === NodeType.Text ? `span` : `div`;

    context = addBuffer(
      `<${tagName} export component as="${componentName}" className="${getNodeClassName(
        node
      )} {className?}">\n`,
      context
    );
    context = startBlock(context);
    context = addBuffer(`{children}\n`, context);
    context = endBlock(context);
    context = addBuffer(`</${tagName}>\n\n`, context);
  }
  return context;
};
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
};

const getPreviewComponentName = (nodeId: string, document: Document) =>
  "_" +
  pascalCase(getNodeById(nodeId, document).name + "_" + cleanupNodeId(nodeId));

const translatePreview = (
  node: Node,
  document: Document,
  context: TranslateContext,
  inComponent?: boolean
) => {
  if (node.type === NodeType.Instance) {
    context = translateInstancePreview(
      node,
      document,
      node.componentId,
      context
    );
  } else {
    context = addBuffer(`<${getNodeComponentName(node)}`, context);
    const isComponent = node.type === NodeType.Component;

    if (isComponent) {
      context = addBuffer(
        ` component as="${getPreviewComponentName(node.id, document)}"`,
        context
      );
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
      context = translateInstancePreview(
        node,
        document,
        node.id,
        context,
        false
      );
    }
  }
  return context;
};

const translateInstancePreview = (
  node: Node,
  document: Document,
  componentId: string,
  context: TranslateContext,
  includeClasses: boolean = true
) => {
  context = addBuffer(
    `<${getPreviewComponentName(componentId, document)}`,
    context
  );
  if (includeClasses) {
    context = addBuffer(` className="${getNodeClassName(node)}"`, context);
  }
  for (const textNode of getAllTextNodes(node)) {
    context = addBuffer(
      ` ${getUniqueNodeName(textNode)}_text=${JSON.stringify(
        textNode.characters
      )}`,
      context
    );
  }
  context = addBuffer(` />\n`, context);
  return context;
};

const translateStyles = (document: Document, context: TranslateContext) => {
  const allNodes: Node[] = flattenNodes(document);
  context = addBuffer(`<style>\n`, context);
  context = startBlock(context);
  for (const node of document.children) {
    context = translateClassNames(
      getNestedCSSStyles(
        node,
        document,
        node.type === NodeType.Instance ? node.componentId : null
      ),
      context,
      false
    );
  }
  context = endBlock(context);
  context = addBuffer(`</style>\n\n`, context);
  return context;
};

const translateClassNames = (
  info: ComputedNestedStyleInfo,
  context: TranslateContext,
  isNested: boolean,
  instanceOfId?: string
) => {
  if (info.node.type === NodeType.Canvas) {
    return info.children.reduce(
      (context, childInfo) => translateClassNames(childInfo, context, false),
      context
    );
  }

  if (!containsStyle(info)) {
    return context;
  }

  const nodeSelector = `.${getNodeClassName(info.node)}`;

  if (isNested) {
    context = addBuffer(`& > :global(${nodeSelector}) {\n`, context);
  } else {
    context = addBuffer(`:global(${nodeSelector}) {\n`, context);
  }

  context = startBlock(context);

  // TODO - for component instances, filter out props that match
  // component props

  // TODO - get CSS props ins
  for (const key in info.style) {
    context = addBuffer(`${key}: ${info.style[key]};\n`, context);
  }

  context = info.children.reduce(
    (context, child) => translateClassNames(child, context, true),
    context
  );
  context = endBlock(context);
  context = addBuffer(`}\n\n`, context);
  return context;
};

// TODO - need to use compoennt name
const getNodeClassName = (node: Node) => {
  return `_${getUniqueNodeName(node)}`;
};

// TODO - need to use compoennt name
const getNodeComponentName = (node: Node) => {
  return pascalCase(node.name);
};

export type ComputedNestedStyleInfo = {
  node: Node;
  style: Record<string, string | number>;
  children: ComputedNestedStyleInfo[];
};

const getNestedCSSStyles = (
  node: Node,
  document: Document,
  instanceOfId?: string
): ComputedNestedStyleInfo => {
  const nodeStyle = getCSSStyle(node, document, instanceOfId);
  return {
    node,
    style: nodeStyle,
    children: hasChildren(node)
      ? node.children.map((child) => {
          return getNestedCSSStyles(child, document, instanceOfId);
        })
      : [],
  };
};

const containsStyle = memoize(
  (
    info: ComputedNestedStyleInfo,
    document: Document,
    instanceOfId?: string
  ) => {
    if (Object.keys(info.style).length > 0) {
      return true;
    }
    for (const child of info.children) {
      if (containsStyle(child, document, instanceOfId)) {
        return true;
      }
    }
    return false;
  }
);

const getCSSStyle = (node, document: Document, instanceOfId?: string) => {
  const style: Record<string, string | number> = {};

  if (node.absoluteBoundingBox) {
    style.position = "absolute";
    style.left = Math.round(node.absoluteBoundingBox.x) + "px";
    style.top = Math.round(node.absoluteBoundingBox.x) + "px";
    style.width = Math.round(node.absoluteBoundingBox.width) + "px";
    style.height = Math.round(node.absoluteBoundingBox.height) + "px";
  }

  if (node.type === NodeType.Text) {
    Object.assign(style, translateStyle(node.style));
  }

  if (hasVectorProps(node)) {
    if (node.opacity != null) {
      style.opacity = node.opacity;
    }
    if (node.fills.length) {
      style.background = node.fills
        .reverse()
        .map((fill, index) => {
          switch (fill.type) {
            case FillType.SOLID: {
              return getCSSRGBAColor(
                fill.color,
                index === node.fills.length - 1
              );
            }
            case FillType.GRADIENT_LINEAR: {
              return getCSSLinearGradient(fill);
            }
          }
        })
        .join(", ");
    }
  }
  return style;
};

const getCSSRGBAColor = ({ r, g, b, a }: Color, last: boolean) => {
  // TODO - generate hash
  const color = `rgba(${Math.round(r * 255)}, ${Math.round(
    g * 255
  )}, ${Math.round(b * 255)}, ${a})`;

  return last ? color : `linear-gradient(0deg, ${color}, ${color})`;
};

const STYLE_MAP = {
  fontFamily: "font-family",
  fontWeight: "font-weight",
  fontSize: "font-size",
  letterSpacing: "letter-spacing",
};

const translateStyle = (style: Record<string, string>) => {
  const newStyle = {};
  for (const key in style) {
    const newKey = STYLE_MAP[key];
    const value = style[key];
    if (!newKey) {
      continue;
    }
    newStyle[newKey] = value;
  }
  return newStyle;
};

const getCSSLinearGradient = ({
  gradientHandlePositions,
  gradientStops,
}: LinearGradient) => {
  const [start, end] = gradientHandlePositions;
  const angle = calcAngle(start, end);
  return `linear-gradient(${angle}deg, ${gradientStops
    .map((stop) => {
      return `${getCSSRGBAColor(stop.color, false)} ${stop.position * 100}%`;
    })
    .join(", ")})`;
};

const calcAngle = (start: Vector, end: Vector) => {
  const radians = Math.atan(calcGradent(start, end));
  return parseInt(radToDeg(radians).toFixed(1));
};
const calcGradent = (start: Vector, end: Vector) => {
  return ((end.y - start.y) / (end.x - start.x)) * -1;
};
const radToDeg = (radian: number) => (180 * radian) / Math.PI;
