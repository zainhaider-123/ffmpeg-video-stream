import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

loadEnv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"),
});
loadEnv();
