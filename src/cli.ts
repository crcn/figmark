#!/usr/bin/env node
import {CONFIG_FILE_NAME, PC_FILE_EXTENSION}  from "./constants";
import * as Figma from "figma-api";
import * as inquirer from 'inquirer';
import * as fs from "fs";
import * as path from "path";
import * as fsa from "fs-extra";
import * as https from "https";
import { Config, readConfigSync } from "./state";
import { translateFigmaProjectToPaperclip } from "./translate-pc";

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

  console.log('Syncing with Figma...');

  const {personalAccessToken, fileKeys, dest}: Config = readConfigSync(process.cwd());

  const client = new Figma.Api({personalAccessToken});
  for (const fileKey of fileKeys) {
    await downloadFile(client, fileKey, dest);
  }

  if (watch) {
    setTimeout(sync, WATCH_TIMEOUT, { watch });
  } else {
    console.log('Done!');
  }
};

const EXTENSIONS = {
  'image/png': '.png'
};

const downloadFile = async (client: Figma.Api, fileKey: string, dest: string) => {
  const destPath = path.join(process.cwd(), dest);
  const file = await client.getFile(fileKey);
  const filePath = path.join(destPath, `${file.name}${PC_FILE_EXTENSION}`);

  const pcContent = translateFigmaProjectToPaperclip(file);

  if (fs.existsSync(filePath)) {
    const existingFileContent = fs.readFileSync(filePath, "utf8")

    if (existingFileContent === pcContent) {
      return;
    }
  }

  console.log(`Download ${filePath}`);
  fs.writeFileSync(filePath, pcContent);

  const result = await client.getImageFills(fileKey);

  for (const refId in result.meta.images) {
    await downloadImageRef(client, destPath, refId, result.meta.images[refId]);
  }
}

const downloadImageRef = (client: Figma.Api, destPath: string, refId: string, url: string) => {
  return new Promise(resolve => {
    https.get(url, response => {
      const contentType = response.headers['content-type'];
      const ext = EXTENSIONS[contentType];
      if (!ext) {
        console.error(`Cannot handle file type ${contentType}`);
        return;
      }
      const filePath = path.join(destPath, `${refId}${ext}`)
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
