// Stores one customer logo for an order (called just before checkout).
// Kept separate from checkout so each request stays under Vercel's 4.5 MB
// body limit.

import { put } from '@vercel/blob'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'node:crypto'
import { ACCESS, body } from './_lib.js'

const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp' }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { dataUrl } = body<{ dataUrl?: string }>(req)
  const m = /^data:([a-z+/]+);base64,(.+)$/.exec(dataUrl ?? '')
  if (!m || !TYPES[m[1]]) return res.status(400).json({ error: 'Unsupported logo file' })
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length > 2 * 1024 * 1024) return res.status(413).json({ error: 'Logo is over 2 MB' })
  try {
    const blob = await put(`logos/${randomUUID()}.${TYPES[m[1]]}`, buf, { access: ACCESS, contentType: m[1], addRandomSuffix: false })
    return res.status(200).json({ path: blob.pathname })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Could not store logo' })
  }
}
