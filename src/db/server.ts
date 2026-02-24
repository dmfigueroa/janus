import "@tanstack/react-start/server-only";
import { createServerOnlyFn } from "@tanstack/react-start";
import { getDb as getDbInternal } from "./index";

export const getDb = createServerOnlyFn(() => getDbInternal());
