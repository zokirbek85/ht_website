export const SITE_MEDIA_ROLES = ["logo", "hero", "product", "favicon"] as const;
export type SiteMediaRole = (typeof SITE_MEDIA_ROLES)[number];
export type SiteMediaSettings = Record<SiteMediaRole, string | null>;
