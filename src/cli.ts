#!/usr/bin/env node
import {
  CONFIG_FILE_NAME,
  PC_FILE_EXTENSION,
  DEPENDENCIES_NAMESPACE,
  DEFAULT_EXPORT_SETTINGS,
} from "./constants";
import * as Figma from "figma-api";
import * as inquirer from "inquirer";
import * as fs from "fs";
import * as path from "path";
import * as fsa from "fs-extra";
import * as https from "https";
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
} from "./state";
import { translateFigmaProjectToPaperclip } from "./translate-pc";
import { Document } from "./state";
import { Version } from "figma-api/lib/api-types";
import { logInfo, pascalCase, logWarn } from "./utils";

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

  console.log("Fetching files...");

  // const fileVersion = await getFileVes
  const fileVersions = await getFileVersions(
    client,
    teamId,
    () => LATEST_VERSION_NAME
  );

  const config: Config = {
    dest,
    fileNameFormat: FileNameFormat.KebabCase,
    personalAccessToken,
    teamId: teamId,
    fileVersions,
    compilerOptions: {
      includeAbsoluteLayout: true,
    },
  };

  fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
  console.log(`Created ${CONFIG_FILE_NAME}`);
  fsa.mkdirpSync(dest);
  console.log(`Created ${dest}`);
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

  const {
    personalAccessToken,
    dest,
    teamId,
    fileVersions,
    fileNameFormat,
    compilerOptions,
  }: Config = readConfigSync(process.cwd());

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
        syncDir
      );
    }
  }

  if (watch) {
    setTimeout(pull, WATCH_TIMEOUT, { watch });
  } else {
    logInfo(`Done! 👨🏻‍🎨`);
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
  dest: string
) => {
  const file = await client.getFile(fileKey, {
    geometry: "paths",
    version: version === LATEST_VERSION_NAME ? undefined : version,
  });
  const filePath = getFileKeySourcePath(
    fileKey,
    dest,
    fileNameFormat,
    projects
  );
  const fileDir = path.dirname(filePath);
  fsa.mkdirpSync(fileDir);

  const importedDocuments = await getImportedDocuments(
    client,
    file,
    fileKey,
    dest,
    fileNameFormat,
    projects
  );

  const pcContent = translateFigmaProjectToPaperclip(
    file,
    filePath,
    compilerOptions,
    importedDocuments
  );

  if (fs.existsSync(filePath)) {
    const existingFileContent = fs.readFileSync(filePath, "utf8");

    if (existingFileContent === pcContent) {
      return;
    }
  }

  fs.writeFileSync(filePath, pcContent);
  await downloadImages(client, fileKey, fileDir);
  await downloadNodeImages(client, fileKey, file.document as Document, fileDir);
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
  const allNodes = flattenNodes(document);

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
    if (isVectorLike(child)) {
      const key = getSettingKey(DEFAULT_EXPORT_SETTINGS);
      nodeIdsByExport = addNodeToDownload(
        child,
        nodeIdsByExport,
        DEFAULT_EXPORT_SETTINGS
      );
      nodeIdsByExport[key].nodes[child.id] = child;
    }
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
