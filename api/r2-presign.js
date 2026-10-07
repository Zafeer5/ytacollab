import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const DEFAULT_R2_BUCKET = 'voiceovers-storage';
const DEFAULT_R2_ENDPOINT = 'https://19fca1714355549532d1a291d2e3c3d2.r2.cloudflarestorage.com';
const DEFAULT_R2_PUBLIC_URL = 'https://pub-3fc489abf5ed493a82e3194beec83469.r2.dev';
const DEFAULT_R2_KEY_ID = '2475e5b51e4d46d9b9da7d8dbe49109c';
const DEFAULT_R2_SECRET = '6eaf4f0c17a48d99a6b3f2b6cd5397f3f1349163e8a8d268c04ad6dd974d7520';

/**
 * Returns an instantiated AWS S3 Client targeting Cloudflare R2
 */
export function getR2Client() {
  const endpoint = process.env.R2_ENDPOINT || DEFAULT_R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || DEFAULT_R2_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || DEFAULT_R2_SECRET;

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
}

/**
 * Generates an S3 presigned PUT URL for Cloudflare R2 and returns key & public URL.
 */
export async function generatePresignedPutUrl({ fileName = 'voiceover.mp3', fileType = 'audio/mpeg', path = '' } = {}) {
  const bucket = process.env.R2_BUCKET_NAME || DEFAULT_R2_BUCKET;
  const publicBase = (
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL ||
    process.env.VITE_R2_PUBLIC_URL ||
    DEFAULT_R2_PUBLIC_URL
  ).replace(/\/+$/, '');

  const ext = (fileName && fileName.includes('.') ? fileName.split('.').pop() : 'mp3').toLowerCase();
  const cleanPath = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
  const key = path ? `${path.replace(/^\/+|\/+$/g, '')}/${cleanPath}` : `voiceovers/${cleanPath}`;

  const client = getR2Client();
  const contentType = fileType || 'audio/mpeg';

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType
  });

  const presignedUrl = await getSignedUrl(client, command, { expiresIn: 3600 });
  const publicUrl = `${publicBase}/${key}`;

  return {
    presignedUrl,
    uploadUrl: presignedUrl,
    publicUrl,
    key,
    bucket,
    fileName: fileName || 'voiceover.mp3',
    contentType,
    publicBaseUrl: publicBase
  };
}

/**
 * Helper to safely extract JSON payload from request body across Node and Serverless runtimes
 */
async function parseRequestBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (_) {
      return {};
    }
  }

  return new Promise((resolve) => {
    let bodyStr = '';
    req.on('data', (chunk) => {
      bodyStr += chunk;
    });
    req.on('end', () => {
      try {
        resolve(bodyStr ? JSON.parse(bodyStr) : {});
      } catch (_) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

/**
 * Uniform response sender for both Node http.ServerResponse and express/vercel res objects
 */
function sendResponse(res, statusCode, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

/**
 * Main backend endpoint handler (Vercel Serverless Function & Vite dev server middleware compatible)
 */
export async function handleR2Presign(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    let queryParams = {};
    if (req.url && req.url.includes('?')) {
      const urlObj = new URL(req.url, 'http://localhost');
      queryParams = Object.fromEntries(urlObj.searchParams.entries());
    }

    let bodyParams = {};
    if (req.method === 'POST') {
      bodyParams = await parseRequestBody(req);
    }

    const fileName = bodyParams.fileName || queryParams.fileName || 'voiceover.mp3';
    const fileType = bodyParams.fileType || bodyParams.contentType || queryParams.fileType || queryParams.contentType || 'audio/mpeg';
    const path = bodyParams.path || bodyParams.folder || queryParams.path || queryParams.folder || '';

    const presignData = await generatePresignedPutUrl({ fileName, fileType, path });
    return sendResponse(res, 200, presignData);
  } catch (err) {
    console.error('Error generating Cloudflare R2 presigned URL:', err);
    return sendResponse(res, 500, {
      error: err.message || 'Failed to generate Cloudflare R2 presigned URL'
    });
  }
}

export default handleR2Presign;
