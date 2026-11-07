/** npm run elastic:setup — create the photos + claims indices if missing (idempotent). */
import "./load-env";
import { ensureIndices, indices } from "@/lib/search/client";

ensureIndices()
  .then(({ created }) => {
    const { photos, claims } = indices();
    console.log(`Elastic indices ready: ${photos}, ${claims}${created.length ? ` (created: ${created.join(", ")})` : " (already existed)"}`);
  })
  .catch((e) => {
    console.error("elastic:setup failed:", e instanceof Error ? e.message.slice(0, 200) : "error");
    process.exit(1);
  });
