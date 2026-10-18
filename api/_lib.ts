// Shared helpers for the serverless functions. Files starting with "_" are
// not exposed as routes by Vercel.

import { get } from '@vercel/blob'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { timingSafeEqual } from 'node:crypto'

// All stored files are private: only these functions can read them.
export const ACCESS = 'private' as const

export function isAdmin(req: VercelRequest) {
  const want = process.env.ADMIN_PASSWORD ?? ''
  const got = String(req.headers['x-admin-password'] ?? '')
  if (!want || got.length !== want.length) return false
  return timingSafeEqual(Buffer.from(got), Buffer.from(want))
}

export function requireAdmin(req: VercelRequest, res: VercelResponse) {
  if (isAdmin(req)) return true
  res.status(401).json({ error: 'Wrong admin password' })
  return false
}

export async function readText(pathname: string) {
  const r = await get(pathname, { access: ACCESS, useCache: false })
  if (!r || r.statusCode !== 200) return null
  return await new Response(r.stream).text()
}

export async function readJson<T>(pathname: string): Promise<T | null> {
  const t = await readText(pathname)
  return t ? (JSON.parse(t) as T) : null
}

export function body<T = Record<string, unknown>>(req: VercelRequest): T {
  return (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as T
}

export const safeId = (s: unknown) => (typeof s === 'string' ? s.replace(/[^a-z0-9-]/gi, '').slice(0, 60) : '')
