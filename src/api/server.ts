// The integration scripts and the GenLayer worker load .env files through
// @next/env; the HTTP process uses the same precedence without that dependency.
import { loadEnvironmentFiles } from "../config/env-files";
import { createApp } from "./app";

loadEnvironmentFiles();

const port = Number(process.env.PORT ?? 3000);
const app = createApp();

app.listen(port, () => {
  console.log(`tolerance.api.listening port=${port}`);
});
