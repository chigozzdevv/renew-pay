export const runtimeModes = ["test", "live"] as const;

export type RuntimeMode = (typeof runtimeModes)[number];
