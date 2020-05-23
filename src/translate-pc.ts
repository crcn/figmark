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
  DependencyMap,
  getOwnerInstance,
  isVectorLike,
  getAllComponents,
  getNodeAncestors,
  filterTreeNodeParents,
  Parent,
  getOriginalNode,
  getChildParentMap,
} from "./state";
import { pascalCase, logWarn, logError } from "./utils";
import * as chalk from "chalk";
import * as path from "path";
import { camelCase, pick, omit } from "lodash";
import { PaintType } from "figma-api";
import { DEFAULT_EXPORT_SETTINGS, EMPTY_ARRAY } from "./constants";
import { memoize } from "./memo";

export const translateFigmaProjectToPaperclip = (
  file,
  filePath: string,
  compilerOptions: CompilerOptions,
  importedDependencyMap: DependencyMap
) => {
  let context = createTranslateContext(
    file.document,
    filePath,
    compilerOptions,
    importedDependencyMap
  );

  context = addBuffer(`\n<!--\n`, context);
  context = startBlock(context);
  context = addBuffer(`!! AUTO GENERATED, EDIT WITH CAUTION !!\n`, context);
  context = endBlock(context);
  context = addBuffer(`-->\n\n`, context);

  context = translateImports(context);

  context = addBuffer(`<!-- STYLES -->\n\n`, context);
  context = translateStyles(file.document, context);

  context = addBuffer(`<!-- ALL LAYERS & COMPONENTS -->\n\n`, context);
  context = translateComponents(context);

  if (compilerOptions.includePreviews !== false) {
    context = addBuffer(`<!-- PREVIEWS -->\n\n`, context);
    context = translatePreviews(file.document, context);
  }
  return context.buffer;
};

const translateImports = (context: TranslateContext) => {
  const importFilePaths = getImportFilePaths(context);
  for (let i = 0, { length } = importFilePaths; i < length; i++) {
    const filePath = importFilePaths[i];
    let relativePath = path.relative(path.dirname(context.filePath), filePath);

    if (relativePath.charAt(0) !== ".") {
      relativePath = "./" + relativePath;
    }
    context = addBuffer(
      `<import as="module${i}" src="${relativePath}" />\n`,
      context
    );
  }

  context = addBuffer(`\n`, context);

  return context;
};

const getImportFilePaths = (context: TranslateContext) => {
  return Object.keys(context.importedDependencyMap);
};

const getNodeDocument = (
  id: string,
  document: Document,
  importedDependencyMap: DependencyMap
): Document => {
  const dep =
    importedDependencyMap[getNodeDocumentFilePath(id, importedDependencyMap)];
  return dep ? dep.document : document;
};

const getNode = (
  id: string,
  document: Document,
  importedDependencyMap: DependencyMap
): Component => {
  return getNodeById(
    // TODO - will need to replace component alias
    id,
    getNodeDocument(id, document, importedDependencyMap)
  ) as Component;
};

// const getInstanceSourceNode = (
//   node: Node,
//   instanceId: string,
//   document: Document,
//   importedDependencyMap: DependencyMap
// ): Node => {
//   const instance = getNodeById(instanceId, document) as Instance;
//   const nodePath = getNodePath(node, instance);
//   const component = getComponentById(instance.componentId, document, importedDependencyMap);
//   return getNodeByPath(nodePath, component);
// };

const getComponentById = (
  componentId: string,
  document: Document,
  importedDependencyMap: DependencyMap
): Component => {
  const documentFilePath = getNodeDocumentFilePath(
    componentId,
    importedDependencyMap
  );
  return getNodeById(
    documentFilePath
      ? importedDependencyMap[documentFilePath].idAliases[componentId] ||
          componentId
      : componentId,
    getNodeDocument(componentId, document, importedDependencyMap)
  ) as Component;
};

const extractParentComponentId = (id: string) =>
  id.charAt(0) === "I" ? id.substr(1, id.indexOf(";")) : id;

const getSourceNodeId = (
  id: string,
  document: Document,
  importedDependencyMap: DependencyMap
) => {
  // const sourceId = id.split(";").map(part => {

  //   const partId = part.replace("I", "");

  //   console.log("PT", partId);

  //   for (const path in importedDependencyMap) {
  //     const dep = importedDependencyMap[path];
  //     console.log(dep.idAliases);
  //     const aliasId = dep.idAliases[partId];
  //     if (aliasId) {
  //       console.log("AL", aliasId);
  //       return part.replace(partId, aliasId);
  //     }
  //   }

  //   return part;
  // });

  // console.log(id, sourceId);
  return id;
  // const parentComponentAliasId = extractParentComponentId(id);
  // const dep = getImportedDependency(parentComponentAliasId, importedDependencyMap);
  // const componentId = dep ? dep.idAliases[parentComponentAliasId] : id;
  // return
};

const isImportedComponent = (
  id: string,
  document: Document,
  importedDependencyMap: DependencyMap
) => {
  return getNodeDocument(id, document, importedDependencyMap) !== document;
};

const getImportedDependency = (
  id: string,
  importedDependencyMap: DependencyMap
) => {
  return importedDependencyMap[
    getNodeDocumentFilePath(id, importedDependencyMap)
  ];
};

const getNodeDocumentFilePath = memoize(
  (id: string, importedDependencyMap: DependencyMap): string => {
    const componentId = extractParentComponentId(id);
    for (const filePath in importedDependencyMap) {
      const dep = importedDependencyMap[filePath];
      const idAlias = dep.idAliases[componentId];
      if (getNodeById(idAlias, dep.document) || getNodeById(id, dep.document))
        return filePath;
    }
    return null;
  }
);

const getImportedComponentModuleName = (
  id: string,
  context: TranslateContext
) => {
  return `module${getImportFilePaths(context).indexOf(
    getNodeDocumentFilePath(id, context.importedDependencyMap)
  )}`;
};

const translateComponents = (context: TranslateContext) => {
  const allComponents = getAllComponents(context.document);
  for (const component of allComponents) {
    context = translateComponent(component, context);
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

  const document = context.document;

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
        node.id,
        context
      )} {className?}">\n\n`,
      context
    );

    return context;
  }

  if (isVectorLike(node)) {
    context = addBuffer(
      `<div export component as="${componentName}" ${withAbsoluteLayoutAttr} className="${getNodeClassName(
        node.id,
        context
      )} {className?}" width="${node.size.x}" height="${node.size.y}">\n`,
      context
    );
    context = startBlock(context);
    context = endBlock(context);
    context = addBuffer(`</div>\n\n`, context);
  } else {
    const tagName = node.type === NodeType.Text ? `span` : `div`;

    context = addBuffer(
      `<${tagName} export component as="${componentName}" ${withAbsoluteLayoutAttr} className="${getNodeClassName(
        node.id,
        context
      )} {className?}">\n`,
      context
    );
    context = startBlock(context);
    context = addBuffer(`{children}\n`, context);
    context = endBlock(context);
    context = addBuffer(`</${tagName}>\n\n`, context);
  }

  if (hasChildren(node)) {
    for (const child of node.children) {
      context = translateComponent(child, context);
    }
  }
  return context;
};

const translatePreviews = (document: Document, context: TranslateContext) => {
  const canvas = document.children[0];

  if (!hasChildren(canvas)) {
    return context;
  }

  const allComponents = getAllComponents(document);

  for (const component of allComponents) {
    context = translateComponentPreview(component, document, context);
    context = translatePreview(component, document, context);
    context = addBuffer(`\n`, context);
  }

  // Don't want to translate canvas children because of the explosion
  // of nodes.
  // for (const child of canvas.children) {
  //   context = translatePreview(child, document, context);

  //   // some space between previews
  //   context = addBuffer(`\n`, context);
  // }

  return context;
};

const getPreviewComponentName = (nodeId: string, context: TranslateContext) => {
  // note we fetch component since nodeId & id might not match up (nodeId may be imported)
  const component = getComponentById(
    nodeId,
    context.document,
    context.importedDependencyMap
  );
  let name =
    "_Preview_" +
    pascalCase(component.name + "_" + cleanupNodeId(component.id));

  if (
    isImportedComponent(nodeId, context.document, context.importedDependencyMap)
  ) {
    name = getImportedComponentModuleName(nodeId, context) + ":" + name;
  }

  return name;
};

const translateComponentPreview = (
  node: Component,
  document: Document,
  context: TranslateContext
) => {
  // Note that previews are exported so that they can be used in other component files.
  context = addBuffer(
    `<${getNodeComponentName(
      node,
      document
    )} export component as="${getPreviewComponentName(node.id, context)}"${
      context.compilerOptions.includeAbsoluteLayout !== false
        ? " {withAbsoluteLayout}"
        : ""
    } {className}`,
    context
  );

  context = addBuffer(`>\n`, context);
  context = translatePreviewChildren(node, document, context, true);
  context = addBuffer(
    `</${getNodeComponentName(node, document)}>\n\n`,
    context
  );

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
      context,
      inComponent
    );
  } else {
    context = addBuffer(
      `<${getNodeComponentName(node, document)}${
        context.compilerOptions.includeAbsoluteLayout !== false
          ? inComponent
            ? " {withAbsoluteLayout}"
            : " withAbsoluteLayout"
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

const getInstanceSourceNode = (
  descendent: Node,
  instance: Node,
  componentId: string,
  context: TranslateContext
) => {
  const component = getComponentById(
    componentId,
    context.document,
    context.importedDependencyMap
  );
  // console.log(nestedInstanceNode, instance);
  // const pcmap = getChildParentMap(instance);
  // console.log(pcmap[nestedInstanceNode.id], nestedInstanceNode.id, instance.id);

  // if (!pcmap[nestedInstanceNode.id]) {
  //   console.log(JSON.stringify(instance, null, 2));
  // }
  const nodePath = getNodePath(descendent, instance);
  if (!component) {
    throw new Error(`Cannot find component: ${componentId}`);
  }
  return getNodeByPath(nodePath, component);
};

const getPrevNode = memoize(
  (
    nodeId: string,
    document: Document,
    importedDependencyMap: DependencyMap
  ) => {
    if (nodeId.charAt(0) !== "I") {
      return null;
    }
    const nodeDocument = getNodeDocument(
      nodeId,
      document,
      importedDependencyMap
    );
    const node = getNodeById(nodeId, nodeDocument);
    const instance = getNodeInstance(nodeId, document, importedDependencyMap);
    const nodePath = getNodePath(node, instance);

    const component = getComponentById(
      instance.componentId,
      document,
      importedDependencyMap
    );

    return getNodeByPath(nodePath, component);
  }
);

const getPrevNodes = memoize(
  (
    nodeId: string,
    document: Document,
    importedDependencyMap: DependencyMap
  ) => {
    const prevNodeInstances = [];
    const nodeDocument = getNodeDocument(
      nodeId,
      document,
      importedDependencyMap
    );
    let currNode = getNodeById(nodeId, nodeDocument);
    while (1) {
      currNode = getPrevNode(currNode.id, document, importedDependencyMap);
      if (!currNode) {
        break;
      }
      prevNodeInstances.push(currNode);
    }
    return prevNodeInstances;
  }
);

const getNodeInstance = (
  nodeId: string,
  document: Document,
  importedDependencyMap: DependencyMap
) => {
  const nodeDocument = getNodeDocument(nodeId, document, importedDependencyMap);
  const instanceId = nodeId.substr(1, nodeId.indexOf(";") - 1);
  return getNodeById(instanceId, nodeDocument) as Instance;
};

const translateInstancePreview = (
  instance: Node,
  document: Document,
  componentId: string,
  context: TranslateContext,
  inComponent: boolean
) => {
  context = addBuffer(
    `<${getPreviewComponentName(componentId, context)}${
      context.compilerOptions.includeAbsoluteLayout !== false
        ? inComponent
          ? " {withAbsoluteLayout}"
          : " withAbsoluteLayout"
        : ""
    }`,
    context
  );

  // class already exists on class, so skip className
  if (instance.type === NodeType.Component) {
    context = addBuffer(
      ` className="_Preview_${getUniqueNodeName(instance, context.document)}"`,
      context
    );
  } else {
    context = addBuffer(
      ` className="${getNodeClassName(instance.id, context)}"`,
      context
    );
  }
  for (const textNode of getAllTextNodes(instance)) {
    const componentTextNode = getInstanceSourceNode(
      textNode,
      instance,
      componentId,
      context
    );

    const componentTextNodeName = getUniqueNodeName(
      componentTextNode,
      getNodeDocument(
        componentTextNode.id,
        context.document,
        context.importedDependencyMap
      )
    );

    if (inComponent) {
      // If in component, we want to pass text coming in from parent. Need to reference _instance_ of nested
      // text node this time since there may be other instances within component.
      context = addBuffer(
        ` ${componentTextNodeName}_text={${getUniqueNodeName(
          textNode,
          document
        )}_text}`,
        context
      );
    } else {
      context = addBuffer(
        ` ${componentTextNodeName}_text={<fragment>${translateTextCharacters(
          textNode.characters
        )}</fragment>}`,
        context
      );
    }
  }
  context = addBuffer(` />\n`, context);
  return context;
};

const LAYOUT_STYLE_PROP_NAMES = ["left", "top", "width", "height"];

const splitLayoutStyle = (style: any) => [
  pick(style, LAYOUT_STYLE_PROP_NAMES),
  omit(style, LAYOUT_STYLE_PROP_NAMES),
];

const translateStyles = (document: Document, context: TranslateContext) => {
  context = addBuffer(`<style>\n`, context);
  context = startBlock(context);
  const computedStyles = computeComponentStyles(context);

  for (const nodeId in computedStyles) {
    const style = computedStyles[nodeId];
    const [layoutStyle, appearanceStyle] = splitLayoutStyle(style);

    const hasLayoutStyle = Object.keys(layoutStyle).length > 0;

    if (
      Object.keys(appearanceStyle).length === 0 &&
      !(context.compilerOptions.includeAbsoluteLayout && hasLayoutStyle)
    ) {
      continue;
    }

    const node = getNodeById(
      nodeId,
      getNodeDocument(nodeId, context.document, context.importedDependencyMap)
    );

    const nodes = [
      node,
      ...getPrevNodes(nodeId, context.document, context.importedDependencyMap),
    ];

    const classNamePath = nodes.map((node) => {
      const component = getOwnerComponent(
        node,
        getNodeDocument(
          node.id,
          context.document,
          context.importedDependencyMap
        )
      );
      // const instance = getNodeInstance(node.id, context.document, context.importedDependencyMap);
      // const
      // const component = instance
      return "." + getNodeClassName(component.id, context);
    });

    const nodeClasName =
      "." + getNodeClassName(nodes[nodes.length - 1].id, context);

    const selector = `${classNamePath.join(
      ""
    )} ${nodeClasName}, ${classNamePath.join(" ")} ${nodeClasName}`.trim();

    context = addBuffer(`:global(${selector}) {\n`, context);
    context = startBlock(context);

    for (const key in appearanceStyle) {
      context = addBuffer(`${key}: ${appearanceStyle[key]};\n`, context);
    }

    if (context.compilerOptions.includeAbsoluteLayout && hasLayoutStyle) {
      context = addBuffer(`&[data-with-absolute-layout] {\n`, context);
      context = startBlock(context);
      for (const key in layoutStyle) {
        context = addBuffer(`${key}: ${layoutStyle[key]};\n`, context);
      }
      context = endBlock(context);
      context = addBuffer(`}\n`, context);
    }

    context = endBlock(context);
    context = addBuffer("}\n\n", context);
  }
  const allComponents = getAllComponents(document);
  // context = translateNodeClassNames(allComponents, document, context, false);
  context = translatePreviewClassNames(allComponents, context);

  // Keep for reference. Don't want to translate all document children
  // because this will cause an explosion of nodes. Only want to compile components since
  // that's the only thing manageable
  // context = translateNodeClassNames(document.children, document, context, true);
  context = endBlock(context);
  context = addBuffer(`</style>\n\n`, context);
  return context;
};

const computeComponentStyles = (context: TranslateContext) => {
  const computed = {};

  const components = getAllComponents(context.document);

  for (const component of components) {
    Object.assign(computed, computeNodeStyles(component, context));
  }
  return computed;
};

const computeNodeStyles = (node: Node, context: TranslateContext) => {
  const computedStyle = getCSSStyle(node, context);
  let style = computedStyle;

  // instance present?
  if (node.id.charAt(0) === "I") {
    const prevNodes = getPrevNodes(
      node.id,
      context.document,
      context.importedDependencyMap
    );

    for (const currNode of prevNodes) {
      const currNodeStyle = getCSSStyle(currNode, context);

      const updatedStyle = {};

      for (const key in currNodeStyle) {
        // no change from previous style, so skip since style is already applied
        if (style[key] === currNodeStyle[key]) {
          continue;
        }

        // Figma computes all styles on current instance, so if it doesn't exist, then
        // it's unset, so define that
        if (!computedStyle[key]) {
          updatedStyle[key] = "unset";
        }
      }

      for (const key in style) {
        // if current style is different than previous style, then keep it.
        if (style[key] !== currNodeStyle[key]) {
          updatedStyle[key] = style[key];
        }
      }

      style = updatedStyle;
    }
  }

  const styles = {
    [node.id]: style,
  };

  if (hasChildren(node)) {
    for (const child of node.children) {
      Object.assign(styles, computeNodeStyles(child, context));
    }
  }

  return styles;
};

const translatePreviewClassNames = (
  allComponents: Component[],
  context: TranslateContext
) => {
  if (!context.compilerOptions.includePreviews) {
    return context;
  }

  const PADDING = 10;
  let ctop = PADDING;

  for (const component of allComponents) {
    const { x, y, width, height } = component.absoluteBoundingBox;
    context = addBuffer(
      `:global(._Preview_${getUniqueNodeName(
        component,
        context.document
      )}) {\n`,
      context
    );
    context = startBlock(context);
    context = addBuffer(`position: absolute;\n`, context);
    context = addBuffer(`left: ${PADDING}px;\n`, context);
    context = addBuffer(`top: ${ctop}px;\n`, context);
    context = addBuffer(`width: ${width}px;\n`, context);
    context = addBuffer(`height: ${height}px;\n`, context);
    context = endBlock(context);
    context = addBuffer("}\n\n", context);
    ctop += height + PADDING;
  }
  return context;
};

const isLayoutDeclaration = (key: string) =>
  /position|left|top|width|height/.test(key);

// TODO - need to use compoennt name
const getNodeClassName = (nodeId: string, context: TranslateContext) => {
  const node = getNode(nodeId, context.document, context.importedDependencyMap);

  // return "_" + nodeId.split(";").pop().replace("I", "").replace(":", "_");

  // const node = getSourceNode(
  //   nodeId,
  //   context.document,
  //   context.importedDependencyMap
  // );

  // const nodeName = getUniqueNodeName(
  //   node,
  //   getNodeDocument(
  //     nodeId,
  //     context.document,
  //     context.importedDependencyMap
  //   )
  // );

  // We need to maintain node ID in class name since we're using the :global selector (which ensures that style overrides work properly).
  // ID here ensures that we're not accidentially overriding styles in other components or files.
  // ID is also prefixed here since that's the pattern used _internally_ for hash IDs.
  return (
    `_${camelCase(nodeId)}_` +
    getUniqueNodeName(
      node,
      getNodeDocument(nodeId, context.document, context.importedDependencyMap)
    )
  );
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
  context: TranslateContext,
  instance?: Instance
): ComputedNestedStyleInfo => {
  const nodeStyle = getCSSStyle(node, context, instance);
  return {
    node,
    style: nodeStyle,
    children: hasChildren(node)
      ? node.children.map((child) => {
          return getNestedCSSStyles(
            child,
            context,
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

const getCSSStyle = (
  node: Node,
  context: TranslateContext,
  instance?: Instance
) => {
  let style: Record<string, string | number> = {};

  if (isVectorLike(node)) {
    style.background = `url(./${getNodeExportFileName(
      node,
      context.document,
      DEFAULT_EXPORT_SETTINGS
    )})`;
    Object.assign(style, getPositionStyle(node, context));
    return style;
  }

  if (hasVectorProps(node)) {
    Object.assign(style, getVectorStyle(node, context));
  }

  if (node.type === NodeType.Rectangle) {
    if (node.cornerRadius) {
      style["border-radius"] = node.cornerRadius + "px";
    }
  }

  if (node.type === NodeType.Text) {
    Object.assign(style, getPositionStyle(node, context));
    Object.assign(style, getTextStyle(node));

    const containsNonSolifFill = node.fills.some(
      (fill) => fill.type !== FillType.SOLID
    );

    if (containsNonSolifFill) {
      // can be noisy, so ignore for now
      // logNodeWarning(node, `cannot translate non-solid text color to CSS`);
    }

    // text color must be solid, so search for one
    const solidFill = node.fills.find(
      (fill) => fill.type === FillType.SOLID
    ) as SolidFill;
    if (solidFill) {
      style.color = getCSSRGBAColor(solidFill.color);
    }
  } else if (node.type === NodeType.Frame) {
    Object.assign(style, getPositionStyle(node, context));
    Object.assign(style, getFrameStyle(node, context));
  } else {
    // logNodeWarning(node, `Can't generate styles for ${node.type}`);
  }

  // if (instance && node.type !== NodeType.Instance) {
  //   const targetNode = getInstanceSourceNode(
  //     node,
  //     instance,
  //     instance.componentId,
  //     context
  //   );
  //   // const nodeInstances = [node, ...getPrevSourceNodeInstances(node, context)];

  //   // const sstyle = nodeInstances.reduce((style, instance) => {

  //   // });

  //   const targetNodeStyle = getCSSStyle(targetNode, context);
  //   style = getStyleOverrides(targetNodeStyle, style);
  // }

  return style;
};

/**
 *
 */

// const getPrevSourceNodeInstance = (node: Node, context: TranslateContext) => {

//   const ancestors = getNodeAncestors(node, context.document);

//   const nodePath = [(ancestors[0] as Parent).children.indexOf(node)];
//   for (let i = 0, {length} = ancestors; i < length; i++) {

//     const ancestor = ancestors[i];
//     if (ancestor.type === NodeType.Instance) {
//       const ancestorComponent = getSourceNode(ancestor.componentId, context);

//       // In Figma you can delete components & maintain instances. If we find that
//       // case, the short circuit -- we don't want to deal with that situation.
//       if (!ancestorComponent) {
//         logNodeWarning(ancestor, "Found instance that doesn't belong to component");
//         break;
//       }

//       return getNodeByPath(nodePath, ancestorComponent);
//     } else if (ancestor.type === NodeType.Component) {
//       break;
//     }
//     nodePath.unshift(i);
//   }

//   return null;
// };

const getVectorStyle = (
  node: VectorNodeProps & BaseNode<any>,
  context: TranslateContext
) => {
  const style: any = {};
  if (node.absoluteBoundingBox) {
    Object.assign(style, getPositionStyle(node, context));
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
      logNodeWarning(node, `Only one solid fill stroke is supported`);
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

const getFrameStyle = (
  node: FrameProps & BaseNode<any>,
  context: TranslateContext
) => {
  const style: any = {};
  Object.assign(style, getVectorStyle(node, context));
  if (node.clipsContent) {
    style.overflow = "hidden";
  }
  return style;
};

const getPositionStyle = (
  {
    absoluteBoundingBox,
    relativeTransform,
    size,
  }: Pick<
    VectorNodeProps,
    "relativeTransform" | "size" | "absoluteBoundingBox"
  >,
  context: TranslateContext
) => {
  if (context.compilerOptions.includeAbsoluteLayout === false) {
    return {};
  }

  // relativeTransform may not be present, so we use absoluteBoundingBox as a
  // fallback.
  const { left, top, width, height } = relativeTransform
    ? {
        left: relativeTransform[0][2],
        top: relativeTransform[1][2],
        width: size.x,
        height: size.y,
      }
    : {
        left: absoluteBoundingBox.x,
        top: absoluteBoundingBox.y,
        width: absoluteBoundingBox.width,
        height: absoluteBoundingBox.height,
      };

  return {
    position: "absolute",
    left: Math.round(left) + "px",
    top: Math.round(top) + "px",
    width: Math.round(width) + "px",
    height: Math.round(height) + "px",
  };
};

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

  if (node.blendMode && BLEND_MODE_MAP[node.blendMode]) {
    newStyle["mix-blend-mode"] = BLEND_MODE_MAP[node.blendMode];
  }

  // want to leave this up to code
  // if (style.textAlignVertical !== "TOP") {
  //   newStyle.display = "flex";
  //   newStyle["align-items"] = TEXT_ALIGN_VERTICAL_MAP[style.textAlignVertical];
  // }

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
      // Noisy, so ignore.
      // logCannotConvertCssWarning(node, [
      //   "Text",
      //   "Letter Case",
      //   "Case",
      //   LETTER_CASE_LABEL_MAP[style.textCase] || style.textCase,
      // ]);
    }
  }

  if (style.opentypeFlags) {
    const fontFeatureSettings = Object.keys(style.opentypeFlags).map(
      (key) => `"${key.toLowerCase()}" on`
    );
    newStyle["font-featutes-settings"] = fontFeatureSettings.join(", ");
  }

  if (style.paragraphSpacing) {
    // Noisy, so ignore
    // logCannotConvertCssWarning(node, ["Text", "Paragraph Spacing"]);
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
