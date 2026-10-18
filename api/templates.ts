// GET: published bike templates (panel outlines only, for the configurator).
// POST/DELETE (admin): publish or remove a model's SVG template.

import { del, list, put } from '@vercel/blob'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ACCESS, body, readJson, requireAdmin, safeId } from './_lib.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const { blobs } = await list({ prefix: 'templates/', limit: 1000 })
      const jsons = blobs.filter((b) => b.pathname.endsWith('.json'))
      const templates = (await Promise.all(jsons.map((b) => readJson(b.pathname)))).filter(Boolean)
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600')
      return res.status(200).json({ templates })
    }
    if (!requireAdmin(req, res)) return
    if (req.method === 'POST') {
      const b = body<{ template: Record<string, unknown>; svgText: string }>(req)
      const id = safeId(b.template?.bikeId)
      if (!id || typeof b.svgText !== 'string' || !b.svgText.includes('<svg')) return res.status(400).json({ error: 'Missing bike or SVG' })
      const opts = { access: ACCESS, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 }
      await put(`templates/${id}.svg`, b.svgText, { ...opts, contentType: 'image/svg+xml' })
      // The public JSON never includes the raw SVG.
      const { svgText: _drop, ...meta } = b.template
      void _drop
      await put(`templates/${id}.json`, JSON.stringify({ ...meta, bikeId: id, svgUrl: `templates/${id}.svg` }), { ...opts, contentType: 'application/json' })
      return res.status(200).json({ ok: true })
    }
    if (req.method === 'DELETE') {
      const id = safeId(req.query.bikeId)
      if (!id) return res.status(400).json({ error: 'Missing bike' })
      const { blobs } = await list({ prefix: `templates/${id}.` })
      if (blobs.length) await del(blobs.map((b) => b.url))
      return res.status(200).json({ ok: true })
    }
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Template storage is not set up. Connect a Vercel Blob store to this project.' })
  }
}
