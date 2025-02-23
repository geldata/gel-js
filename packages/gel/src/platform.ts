import path from "node:path";
import os from "node:os";
import { exists } from "./systemUtils";

export const isWindows = process.platform === "win32";

const homeDir = os.homedir;

let _configDir: () => string;

if (process.platform === "darwin") {
  _configDir = () => {
    return path.join(homeDir(), "Library", "Application Support", "edgedb");
  };
} else if (process.platform === "win32") {
  _configDir = () => {
    const localAppDataDir =
      process.env.LOCALAPPDATA ?? path.join(homeDir(), "AppData", "Local");

    return path.join(localAppDataDir, "EdgeDB", "config");
  };
} else {
  _configDir = () => {
    let xdgConfigDir = process.env.XDG_CONFIG_HOME;
    if (!xdgConfigDir || !path.isAbsolute(xdgConfigDir)) {
      xdgConfigDir = path.join(homeDir(), ".config");
    }

    return path.join(xdgConfigDir, "edgedb");
  };
}

export async function searchConfigDir(
  ...configPath: string[]
): Promise<string> {
  const filePath = path.join(_configDir(), ...configPath);

  if (await exists(filePath)) {
    return filePath;
  }

  const fallbackPath = path.join(homeDir(), ".edgedb", ...configPath);
  if (await exists(fallbackPath)) {
    return fallbackPath;
  }

  // None of the searched files exists, return the new path.
  return filePath;
}
