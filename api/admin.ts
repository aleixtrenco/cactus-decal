// Admin-only reads: ?op=ping | orders | file&path=<pathname>

import { get, list } from '@vercel/blob'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { ACCESS, readJson, requireAdmin } from './_lib.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAdmin(req, res)) return
  const op = String(req.query.op ?? '')
  try {
    if (op === 'ping') return res.status(200).json({ ok: true })

    if (op === 'orders') {
      const { blobs } = await list({ prefix: 'orders/', limit: 1000 })
      const recent = blobs.sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt)).slice(0, 60)
      const orders = (await Promise.all(recent.map((b) => readJson<Record<string, unknown>>(b.pathname)))).filter(Boolean) as Record<string, unknown>[]
      const key = process.env.STRIPE_SECRET_KEY
      if (key) {
        const stripe = new Stripe(key)
        await Promise.all(
          orders.map(async (o) => {
            if (typeof o.sessionId !== 'string') return
            try {
              const s = await stripe.checkout.sessions.retrieve(o.sessionId)
              o.paymentStatus = s.payment_status
              o.customer = { name: s.customer_details?.name, email: s.customer_details?.email, phone: s.customer_details?.phone }
            } catch {
              o.paymentStatus = 'unknown'
            }
          }),
        )
      }
      return res.status(200).json({ orders })
    }

    if (op === 'file') {
      const path = String(req.query.path ?? '')
      if (!/^(logos|templates|orders)\/[\w.-]+$/.test(path)) return res.status(400).json({ error: 'Bad path' })
      const r = await get(path, { access: ACCESS, useCache: false })
      if (!r || r.statusCode !== 200) return res.status(404).json({ error: 'Not found' })
      res.setHeader('Content-Type', r.blob.contentType)
      res.setHeader('Cache-Control', 'private, no-store')
      return res.status(200).send(Buffer.from(await new Response(r.stream).arrayBuffer()))
    }
    return res.status(400).json({ error: 'Unknown op' })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Storage error. Check the Vercel Blob store is connected.' })
  }
}
