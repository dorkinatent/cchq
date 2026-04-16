import { access, stat } from "fs/promises";
import { constants } from "fs";

export async function validateProjectPath(path: unknown): Promise<string | null> {
  if (typeof path !== "string" || path.trim() === "") {
    return "Path must be a string";
  }

  try {
    await access(path, constants.R_OK);
  } catch {
    return "Path does not exist or is not readable";
  }

  try {
    const info = await stat(path);
    if (!info.isDirectory()) {
      return "Path is not a directory";
    }
  } catch {
    return "Path does not exist or is not readable";
  }

  return null;
}
