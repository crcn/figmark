#!/usr/bin/env node
import { CONFIG_FILE_NAME, PC_FILE_EXTENSION } from "./constants";
import * as Figma from "figma-api";
import * as inquirer from "inquirer";
import * as fs from "fs";
import * as path from "path";
import * as fsa from "fs-extra";
import * as https from "https";
import * as ora from "ora";
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
} from "./state";
import { translateFigmaProjectToPaperclip } from "./translate-pc";
import { Document } from "./state";
import { ProjectFile, Version } from "figma-api/lib/api-types";
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

const getTeamFiles = async (client: Figma.Api, teamId: string) => {
  const allFiles: ProjectFile[] = [];
  const { projects } = await client.getTeamProjects(teamId);
  for (const project of projects) {
    const { files } = await client.getProjectFiles(String(project.id));
    allFiles.push(...files);
  }

  return allFiles;
};

export const sync = async ({ watch }: SyncOptions) => {
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

  const client = new Figma.Api({ personalAccessToken });
  const files = await getTeamFiles(client, teamId);

  // spinner.stop();
  for (const file of files) {
    const fileVersion =
      (fileVersions && fileVersions[file.key]) || LATEST_VERSION_NAME;
    logInfo(`Loading project: ${file.name}@${fileVersion}`);

    await downloadFile(
      client,
      file.key,
      fileVersion,
      fileNameFormat,
      compilerOptions,
      dest
    );
  }

  if (watch) {
    setTimeout(sync, WATCH_TIMEOUT, { watch });
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

const downloadFile = async (
  client: Figma.Api,
  fileKey: string,
  version: string,
  fileNameFormat: FileNameFormat,
  compilerOptions: CompilerOptions,
  dest: string
) => {
  const destPath = path.join(process.cwd(), dest);
  const file = await client.getFile(fileKey, {
    geometry: "paths",
    version: version === LATEST_VERSION_NAME ? undefined : version,
  });
  // const res = await client.get

  const filePath = path.join(
    destPath,
    `${formatFileName(file.name, fileNameFormat)}${PC_FILE_EXTENSION}`
  );

  // TODO - need to import deps
  // for (const id in file.components) {
  //   const component = file.components[id];
  //   if (component.key) {
  //     console.log("LOADING", component);
  //     const result = await client.getComponent(component.key);
  //     console.log("LOADED", result);
  //   }
  // }
  const pcContent = translateFigmaProjectToPaperclip(file, compilerOptions);

  if (fs.existsSync(filePath)) {
    const existingFileContent = fs.readFileSync(filePath, "utf8");

    if (existingFileContent === pcContent) {
      return;
    }
  }

  fs.writeFileSync(filePath, pcContent);
  await downloadImages(client, fileKey, destPath);
  await downloadNodeImages(
    client,
    fileKey,
    file.document as Document,
    destPath
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

const downloadNodeImages = async (
  client: Figma.Api,
  fileKey: string,
  document: Document,
  destPath: string
) => {
  const allNodes = flattenNodes(document);

  const nodeIdsByExport: Record<
    string,
    {
      settings: ExportSettings;
      nodes: Record<string, Node>;
    }
  > = {};

  for (const child of allNodes) {
    if (isExported(child)) {
      if (!child.exportSettings) {
        continue;
      }
      for (const settings of child.exportSettings) {
        if (settings.format === "PDF") {
          logWarning(`Cannot download PDF for layer: "${child.name}"`);
          continue;
        }

        if (settings.constraint.type !== "SCALE") {
          logWarning(
            `Cannot download "${child.name}" export since it doesn't have SCALE constraint.`
          );
          continue;
        }
        const key =
          settings.format +
          settings.constraint.type +
          settings.constraint.value;

        if (!nodeIdsByExport[key]) {
          nodeIdsByExport[key] = { settings, nodes: {} };
        }
        nodeIdsByExport[key].nodes[child.id] = child;
      }
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
