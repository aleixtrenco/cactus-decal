// Issues upload tokens so /admin can send 3D model files (.glb) straight from
// the browser to Blob storage (they are too big for a normal request).
// Models are public: every customer's browser loads them.

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { timingSafeEqual } from 'node:crypto'
import { body } from './_lib.js'

const okPassword = (got: string | null) => {
  const want = process.env.ADMIN_PASSWORD ?? ''
  return !!want && !!got && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const result = await handleUpload({
      body: body<HandleUploadBody>(req),
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!okPassword(clientPayload)) throw new Error('Wrong admin password')
        if (!/^models\/[\w.-]+\.glb$/.test(pathname)) throw new Error('Only .glb files can be uploaded')
        return { allowedContentTypes: ['model/gltf-binary', 'application/octet-stream'], maximumSizeInBytes: 60 * 1024 * 1024, addRandomSuffix: true }
      },
      onUploadCompleted: async () => {},
    })
    return res.status(200).json(result)
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : 'Upload failed' })
  }
}
