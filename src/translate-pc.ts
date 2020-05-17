// inspired by https://github.com/KarlRombauts/Figma-SCSS-Generator/blob/master/gradients.js
// https://github.com/figma/figma-api-demo/blob/533d556c853fad731f65c5c264dd8adc0eaf1b1b/figma-to-react/lib/figma.js
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
  Text,
  flattenNodes,
  getUniqueNodeName,
  RadialGradient,
  LinearGradient,
  Vector,
  hasChildren,
  Document,
  FrameProps,
  cleanupNodeId,
  Rectangle,
  getNodeById,
  getAllTextNodes,
  Color,
  FillType,
  Fill,
  SolidFill,
  VectorNodeProps,
  BaseNode,
  Effect,
  ImageFill,
  getNodeExportFileName,
  Component,
  getNodePath,
  getNodeByPath,
  Instance,
  hasVectorProps,
  VectorNode,
  CompilerOptions,
  getOwnerComponent,
} from "./state";
import { pascalCase, logWarn } from "./utils";
import * as chalk from "chalk";
import { camelCase } from "lodash";

export const translateFigmaProjectToPaperclip = (
  file,
  compilerOptions: CompilerOptions
) => {
  let context = createTranslateContext(compilerOptions);

  context = addBuffer(`\n<!--\n`, context);
  context = startBlock(context);
  context = addBuffer(`!! AUTO GENERATED, EDIT WITH CAUTION !!\n`, context);
  context = endBlock(context);
  context = addBuffer(`-->`, context);

  context = addBuffer(`\n\n<!-- STYLES -->\n\n`, context);
  context = translateStyles(file.document, context);

  context = addBuffer(`\n<!-- ALL LAYERS & COMPONENTS -->\n\n`, context);
  context = translateComponents(file.document, file.document, context);

  if (compilerOptions.includePreviews !== false) {
    context = addBuffer(`<!-- PREVIEWS -->\n\n`, context);
    context = translatePreviews(file.document, context);
  }
  return context.buffer;
};

const translateComponents = (
  node: Node,
  document: Document,
  context: TranslateContext
) => {
  context = translateComponent(node, document, context);

  if (!hasChildren(node) || node.type === NodeType.Instance) {
    return context;
  }

  for (const child of node.children) {
    context = translateComponents(child, document, context);
  }
  return context;
};

const translateComponent = (
  node: Node,
  document: Document,
  context: TranslateContext
) => {
  if (
    node.type === NodeType.Document ||
    node.type === NodeType.Canvas ||
    node.type === NodeType.Instance
  ) {
    return context;
  }

  const componentName = getNodeComponentName(node, document);
  const withAbsoluteLayoutAttr =
    context.compilerOptions.includeAbsoluteLayout !== false
      ? `data-with-absolute-layout={withAbsoluteLayout?}`
      : ``;

  if (node.exportSettings && node.exportSettings.length) {
    context = addBuffer(
      `<img export component as="${componentName}" src="./${getNodeExportFileName(
        node,
        document,
        node.exportSettings[0]
      )}" ${withAbsoluteLayoutAttr} className="${getNodeClassName(
        node,
        document
      )} {className?}">\n\n`,
      context
    );

    return context;
  }

  if (node.type === NodeType.Vector) {
    context = addBuffer(
      `<svg export component as="${componentName}" ${withAbsoluteLayoutAttr} className="${getNodeClassName(
        node,
        document
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
      `<${tagName} export component as="${componentName}" ${withAbsoluteLayoutAttr} className="${getNodeClassName(
        node,
        document
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

const getAllComponents = (document: Document) => {
  return flattenNodes(document).filter(
    (node) => node.type === NodeType.Component
  ) as Component[];
};

const translatePreviews = (document: Document, context: TranslateContext) => {
  const canvas = document.children[0];

  if (!hasChildren(canvas)) {
    return;
  }

  const allComponents = getAllComponents(document);

  for (const component of allComponents) {
    context = translateComponentPreview(component, document, context);
  }

  for (const child of canvas.children) {
    context = translatePreview(child, document, context);

    // some space between previews
    context = addBuffer(`\n`, context);
  }

  return context;
};

const getPreviewComponentName = (nodeId: string, document: Document) =>
  "_Preview_" +
  pascalCase(getNodeById(nodeId, document).name + "_" + cleanupNodeId(nodeId));

const translateComponentPreview = (
  node: Component,
  document: Document,
  context: TranslateContext
) => {
  context = addBuffer(
    `<${getNodeComponentName(
      node,
      document
    )} component as="${getPreviewComponentName(node.id, document)}"${
      context.compilerOptions.includeAbsoluteLayout !== false
        ? " withAbsoluteLayout"
        : ""
    } {className}`,
    context
  );

  context = addBuffer(`>\n`, context);
  context = translatePreviewChildren(node, document, context, true);
  context = addBuffer(`</${getNodeComponentName(node, document)}>\n`, context);

  return context;
};

const translatePreview = (
  node: Node,
  document: Document,
  context: TranslateContext,
  inComponent?: boolean
) => {
  if (node.type === NodeType.Instance || node.type === NodeType.Component) {
    context = translateInstancePreview(
      node,
      document,
      node.type === NodeType.Instance ? node.componentId : node.id,
      context
    );
  } else {
    context = addBuffer(
      `<${getNodeComponentName(node, document)}${
        context.compilerOptions.includeAbsoluteLayout !== false
          ? " withAbsoluteLayout"
          : ""
      }`,
      context
    );

    context = addBuffer(`>\n`, context);
    context = translatePreviewChildren(node, document, context, inComponent);
    context = addBuffer(
      `</${getNodeComponentName(node, document)}>\n`,
      context
    );
  }
  return context;
};

const translatePreviewChildren = (
  node: Node,
  document: Document,
  context: TranslateContext,
  inComponent?: boolean
) => {
  context = startBlock(context);
  if (node.type === NodeType.Text) {
    if (inComponent) {
      context = addBuffer(
        `{${getUniqueNodeName(node, document)}_text}\n`,
        context
      );
    } else {
      context = addBuffer(
        `${translateTextCharacters(node.characters)}\n`,
        context
      );
    }
  } else if (hasChildren(node)) {
    for (const child of node.children) {
      context = translatePreview(child, document, context, inComponent);
    }
  }
  context = endBlock(context);
  return context;
};

const translateTextCharacters = (characters: string) => {
  return characters.replace(/[\n\r]+/g, " <br /> ");
};

const getComponentNestedNode = (
  nestedInstanceNode: Node,
  instance: Node,
  componentId: string,
  document: Document
) => {
  const component = getNodeById(componentId, document);
  const nodePath = getNodePath(nestedInstanceNode, instance);
  if (!component) {
    throw new Error(`Cannot find component instance: ${componentId}`);
  }
  return getNodeByPath(nodePath, component);
};

const translateInstancePreview = (
  instance: Node,
  document: Document,
  componentId: string,
  context: TranslateContext,
  includeClasses: boolean = true
) => {
  context = addBuffer(
    `<${getPreviewComponentName(componentId, document)}${
      context.compilerOptions.includeAbsoluteLayout !== false
        ? " withAbsoluteLayout"
        : ""
    }`,
    context
  );
  if (includeClasses) {
    context = addBuffer(
      ` className="${getNodeClassName(instance, document)}"`,
      context
    );
  }
  for (const textNode of getAllTextNodes(instance)) {
    const componentTextNode = getComponentNestedNode(
      textNode,
      instance,
      componentId,
      document
    );
    context = addBuffer(
      ` ${getUniqueNodeName(
        componentTextNode,
        document
      )}_text={<fragment>${translateTextCharacters(
        textNode.characters
      )}</fragment>}`,
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
  const allComponents = getAllComponents(document);
  context = translateNodeClassNames(allComponents, document, context, false);
  context = translateNodeClassNames(document.children, document, context, true);
  context = endBlock(context);
  context = addBuffer(`</style>\n\n`, context);
  return context;
};

const translateNodeClassNames = (
  nodes: Node[],
  document: Document,
  context: TranslateContext,
  skipComponents?: boolean
) => {
  for (const node of nodes) {
    context = translateClassNames(
      getNestedCSSStyles(
        node,
        document,
        node.type === NodeType.Instance ? node : null
      ),
      document,
      context,
      false,
      skipComponents,
      null
    );
  }
  return context;
};

const translateClassNames = (
  info: ComputedNestedStyleInfo,
  document: Document,
  context: TranslateContext,
  isNested: boolean,
  skipComponents: boolean,
  instance?: Instance
) => {
  if (info.node.type === NodeType.Canvas) {
    return info.children.reduce(
      (context, childInfo) =>
        translateClassNames(
          childInfo,
          document,
          context,
          false,
          skipComponents,
          null
        ),
      context
    );
  }

  if (!containsStyle(info, document)) {
    return context;
  }

  const targetNode =
    info.node.type === NodeType.Instance || !instance
      ? info.node
      : getComponentNestedNode(
          info.node,
          instance,
          instance.componentId,
          document
        );

  // components are already compiled, so skip.
  if (targetNode.type === NodeType.Component && skipComponents) {
    return context;
  }

  const nodeSelector = `.${getNodeClassName(targetNode, document)}`;

  if (isNested) {
    context = addBuffer(`& :global(${nodeSelector}) {\n`, context);
  } else {
    context = addBuffer(`:global(${nodeSelector}) {\n`, context);
  }

  context = startBlock(context);

  // TODO - for component instances, filter out props that match
  // component props

  // TODO - get CSS props ins
  let hasLayoutDeclaration = false;
  for (const key in info.style) {
    if (isLayoutDeclaration(key)) {
      hasLayoutDeclaration = true;
      continue;
    }
    context = addBuffer(`${key}: ${info.style[key]};\n`, context);
  }

  // ABS layout should be opt-in since it's non-responsive.
  if (
    hasLayoutDeclaration &&
    context.compilerOptions.includeAbsoluteLayout !== false
  ) {
    context = addBuffer(`&[data-with-absolute-layout] {\n`, context);
    context = startBlock(context);
    for (const key in info.style) {
      if (isLayoutDeclaration(key)) {
        context = addBuffer(`${key}: ${info.style[key]};\n`, context);
      }
    }
    context = endBlock(context);
    context = addBuffer(`}\n`, context);
  }

  context = info.children.reduce((context, child) => {
    if (child.node.type === NodeType.Component && skipComponents) {
      return context;
    }
    return translateClassNames(
      child,
      document,
      context,
      true,
      skipComponents,
      info.node.type == NodeType.Instance ? info.node : null
    );
  }, context);
  context = endBlock(context);
  context = addBuffer(`}\n`, context);
  if (!isNested) {
    context = addBuffer(`\n`, context);
  }
  return context;
};

const isLayoutDeclaration = (key: string) =>
  /position|left|top|width|height/.test(key);

// TODO - need to use compoennt name
const getNodeClassName = (node: Node, document: Document) => {
  const nodeName = getUniqueNodeName(node, document);

  // We need to maintain node ID in class name since we're using the :global selector (which ensures that style overrides work properly).
  // ID here ensures that we're not accidentially overriding styles in other components or files.
  // ID is also prefixed here since that's the pattern used _internally_ for hash IDs.
  return `_${camelCase(node.id)}_` + nodeName;
};

// TODO - need to use compoennt name
const getNodeComponentName = (node: Node, document: Document) => {
  let nodeName = getUniqueNodeName(node, document);
  nodeName = nodeName.charAt(0).toUpperCase() + nodeName.substr(1);

  // dirty check for class prefix
  if (nodeName.indexOf("_") !== -1) {
    const [parentName, compName] = nodeName.split("_");
    nodeName = parentName + "_" + pascalCase(compName);
  }

  return nodeName;
};

export type ComputedNestedStyleInfo = {
  node: Node;
  style: Record<string, string | number>;
  children: ComputedNestedStyleInfo[];
};

const getNestedCSSStyles = (
  node: Node,
  document: Document,
  instance?: Instance
): ComputedNestedStyleInfo => {
  const nodeStyle = getCSSStyle(node, document, instance);
  return {
    node,
    style: nodeStyle,
    children: hasChildren(node)
      ? node.children.map((child) => {
          return getNestedCSSStyles(
            child,
            document,
            node.type == NodeType.Instance ? node : instance
          );
        })
      : [],
  };
};

const getStyleOverrides = (style: any, overrides: any): any => {
  const newStyle = {};
  for (const key in style) {
    if (!overrides[key]) {
      newStyle[key] = "unset";
    }
  }

  for (const key in overrides) {
    if (overrides[key] !== style[key]) {
      newStyle[key] = overrides[key];
    }
  }
  return newStyle;
};

const containsStyle = (
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
};

const getCSSStyle = (node: Node, document: Document, instance?: Instance) => {
  let style: Record<string, string | number> = {};

  if (hasVectorProps(node)) {
    Object.assign(style, getVectorStyle(node));
  }

  if (node.type === NodeType.Rectangle) {
    if (node.cornerRadius) {
      style["border-radius"] = node.cornerRadius + "px";
    }
  }

  if (node.type === NodeType.Text) {
    Object.assign(style, getPositionStyle(node));
    Object.assign(style, getTextStyle(node));

    const containsNonSolifFill = node.fills.some(
      (fill) => fill.type !== FillType.SOLID
    );

    if (containsNonSolifFill) {
      logNodeWarning(node, `cannot translate non-solid text color to CSS`);
    }

    // text color must be solid, so search for one
    const solidFill = node.fills.find(
      (fill) => fill.type === FillType.SOLID
    ) as SolidFill;
    if (solidFill) {
      style.color = getCSSRGBAColor(solidFill.color);
    }
  } else if (
    node.type === NodeType.Ellipse ||
    node.type === NodeType.REGULAR_POLYGON ||
    node.type === NodeType.Star ||
    node.type === NodeType.Vector
  ) {
    Object.assign(style, getPositionStyle(node));
    if (!node.exportSettings) {
      logNodeWarning(node, `should be exported since it's a polygon`);
    }
  } else if (node.type === NodeType.Frame) {
    Object.assign(style, getPositionStyle(node));
    Object.assign(style, getFrameStyle(node));
  } else {
    // logNodeWarning(node, `Can't generate styles for ${node.type}`);
  }

  if (instance && node.type !== NodeType.Instance) {
    const targetNode = getComponentNestedNode(
      node,
      instance,
      instance.componentId,
      document
    );
    const targetNodeStyle = getCSSStyle(targetNode, document);
    style = getStyleOverrides(targetNodeStyle, style);
  }

  return style;
};

const getVectorStyle = (node: VectorNodeProps & BaseNode<any>) => {
  const style: any = {};
  if (node.absoluteBoundingBox) {
    Object.assign(style, getPositionStyle(node));
  }
  if (node.fills.length) {
    const value = getFillStyleValue(node, node.fills);
    if (value) {
      style.background = value;
      const containsBlendModes = node.fills.some((fill) => {
        return fill.blendMode !== "NORMAL";
      });

      if (containsBlendModes) {
        style["background-blend-mode"] = node.fills
          .map((fill) => {
            return BLEND_MODE_MAP[fill.blendMode];
          })
          .join(", ");
      }
    }
  }
  if (node.blendMode && BLEND_MODE_MAP[node.blendMode]) {
    style["mix-blend-mode"] = BLEND_MODE_MAP[node.blendMode];
  }
  if (node.strokes.length) {
    const containsInvalidStroke =
      node.strokes.some((stroke) => {
        return stroke.type !== FillType.SOLID;
      }) || node.strokes.length > 1;

    const solidStroke = node.strokes.find(
      (stroke) => stroke.type === FillType.SOLID
    ) as SolidFill;

    if (containsInvalidStroke) {
      logNodeWarning(node, `Only one solid fill stroke is suppoered`);
    }

    if (solidStroke) {
      style.border = `${node.strokeWeight}px solid ${getCSSRGBAColor(
        solidStroke.color
      )}`;
    }
  }

  if (node.effects.length) {
    Object.assign(style, getEffectsStyle(node, node.effects));
  }

  if (node.opacity != null) {
    style.opacity = node.opacity;
  }

  return style;
};

const getEffectsStyle = (node: Node, effects: Effect[]) => {
  const newStyle = {};
  const visibleEffects = effects.filter((effect) => effect.visible !== false);
  const dropShadows = visibleEffects.filter(
    (effect) => effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW"
  );

  if (dropShadows.length) {
    newStyle["box-shadow"] = dropShadows
      .map(({ type, offset, radius, color }) => {
        return `${type === "INNER_SHADOW" ? "inset" : ""} ${offset.x}px ${
          offset.y
        }px ${radius}px ${getCSSRGBAColor(color)}`;
      })
      .join(", ");
  }

  const layerBlur = visibleEffects.find(
    (effect) => effect.type === "LAYER_BLUR"
  );

  if (layerBlur) {
    newStyle["filter"] = `blur(${layerBlur.radius}px)`;
  }

  const backgroundBlur = visibleEffects.find(
    (effect) => effect.type === "BACKGROUND_BLUR"
  );

  if (layerBlur) {
    logNodeWarning(
      node,
      `Contains background blur which has minimal CSS support`
    );
    newStyle["backdrop-filter"] = `blur(${backgroundBlur.radius}px)`;
  }

  return newStyle;
};

const getFrameStyle = (node: FrameProps & BaseNode<any>) => {
  const style: any = {};
  Object.assign(style, getVectorStyle(node));
  if (node.clipsContent) {
    style.overflow = "hidden";
  }
  return style;
};

const getPositionStyle = ({
  relativeTransform,
  size,
}: Pick<VectorNodeProps, "relativeTransform" | "size">) => ({
  position: "absolute",
  left: Math.round(relativeTransform[0][2]) + "px",
  top: Math.round(relativeTransform[1][2]) + "px",
  width: Math.round(size.x) + "px",
  height: Math.round(size.y) + "px",
});

const getFillStyleValue = (node: Node, fills: Fill[]) =>
  fills
    .reverse()
    .filter((fill) => fill.visible !== false)
    .map((fill, index) => {
      switch (fill.type) {
        case FillType.SOLID: {
          return getCSSRGBAColor(fill.color, index === fills.length - 1);
        }
        case FillType.GRADIENT_LINEAR: {
          return getCSSLinearGradient(fill);
        }
        case FillType.GRADIENT_RADIAL: {
          return getCSSRadialGradient(fill);
        }
        case FillType.IMAGE: {
          return getCSSImageBackground(fill);
        }
        default: {
          // TODO - all gradient fills should work
          logNodeWarning(node, `Cannot translate ${fill.type} fill to CSS`);
          return null;
        }
      }
    })
    .filter(Boolean)
    .join(", ");

const getCSSRGBAColor = ({ r, g, b, a }: Color, last: boolean = true) => {
  const r2 = Math.round(r * 255);
  const g2 = Math.round(g * 255);
  const b2 = Math.round(b * 255);

  // TODO - generate hash
  let color;
  if (a !== 1) {
    color = `rgba(${r2}, ${g2}, ${b2}, ${a})`;
  } else {
    color = rgbToHex(r2, g2, b2);
  }

  return last ? color : `linear-gradient(0deg, ${color}, ${color})`;
};

const STYLE_MAP = {
  fontFamily: "font-family",
  fontWeight: "font-weight",
  fontSize: "font-size",
  letterSpacing: "letter-spacing",
};

const BLEND_MODE_MAP = {
  NORMAL: "normal",
  DARKEN: "darken",
  MULTIPLY: "multiply",
  COLOR_BURN: "color-burn",
  LIGHTEN: "lighten",
  SCREEN: "screen",
  COLOR_DODGE: "color-dodge",
  OVERLAY: "overlay",
  SOFT_LIGHT: "soft-light",
  HARD_LIGHT: "hard-light",
  DIFFERENCE: "difference",
  EXCLUSION: "exclusion",
  HUE: "hue",
  LUMINOSITY: "luminosity",
  SATURATION: "saturation",
  COLOR: "color",
};

const TEXT_DECORATION_MAP = {
  STRIKETHROUGH: "line-through",
  UNDERLINE: "underline",
};

const TEXT_TRANSFORM_MAP = {
  UPPER: "uppercase",
  LOWER: "lowercase",
  TITLE: "capitalize",
};

const LETTER_CASE_LABEL_MAP = {};

const TEXT_ALIGN_VERTICAL_MAP = {
  BOTTOM: "flex-end",
  CENTER: "center",
};

const getTextStyle = (node: Text) => {
  const style = node.style;
  const newStyle: any = {};

  if (style.textAlignVertical !== "TOP") {
    newStyle.display = "flex";
    newStyle["align-items"] = TEXT_ALIGN_VERTICAL_MAP[style.textAlignVertical];
  }

  if (style.fontFamily) {
    newStyle["font-family"] = style.fontFamily;
  }
  if (style.fontWeight) {
    newStyle["font-weight"] = style.fontWeight;
  }
  if (style.fontSize) {
    newStyle["font-size"] = style.fontSize + "px";
  }
  if (style.letterSpacing) {
    newStyle["letter-spacing"] =
      (Number(style.letterSpacing) / Number(style.fontSize)).toFixed(3) + "em";
  }

  if (style.lineHeightPercentFontSize) {
    newStyle["line-height"] =
      Math.round(Number(style.lineHeightPercentFontSize)) + "%";
  }

  if (style.textAlignHorizontal) {
    newStyle["text-align"] = String(style.textAlignHorizontal).toLowerCase();
  }

  if (style.textDecoration) {
    newStyle["text-decoration"] = TEXT_DECORATION_MAP[
      style.textDecoration
    ].toLowerCase();
  }

  if (style.paragraphIndent) {
    newStyle["text-indent"] =
      Number(Number(style.paragraphIndent).toFixed(2)) + "px";
  }

  if (style.textCase) {
    const transform = TEXT_TRANSFORM_MAP[style.textCase];
    if (transform) {
      newStyle["text-transform"] = transform;
    } else {
      logCannotConvertCssWarning(node, [
        "Text",
        "Letter Case",
        "Case",
        LETTER_CASE_LABEL_MAP[style.textCase] || style.textCase,
      ]);
    }
  }

  if (style.opentypeFlags) {
    const fontFeatureSettings = Object.keys(style.opentypeFlags).map(
      (key) => `"${key.toLowerCase()}" on`
    );
    newStyle["font-featutes-settings"] = fontFeatureSettings.join(", ");
  }

  if (style.paragraphSpacing) {
    logCannotConvertCssWarning(node, ["Text", "Paragraph Spacing"]);
  }

  return newStyle;
};

const getCSSLinearGradient = ({
  gradientHandlePositions,
  gradientStops,
}: LinearGradient) => {
  // TODO: https://github.com/crcn/figmark/issues/12
  const radians = calcGradiantHandleRadians(gradientHandlePositions);
  return `linear-gradient(${radians}rad, ${gradientStops
    .map((stop) => {
      return `${getCSSRGBAColor(stop.color)} ${stop.position * 100}%`;
    })
    .join(", ")})`;
};

const getCSSRadialGradient = ({ gradientStops }: RadialGradient) => {
  // TODO: https://github.com/crcn/figmark/issues/13
  return `radial-gradient(${gradientStops
    .map((stop) => {
      return `${getCSSRGBAColor(stop.color)} ${stop.position * 100}%`;
    })
    .join(", ")})`;
};

const getCSSImageBackground = ({ imageRef }: ImageFill) => {
  // TODO: https://github.com/crcn/figmark/issues/13
  // TODO - need to get actual extension info.
  return `url("./${imageRef}.png")`;
};

const calcGradiantHandleRadians = ([first, second]: Vector[]) => {
  const ydiff = second.y - first.y;
  const xdiff = first.x - second.x;
  const radians = Math.atan2(-xdiff, -ydiff);
  return Number(radians.toFixed(3));
};
const calcGradent = (start: Vector, end: Vector) => {
  return ((end.y - start.y) / (end.x - start.x)) * -1;
};
const radToDeg = (radian: number) => radian * (180 / Math.PI);

const rgbToHex = (r: number, g: number, b: number) => {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};
const logNodeWarning = (node: Node, message: string) => {
  logWarn(`Layer ${chalk.bold(node.name)}: ${message}`);
};

const highlightSectionInfo = (...path: string[]) =>
  chalk.bold(path.join(" ► "));
const logCannotConvertCssWarning = (node: Node, path: string[]) =>
  logNodeWarning(
    node,
    `Cannot convert ${highlightSectionInfo(...path)} to CSS`
  );
