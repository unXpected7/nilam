import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'

const allowedInputTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maxInputBytes = 10 * 1024 * 1024
const maxDimension = 8_000
const maxOutputDimension = 2_400

function storageConfig() {
  const endpoint = process.env.MINIO_ENDPOINT
  const accessKeyId = process.env.MINIO_ACCESS_KEY
  const secretAccessKey = process.env.MINIO_SECRET_KEY
  const bucket = process.env.MEDIA_BUCKET || 'topan-media-prod'
  const publicBaseUrl = (process.env.MEDIA_PUBLIC_BASE_URL || 'https://media-topan.fluxorastudio.id').replace(/\/$/, '')
  if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error('Media storage is not configured')
  return { endpoint, accessKeyId, secretAccessKey, bucket, publicBaseUrl }
}

function client(config: ReturnType<typeof storageConfig>) {
  return new S3Client({ endpoint: config.endpoint, region: process.env.MINIO_REGION || 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } })
}

export async function convertAndStoreProductImage(productId: string, file: Express.Multer.File) {
  if (!allowedInputTypes.has(file.mimetype) || file.size > maxInputBytes) throw new Error('Upload a JPEG, PNG, or WebP image no larger than 10 MB')
  const source = sharp(file.buffer, { limitInputPixels: maxDimension * maxDimension, failOn: 'error' })
  const metadata = await source.metadata()
  if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || !metadata.width || !metadata.height || metadata.width > maxDimension || metadata.height > maxDimension) throw new Error('Upload a valid JPEG, PNG, or WebP image between 1 px and 8000 px')
  const body = await source.rotate().resize({ width: maxOutputDimension, height: maxOutputDimension, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, effort: 4 }).toBuffer()
  const output = await sharp(body).metadata()
  if (output.format !== 'webp' || !output.width || !output.height) throw new Error('Image could not be converted to WebP')
  const config = storageConfig()
  const objectKey = `products/${productId}/${randomUUID()}.webp`
  await client(config).send(new PutObjectCommand({ Bucket: config.bucket, Key: objectKey, Body: body, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }))
  return { objectKey, url: `${config.publicBaseUrl}/${config.bucket}/${objectKey}`, contentType: 'image/webp', width: output.width, height: output.height, bytes: body.byteLength }
}

export async function deleteStoredMedia(objectKey: string | null) {
  if (!objectKey) return
  const config = storageConfig()
  await client(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }))
}
