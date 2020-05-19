#!/usr/bin/env node
import {
  CONFIG_FILE_NAME,
  PC_FILE_EXTENSION,
  DEPENDENCIES_NAMESPACE,
  DEFAULT_EXPORT_SETTINGS,
  PC_CONFIG_FILE_NAME,
  DEFAULT_COMPILER_TARGET_NAME,
} from "./constants";
import * as Figma from "figma-api";
import * as inquirer from "inquirer";
import * as fs from "fs";
import * as path from "path";
import * as fsa from "fs-extra";
import * as https from "https";
import * as chalk from "chalk";
import { camelCase, kebabCase, snakeCase } from "lodash";
import {
  Config,
  readConfigSync,
  flattenNodes,
  Node,
  isExported,
  ExportSettings,
  getNodeExportFileName,
  FileNameFormat,
  CompilerOptions,
  Project,
  ProjectFile,
  Component,
  NodeType,
  Dependency,
  isVectorLike,
  getAllComponents,
} from "./state";
import { spawn } from "child_process";
import { Document } from "./state";
import { Version } from "figma-api/lib/api-types";
import { translateFigmaProjectToPaperclip } from "./translate-pc";
import {
  logInfo,
  logSuccess,
  pascalCase,
  logWarn,
  exec,
  installDependencies,
} from "./utils";

const cwd = process.cwd();
const WATCH_TIMEOUT = 1000 * 5;
const LATEST_VERSION_NAME = "latest";

const configFilePath = path.join(cwd, CONFIG_FILE_NAME);

export const init = async () => {
  const { personalAccessToken, teamId, dest } = await inquirer.prompt([
    {
      name: "personalAccessToken",
      message: "What's your Figma personal access token?",
    },
    {
      name: "teamId",
      message: "What's your team ID?",
    },
    {
      name: "dest",
      default: "./src/design-generated",
      message: "Where would you like the Figma files to live?",
    },
  ]);

  const client = new Figma.Api({ personalAccessToken });

  logInfo("Fetching files versions...");

  const fileVersions = await getFileVersions(
    client,
    teamId,
    () => LATEST_VERSION_NAME
  );

  const pcConfig = {
    compilerOptions: {
      // TODO - this eventuall be a list
      name: "paperclip-compiler-react",
    },
    filesGlob: "./" + path.join(dest, "**/*.pc"),
    dropPcExtension: true,
  };

  const config: Config = {
    dest,
    fileNameFormat: FileNameFormat.KebabCase,
    personalAccessToken,
    teamId: teamId,
    fileVersions,
    compilerOptions: {
      includeAbsoluteLayout: false,
      includePreviews: true,
    },
    compileOnPull: true,
  };

  fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
  logInfo(
    `Created ${CONFIG_FILE_NAME} - ${chalk.gray(
      "this is there your config lives"
    )}`
  );

  if (!fs.existsSync(path.join(cwd, "package.json"))) {
    await exec("npm", ["init", "--fl"], cwd, false);
    logInfo(
      `Created package.json - ${chalk.gray("this is for Figmark dependencies")}`
    );
  }

  // TODO - may want to incude version numbers here
  await installDependencies(
    [DEFAULT_COMPILER_TARGET_NAME, "paperclip", "paperclip-cli"],
    cwd,
    true
  );

  fs.writeFileSync(
    path.join(cwd, PC_CONFIG_FILE_NAME),
    JSON.stringify(pcConfig, null, 2)
  );
  logInfo(
    `Created ${PC_CONFIG_FILE_NAME} - ${chalk.gray("compile target config")}`
  );
  fsa.mkdirpSync(dest);
  logInfo(`Created ${dest}`);
  logSuccess(`All done! Go ahead and run ${chalk.bold("figmark pull")}`);
};

type SyncOptions = {
  watch?: boolean;
};

const defaultVersionGetter = (versions: Version[]) =>
  versions.length > 0 ? versions[0].id : LATEST_VERSION_NAME;

const getFileVersions = async (
  client: Figma.Api,
  teamId: string,
  getVersion = defaultVersionGetter
) => {
  const files = await getTeamFiles(client, teamId);
  const map = {};
  for (const file of files) {
    const { versions } = await client.getVersions(file.key);
    map[file.key] = getVersion(versions);
  }
  return map;
};

const getTeamProjects = async (client: Figma.Api, teamId: string) => {
  const projects: Project[] = [];
  const { projects: remoteProjects } = await client.getTeamProjects(teamId);
  for (const project of remoteProjects) {
    const { files: remoteFiles } = await client.getProjectFiles(
      String(project.id)
    );

    projects.push({
      id: project.id,
      name: project.name,
      files: remoteFiles.map((file) => ({
        key: file.key,
        name: file.name,
      })),
    });
  }

  return projects;
};

const getTeamFiles = async (client: Figma.Api, teamId: string) => {
  const projects = await getTeamProjects(client, teamId);
  const allFiles: ProjectFile[] = [];
  for (const project of projects) {
    allFiles.push(...project.files);
  }

  return allFiles;
};

export const pull = async ({ watch }: SyncOptions) => {
  if (!fs.existsSync(configFilePath)) {
    return console.error(
      `No config found -- try running "figmark init" first.`
    );
  }

  logInfo(`Loading team designs from Figma`);

  const config: Config = readConfigSync(process.cwd());
  const {
    personalAccessToken,
    dest,
    teamId,
    fileVersions,
    fileNameFormat,
    compilerOptions,
  } = config;

  const syncDir = path.join(cwd, dest);

  const client = new Figma.Api({ personalAccessToken });
  const projects = await getTeamProjects(client, teamId);
  for (const project of projects) {
    if (!project.files.length) {
      continue;
    }

    // spinner.stop();
    for (const file of project.files) {
      const fileVersion =
        (fileVersions && fileVersions[file.key]) || LATEST_VERSION_NAME;

      logInfo(`Loading project: ${file.name}@${fileVersion}`);

      await downloadProjectFile(
        client,
        file.key,
        fileVersion,
        fileNameFormat,
        compilerOptions,
        project,
        projects,
        syncDir,
        config
      );
    }
  }

  if (watch) {
    setTimeout(pull, WATCH_TIMEOUT, { watch });
  } else {
    logInfo(`Downloaded all assets 🎨`);
  }
};

const EXTENSIONS = {
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/jpeg": ".jpg",
};

const formatFileName = (name: string, fileNameFormat: FileNameFormat) => {
  switch (fileNameFormat) {
    case FileNameFormat.CamelCase: {
      return camelCase(name);
    }
    case FileNameFormat.KebabCase: {
      return kebabCase(name);
    }
    case FileNameFormat.PascalCase: {
      return pascalCase(name);
    }
    case FileNameFormat.SnakeCase: {
      return snakeCase(name);
    }
    default: {
      return name;
    }
  }
};

const downloadProjectFile = async (
  client: Figma.Api,
  fileKey: string,
  version: string,
  fileNameFormat: FileNameFormat,
  compilerOptions: CompilerOptions,
  project: Project,
  projects: Project[],
  dest: string,
  config: Config
) => {
  const file = await client.getFile(fileKey, {
    geometry: "paths",
    version: version === LATEST_VERSION_NAME ? undefined : version,
  });

  const pcFilePath = getFileKeySourcePath(
    fileKey,
    dest,
    fileNameFormat,
    projects
  );
  const fileDir = path.dirname(pcFilePath);
  fsa.mkdirpSync(fileDir);

  const importedDocuments = await getImportedDocuments(
    client,
    file,
    fileKey,
    dest,
    fileNameFormat,
    projects
  );
  logInfo("Converting to paperclip");

  const pcContent = translateFigmaProjectToPaperclip(
    file,
    pcFilePath,
    compilerOptions,
    importedDocuments
  );

  if (fs.existsSync(pcFilePath)) {
    const existingFileContent = fs.readFileSync(pcFilePath, "utf8");

    if (existingFileContent === pcContent) {
      return;
    }
  }

  logInfo("Downloading images");
  fs.writeFileSync(pcFilePath, pcContent);
  await downloadImages(client, fileKey, fileDir);
  await downloadNodeImages(client, fileKey, file.document as Document, fileDir);

  // Compiling for convenience so that users can start including
  // designs immediately
  if (config.compileOnPull) {
    await compilePC(pcFilePath);
  }
};

const compilePC = async (filePath: string) => {
  logInfo(`Compiling ${path.relative(cwd, filePath)}`);

  // Note that since we're compiling to JS directly, we need to drop the *.pc extension
  // so that the file can be loaded into NodeJS. (*.pc.js doesn't work since require("./*.pc") loads the *.pc file instead)
  await exec(
    `./node_modules/.bin/paperclip`,
    [filePath, "--write"],
    cwd,
    false
  );
  await exec(
    `./node_modules/.bin/paperclip`,
    [filePath, "--definition", "--write"],
    cwd,
    false
  );
};

const downloadImages = async (
  client: Figma.Api,
  fileKey: string,
  destPath: string
) => {
  logInfo(`Downloading images`);
  const result = await client.getImageFills(fileKey);

  for (const refId in result.meta.images) {
    await downloadImageRef(client, destPath, refId, result.meta.images[refId]);
  }
};

const getImportedDocuments = async (
  client: Figma.Api,
  file,
  fileKey: string,
  syncDir,
  fileNameFormat: FileNameFormat,
  projects: Project[]
) => {
  const importedDocuments: Record<string, Dependency> = {};

  for (const importId in file.components) {
    const componentRef = file.components[importId];
    if (componentRef.key) {
      const componentInfo = (await client.getComponent(
        componentRef.key
      )) as any;
      if (componentInfo.meta.file_key === fileKey) {
        continue;
      }
      const file = await client.getFile(componentInfo.meta.file_key);

      const sourceFilePath = getFileKeySourcePath(
        componentInfo.meta.file_key,
        syncDir,
        fileNameFormat,
        projects
      );
      const info = importedDocuments[sourceFilePath] || {
        idAliases: {},
        document: file.document as any,
      };

      info.idAliases[importId] = componentInfo.meta.node_id;
      importedDocuments[sourceFilePath] = info;
    }
  }
  return importedDocuments;
};

const getFileKeySourcePath = (
  key: string,
  dest: string,
  fileNameFormat: FileNameFormat,
  projects: Project[]
) => {
  let projectName = DEPENDENCIES_NAMESPACE;
  let fileName = key;

  for (const project of projects) {
    for (const file of project.files) {
      if (file.key === key) {
        projectName = project.name;
        fileName = file.name;
        break;
      }
    }
  }
  return path.join(
    dest,
    formatFileName(projectName, fileNameFormat),
    `${formatFileName(fileName, fileNameFormat)}${PC_FILE_EXTENSION}`
  );
};

const downloadNodeImages = async (
  client: Figma.Api,
  fileKey: string,
  document: Document,
  destPath: string
) => {
  // only want to export components & their children
  const allNodes = getAllComponents(document).reduce((allNodes, component) => {
    allNodes.push(...flattenNodes(component));
    return allNodes;
  }, []);

  let nodeIdsByExport: Record<
    string,
    {
      settings: ExportSettings;
      nodes: Record<string, Node>;
    }
  > = {};

  for (const child of allNodes) {
    if (isExported(child)) {
      for (const setting of child.exportSettings) {
        if (setting.format === "PDF") {
          logWarning(`Cannot download PDF for layer: "${child.name}"`);
          continue;
        }

        if (setting.constraint.type !== "SCALE") {
          logWarning(
            `Cannot download "${child.name}" export since it doesn't have SCALE constraint.`
          );
          continue;
        }

        nodeIdsByExport = addNodeToDownload(child, nodeIdsByExport, setting);
      }
    }

    // export all SVG-like nodes
    // DON'T do this, otherwise we'll be in a world of pain with super large files.
    // if (isVectorLike(child)) {
    //   const key = getSettingKey(DEFAULT_EXPORT_SETTINGS);
    //   nodeIdsByExport = addNodeToDownload(
    //     child,
    //     nodeIdsByExport,
    //     DEFAULT_EXPORT_SETTINGS
    //   );
    //   nodeIdsByExport[key].nodes[child.id] = child;
    // }
  }

  for (const key in nodeIdsByExport) {
    const { settings, nodes } = nodeIdsByExport[key];
    const result = await client.getImage(fileKey, {
      ids: Object.keys(nodes).join(","),
      format: settings.format.toLowerCase() as any,
      scale: settings.constraint.value,
    });

    for (const nodeId in result.images) {
      await downloadImageRef(
        client,
        destPath,
        getNodeExportFileName(nodes[nodeId], document, settings)
          .split(".")
          .shift(),
        result.images[nodeId]
      );
    }
  }
};

const getSettingKey = (setting) =>
  setting.format + setting.constraint.type + setting.constraint.value;

const addNodeToDownload = (child, rec, setting: any): any => {
  const key = getSettingKey(setting);

  if (!rec[key]) {
    rec[key] = { settings: setting, nodes: {} };
  }
  rec[key].nodes[child.id] = child;

  return rec;
};

const downloadImageRef = (
  client: Figma.Api,
  destPath: string,
  name: string,
  url: string
) => {
  logInfo(`Downloading ${url}`);
  return new Promise((resolve) => {
    https.get(url, (response) => {
      const contentType = response.headers["content-type"];
      const ext = EXTENSIONS[contentType];
      if (!ext) {
        console.error(`⚠️ Cannot handle file type ${contentType}`);
        return;
      }
      const filePath = path.join(destPath, `${name}${ext}`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      const localFile = fs.createWriteStream(filePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      response.pipe(localFile).on("close", () => {
        resolve();
      });
    });
  });
};

const logWarning = (text: string) => {
  logWarn(text);
};
