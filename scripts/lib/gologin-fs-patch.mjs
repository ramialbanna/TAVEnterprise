/**
 * Item 74 — Node 25 rejects `fs.promises.rmdir({ recursive: true })`.
 * The gologin SDK still calls it from BrowserChecker.deleteDir.
 * Import this module before `gologin`.
 */
import fs from "node:fs";

const originalRmdir = fs.promises.rmdir.bind(fs.promises);
fs.promises.rmdir = async (target, opts) => {
  if (opts && opts.recursive) {
    return fs.promises.rm(target, { recursive: true, force: true });
  }
  return originalRmdir(target, opts);
};
