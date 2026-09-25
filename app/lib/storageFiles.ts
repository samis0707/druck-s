import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { bucketName, getStorage } from "./storage";

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function putRequestFile(key: string, bytes: Buffer, contentType: string): Promise<void> {
  await getStorage().send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      Body: bytes,
      ContentType: contentType,
    }),
  );
}

export async function getRequestFile(key: string): Promise<Buffer> {
  const out = await getStorage().send(
    new GetObjectCommand({ Bucket: bucketName(), Key: key }),
  );
  const body = out.Body;
  if (!body) throw new Error(`Empty object body for ${key}`);
  return Buffer.from(await body.transformToByteArray());
}
