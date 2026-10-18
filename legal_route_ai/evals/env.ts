// Imported first by every eval so .env.local is loaded before modules that read it at import time.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
