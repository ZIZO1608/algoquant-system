import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/index.js';
import { v4 as uuidv4 } from 'uuid';

function createClient(endpoint: string | undefined): S3Client {
  return new S3Client({
    region: config.s3.region,
    endpoint,
    credentials: {
      accessKeyId: config.s3.accessKey,
      secretAccessKey: config.s3.secretKey,
    },
    forcePathStyle: config.s3.forcePathStyle,
  });
}

const client = createClient(config.s3.endpoint);
// Signing makes no network call, so this client only needs the address browsers will use.
const presignClient =
  config.s3.publicEndpoint === config.s3.endpoint ? client : createClient(config.s3.publicEndpoint);

let bucketReady = false;

export async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
    bucketReady = true;
  } catch {
    try {
      await client.send(new CreateBucketCommand({ Bucket: config.s3.bucket }));
      bucketReady = true;
    } catch {
      // MinIO or cloud bucket may already exist with different error
      bucketReady = true;
    }
  }
}

export async function uploadFile(
  buffer: Buffer,
  mime: string,
  purpose: string
): Promise<{ storageKey: string; bucket: string; size: number }> {
  await ensureBucket();
  const storageKey = `${purpose}/${uuidv4()}`;
  await client.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: storageKey,
      Body: buffer,
      ContentType: mime,
    })
  );
  return { storageKey, bucket: config.s3.bucket, size: buffer.length };
}

export async function getPresignedUrl(storageKey: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: config.s3.bucket,
    Key: storageKey,
  });
  return getSignedUrl(presignClient, command, { expiresIn });
}

export async function deleteFile(storageKey: string): Promise<void> {
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.s3.bucket,
      Key: storageKey,
    })
  );
}

export { client as s3Client };
