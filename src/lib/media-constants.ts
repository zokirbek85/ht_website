export const MEDIA_CATEGORIES = ["logo", "factory", "team", "certificate", "gallery"] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];
