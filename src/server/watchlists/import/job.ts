import { Job } from "@sidequest/core";
import { runImport } from "../imports";
import { type CreateImportInput } from "./contracts";

export class WatchlistImportJob extends Job {
  async run(input: CreateImportInput) {
    return await runImport(this.id, input);
  }
}
