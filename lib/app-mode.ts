export type AppMode = "demo" | "live";

export function getAppMode(): AppMode {
  return process.env.APP_MODE === "live" ? "live" : "demo";
}

export function isDemoMode() {
  return getAppMode() === "demo";
}
