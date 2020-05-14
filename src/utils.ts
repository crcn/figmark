import {camelCase} from "lodash";
export const pascalCase = (value: string) => value.substr(0, 1).toUpperCase() + camelCase(value.substr(1));