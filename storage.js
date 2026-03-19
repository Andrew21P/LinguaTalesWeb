// storage.js — S3-compatible object storage (Hetzner / AWS)
// Write-through: every local write is also pushed to S3.
// Read-fallback: local reads fall back to S3 when the file is missing.

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";

const S3_ENDPOINT = process.env.S3_ENDPOINT || "";
const S3_BUCKET = process.env.S3_BUCKET || "";
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || "";
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || "";
const S3_REGION = process.env.S3_REGION || "nbg1";

let s3Client = null;

function getClient() {
  if (!s3Client && S3_ENDPOINT && S3_BUCKET && S3_ACCESS_KEY && S3_SECRET_KEY) {
    s3Client = new S3Client({
      endpoint: `https://${S3_ENDPOINT}`,
      region: S3_REGION,
      credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
      },
      forcePathStyle: true,
    });
  }
  return s3Client;
}

/** True when all S3 env vars are set. */
export function isConfigured() {
  return Boolean(getClient());
}

/** Convert an absolute local path to an S3 key, relative to `dataDir`. */
export function toKey(localPath, dataDir) {
  const rel = path.relative(dataDir, localPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join("/");
}

/** True when `localPath` lives under library/, audio/, or voices/. */
export function isManaged(localPath, dataDir) {
  const key = toKey(localPath, dataDir);
  if (!key) return false;
  return (
    key.startsWith("library/") ||
    key.startsWith("audio/") ||
    key.startsWith("voices/")
  );
}

// ── Write ────────────────────────────────────────────────────

/** Upload a local file to S3. */
export async function upload(localPath, dataDir) {
  const client = getClient();
  if (!client) return;
  const key = toKey(localPath, dataDir);
  if (!key) return;
  const body = await fsp.readFile(localPath);
  await client.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: body }));
}

/** Upload a Buffer directly. */
export async function uploadBuffer(buffer, s3Key) {
  const client = getClient();
  if (!client) return;
  await client.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: s3Key, Body: buffer }));
}

// ── Read ─────────────────────────────────────────────────────

/** Download an S3 object to a local path.  Returns true on success. */
export async function download(s3Key, localPath) {
  const client = getClient();
  if (!client) return false;
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key }));
    await fsp.mkdir(path.dirname(localPath), { recursive: true });
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    await fsp.writeFile(localPath, Buffer.concat(chunks));
    return true;
  } catch (err) {
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) return false;
    throw err;
  }
}

/** Ensure a file exists locally; download from S3 if missing. */
export async function ensureLocal(localPath, dataDir) {
  if (fs.existsSync(localPath)) return true;
  const key = toKey(localPath, dataDir);
  if (!key) return false;
  return download(key, localPath);
}

// ── Delete ───────────────────────────────────────────────────

export async function del(s3Key) {
  const client = getClient();
  if (!client) return;
  await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: s3Key }));
}

/** Delete every object whose key starts with `prefix`. */
export async function deletePrefix(prefix) {
  const client = getClient();
  if (!client) return;
  let token;
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: prefix, ContinuationToken: token })
    );
    if (res.Contents?.length) {
      await Promise.all(
        res.Contents.map((obj) =>
          client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: obj.Key }))
        )
      );
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
}

// ── List / query ─────────────────────────────────────────────

export async function listKeys(prefix) {
  const client = getClient();
  if (!client) return [];
  const keys = [];
  let token;
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: prefix, ContinuationToken: token })
    );
    if (res.Contents) keys.push(...res.Contents.map((o) => o.Key));
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

export async function exists(s3Key) {
  const client = getClient();
  if (!client) return false;
  try {
    await client.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: s3Key }));
    return true;
  } catch {
    return false;
  }
}

// ── Express middleware: S3 cache-fill before express.static ──

/**
 * Returns middleware that downloads a file from S3 into `localDir`
 * when the requested file isn't present locally.
 * Place it BEFORE express.static for the same mount path.
 */
export function cacheFillMiddleware(localDir, s3Prefix) {
  return async (req, _res, next) => {
    if (!isConfigured()) return next();
    try {
      const safePath = path.normalize(decodeURIComponent(req.path));
      if (safePath.includes("..")) return next();
      const localPath = path.join(localDir, safePath);
      if (!localPath.startsWith(path.resolve(localDir))) return next();
      if (fs.existsSync(localPath)) return next();
      const s3Key = s3Prefix + safePath.replace(/^\//, "").replace(/\\/g, "/");
      await download(s3Key, localPath).catch(() => {});
    } catch { /* continue to static handler */ }
    next();
  };
}

// ── Startup: sync S3 book.json files to local ────────────────

/**
 * Fetch any book.json files that exist in S3 but are missing locally.
 * Call once at startup so listLibraryBooks sees all books.
 */
export async function syncLibraryIndex(libraryDir, dataDir) {
  if (!isConfigured()) return;
  try {
    const keys = await listKeys("library/");
    const bookIds = new Set();
    for (const key of keys) {
      const parts = key.split("/");
      if (parts.length >= 2 && parts[1]) bookIds.add(parts[1]);
    }
    for (const bookId of bookIds) {
      const localMeta = path.join(libraryDir, bookId, "book.json");
      if (!fs.existsSync(localMeta)) {
        await download(`library/${bookId}/book.json`, localMeta).catch(() => {});
      }
    }
    if (bookIds.size) {
      console.log(`S3 sync: verified ${bookIds.size} book(s) in index.`);
    }
  } catch (err) {
    console.error("S3 library sync error:", err.message);
  }
}
