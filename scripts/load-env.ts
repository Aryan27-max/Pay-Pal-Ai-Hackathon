// Load .env for CLI scripts (Next.js loads it on its own). Never prints values.
import { config } from "dotenv";
config({ quiet: true });
