// The integration scripts and the GenLayer worker load .env files through
// @next/env; the HTTP process uses the same precedence without that dependency.
import { loadEnvironmentFiles } from "../config/env-files";
import { DEFAULT_API_PORT } from "../config/ports";
import { createApp } from "./app";

loadEnvironmentFiles();

const port = Number(process.env.PORT ?? DEFAULT_API_PORT);
const app = createApp();

app.listen(port, () => {
  console.log(`tolerance.api.listening port=${port}`);
});
