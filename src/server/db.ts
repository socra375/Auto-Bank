import { getDb } from "@/db/client";
import { pgExecutor, type Executor } from "./executor";

let _ex: Executor | undefined;

/** Production executor over the pooled `pg` client. Call from server code only. */
export function getExecutor(): Executor {
  return (_ex ??= pgExecutor(getDb().$client));
}
