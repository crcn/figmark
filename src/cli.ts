#!/usr/bin/env node
import {CONFIG_FILE_NAME, PC_FILE_EXTENSION}  from "./constants";
import * as Figma from "figma-api";
import * as inquirer from "inquirer";
import * as fs from "fs";
import * as path from "path";
import * as fsa from "fs-extra";
import * as https from "https";
import { Config, readConfigSync, flattenNodes, hasVectorProps, isExported, ExportSettings, getNodeExportFileName } from "./state";
import { translateFigmaProjectToPaperclip } from "./translate-pc";
import {Document} from "./state";
const memoize = require("fast-memoize");

const cwd = process.cwd();
const WATCH_TIMEOUT = 1000 * 5;

const configFilePath = path.join(cwd, CONFIG_FILE_NAME);

export const init  = async () => {
  const {personalAccessToken, fileKey, dest} = await inquirer.prompt([
    {
      name: "dest",
      default: "./src/designs",
      message: "Where would you like the Figma files to live?"
    },
    {
      name: "personalAccessToken",
      message: "What's your Figma personal access token?"
    },
    {
      name: "fileKey",
      message: "What's the file key that you'd like to use?"
    }
  ]);


  const config = {
    dest,
    personalAccessToken,
    fileKeys: [fileKey]
  }

  fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
  console.log(`Created ${CONFIG_FILE_NAME}`);
  fsa.mkdirpSync(dest);
  console.log(`Created ${dest}`);
}

type SyncOptions = {
  watch?: boolean
}

export const sync = async ({ watch }: SyncOptions) => {
  if (!fs.existsSync(configFilePath)) {
    return console.error(`No config found -- try running "figmark init" first.`);
  }

  console.log("Syncing with Figma...");

  const {personalAccessToken, fileKeys, dest}: Config = readConfigSync(process.cwd());

  const client = new Figma.Api({personalAccessToken});
  for (const fileKey of fileKeys) {
    await downloadFile(client, fileKey, dest);
  }

  if (watch) {
    setTimeout(sync, WATCH_TIMEOUT, { watch });
  } else {
    console.log("Done!");
  }
};

const EXTENSIONS = {
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/jpeg": ".jpg"
};

const downloadFile = async (client: Figma.Api, fileKey: string, dest: string) => {
  const destPath = path.join(process.cwd(), dest);
  const file = await client.getFile(fileKey, { geometry: "paths" });
  const filePath = path.join(destPath, `${file.name}${PC_FILE_EXTENSION}`);

  const pcContent = translateFigmaProjectToPaperclip(file);

  // if (fs.existsSync(filePath)) {
  //   const existingFileContent = fs.readFileSync(filePath, "utf8")

  //   if (existingFileContent === pcContent) {
  //     return;
  //   }
  // }

  fs.writeFileSync(filePath, pcContent);
  // await downloadImages(client, fileKey, destPath);
  await downloadNodeImages(client, fileKey, file.document as Document, destPath);
}

const downloadImages = async (client: Figma.Api, fileKey: string, destPath: string) => {

  const result = await client.getImageFills(fileKey);

  for (const refId in result.meta.images) {
    await downloadImageRef(client, destPath, refId, result.meta.images[refId]);
  }
}

const downloadNodeImages = async (client: Figma.Api, fileKey: string, document: Document, destPath: string) => {
  const allNodes = flattenNodes(document);

  const nodeIdsByExport: Record<string, {
    settings: ExportSettings,
    ids: string[]
  }> = {};
  
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
          logWarning(`Cannot download "${child.name}" export since it doesn't have SCALE constraint.`);
          continue;
        }
        const key = settings.format + settings.constraint.type + settings.constraint.value;

        if (!nodeIdsByExport[key]) {
          nodeIdsByExport[key] = { settings, ids: [] }
        }
        nodeIdsByExport[key].ids.push(child.id);
      }
    }
  }

  for (const key in nodeIdsByExport) {
    const { settings, ids } = nodeIdsByExport[key];
    const result = await client.getImage(fileKey, {
      ids: ids.join(","),
      format: settings.format.toLowerCase() as any,
      scale: settings.constraint.value,
    });

    for (const nodeId in result.images) {
      await downloadImageRef(client, destPath, getNodeExportFileName(nodeId, settings).split(".").shift(), result.images[nodeId]);
    }
  }
}

const downloadImageRef = (client: Figma.Api, destPath: string, name: string, url: string) => {
  console.log(`Downloading ${url}`);
  return new Promise(resolve => {
    https.get(url, response => {
      const contentType = response.headers['content-type'];
      const ext = EXTENSIONS[contentType];
      if (!ext) {
        console.error(`⚠️ Cannot handle file type ${contentType}`);
        return;
      }
      const filePath = path.join(destPath, `${name}${ext}`)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      const localFile = fs.createWriteStream(filePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      response.pipe(localFile).on('close', () => {
        resolve();
      })
    })
  });
}
type BuildOptions = {
  definition: boolean
};


const logWarning = (text: string) => {
  console.warn(`⚠️  ${text}`);
}