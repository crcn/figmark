import { camelCase } from "lodash";
import * as chalk from "chalk";
export const pascalCase = (value: string) =>
  value.substr(0, 1).toUpperCase() + camelCase(value.substr(1));

export const logWarn = (message: string) => {
  console.warn(chalk.yellow(`warning`) + " " + message);
};

export const logInfo = (message: string) => {
  console.warn(chalk.blue(`info`) + " " + message);
};

export const logError = (message: string) => {
  console.warn(chalk.red(`error`) + " " + message);
};