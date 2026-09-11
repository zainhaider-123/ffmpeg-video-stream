import { createStorageClient, loadStorageConfigFromEnv } from "./index.js";

async function main() {
  const storage = createStorageClient(loadStorageConfigFromEnv());
  await storage.ensureBucket();
  console.log(`Bucket ready: ${storage.bucket}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
