/**
 * Local stand-ins for types the client previously imported from the
 * cross-repo `@chrono/shared` package (absent in this workspace).
 *
 * `CleanupPolicy` is a server-owned device session-cleanup policy. The client
 * only ever stores and forwards it (it is never constructed or field-read here),
 * so this is a permissive structural mirror with an index signature rather than
 * an exact copy of the server contract.
 */
export interface CleanupPolicy {
  mode?: string;
  deleteDownloads?: boolean;
  deleteDocuments?: boolean;
  clearBrowserData?: boolean;
  resetWallpaper?: boolean;
  customPaths?: string[];
  [key: string]: unknown;
}
