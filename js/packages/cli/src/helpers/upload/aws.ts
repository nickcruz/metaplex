import log from 'loglevel';
import { createReadStream } from 'fs';
import { Readable } from 'form-data';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import { getType } from 'mime';

const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const charactersLength = characters.length;

const generateId = (length = 32) => {
  const result: string[] = new Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = characters.charAt(Math.floor(Math.random() *
      charactersLength));
  }
  return result.join("");
}

async function uploadFile(
  s3Client: S3Client,
  awsS3Bucket: string,
  filename: string,
  contentType: string,
  body: string | Readable | ReadableStream<any> | Blob | Uint8Array | Buffer,
  region: string,
): Promise<string> {
  const mediaUploadParams = {
    Bucket: awsS3Bucket,
    Key: filename,
    Body: body,
    ACL: 'public-read',
    ContentType: contentType,
  };

  try {
    await s3Client.send(new PutObjectCommand(mediaUploadParams));
    log.info('uploaded filename:', filename);
  } catch (err) {
    log.debug('Error', err);
  }

  const url = `https://${awsS3Bucket}.s3.${region}.amazonaws.com/${filename}`;
  log.debug('Location:', url);
  return url;
}

export async function awsUpload(
  awsS3Bucket: string,
  image: string,
  animation: string,
  manifestBuffer: Buffer,
) {
  const REGION = 'us-west-2';
  const s3Client = new S3Client({ region: REGION });
  const id = generateId();

  async function uploadMedia(media) {
    const mediaPath = `assets/${id}.png`;
    log.debug('media:', media);
    log.debug('mediaPath:', mediaPath);
    const mediaFileStream = createReadStream(media);
    const mediaUrl = await uploadFile(
      s3Client,
      awsS3Bucket,
      mediaPath,
      getType(media),
      mediaFileStream,
      REGION,
    );
    return mediaUrl;
  }

  // Copied from ipfsUpload
  const imageUrl = `${await uploadMedia(image)}?ext=${path
    .extname(image)
    .replace('.', '')}`;
  const animationUrl = animation
    ? `${await uploadMedia(animation)}?ext=${path
      .extname(animation)
      .replace('.', '')}`
    : undefined;
  const manifestJson = JSON.parse(manifestBuffer.toString('utf8'));
  manifestJson.image = imageUrl;
  if (animation) {
    manifestJson.animation_url = animationUrl;
  }

  const updatedManifestBuffer = Buffer.from(JSON.stringify(manifestJson));

  const metadataFilename = `assets/${id}.json`;
  const metadataUrl = await uploadFile(
    s3Client,
    awsS3Bucket,
    metadataFilename,
    'application/json',
    updatedManifestBuffer,
    REGION,
  );

  return [metadataUrl, imageUrl, animationUrl];
}
