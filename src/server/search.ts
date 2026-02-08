"use server";

import { createServerFn } from "@tanstack/react-start";
import { searchUnifiedHandler, searchInputSchema } from "./search-logic";

export const searchUnified = createServerFn({ method: "GET" })
  .inputValidator((data) => searchInputSchema.parse(data))
  .handler(searchUnifiedHandler);
