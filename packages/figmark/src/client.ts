import * as Figma from "figma-api";

export class Client {
  private _api: Figma.Api;

  constructor(personalAccessToken: string) {
    this._api = new Figma.Api({ personalAccessToken });
  }
  async download(fileKey: string) {
    const file = await this._api.getFile(fileKey);
  }
}
