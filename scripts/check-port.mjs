// Pre-flight checks before starting production server.
import { createConnection } from "net";
import { accessSync } from "fs";

// Check build exists
try {
  accessSync(".next/standalone/server.js");
} catch {
  console.error("");
  console.error("⚠️  No production build found.");
  console.error("");
  console.error("   Run the build first:");
  console.error("     npm run build");
  console.error("");
  process.exit(1);
}

const port = Number(process.env.PORT || 3000);

const sock = createConnection({ host: "127.0.0.1", port });

sock.on("connect", () => {
  sock.destroy();
  console.error("");
  console.error(`⚠️  Port ${port} is already in use.`);
  console.error("");
  console.error("   If the dev server is running, stop it first:");
  console.error("     Press Ctrl+C in the dev terminal");
  console.error("");
  console.error("   Or use a different port:");
  console.error(`     PORT=${port === 3000 ? 3009 : port + 1} npm run start`);
  console.error("");
  process.exit(1);
});

sock.on("error", () => {
  // Port is free — good to go
  process.exit(0);
});

sock.setTimeout(1000, () => {
  sock.destroy();
  process.exit(0);
});
