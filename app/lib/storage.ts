import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "./config";

let client: S3Client | null = null;

/** Shared S3-compatible storage client (MinIO locally, Hetzner in prod). Server-side only. */
export function getStorage(): S3Client {
  if (!client) {
    client = new S3Client({
      region: config.s3.region,
      endpoint: config.s3.endpoint,
      forcePathStyle: config.s3.forcePathStyle,
      credentials: {
        accessKeyId: config.s3.accessKey,
        secretAccessKey: config.s3.secretKey,
      },
    });
  }
  return client;
}

export function bucketName(): string {
  return config.s3.bucket;
}

export async function checkStorage(): Promise<{ ok: boolean; detail: string }> {
  try {
    await getStorage().send(new HeadBucketCommand({ Bucket: bucketName() }));
    return { ok: true, detail: "bucket reachable" };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
