"use server";

import { createServerFn } from "@tanstack/react-start";
import { searchInputSchema, searchUnifiedHandler } from "./search-api";

export const searchUnified = createServerFn({ method: "GET" })
  .inputValidator((data) => searchInputSchema.parse(data))
  .handler(searchUnifiedHandler);
