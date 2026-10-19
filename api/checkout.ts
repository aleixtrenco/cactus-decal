// Vercel serverless function: creates a Stripe Checkout session.
// The price is recalculated here from src/data/pricing.ts, never trusted
// from the browser.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { put } from '@vercel/blob'
import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import { ACCESS } from './_lib.js'
import { bikeById } from '../src/data/bikes.js'
import { designById } from '../src/data/designs.js'
import { EXTRAS, FINISHES, MATERIALS, priceLines, type ExtraId, type FinishId, type MaterialId } from '../src/data/pricing.js'
import { NEON_HEXES } from '../src/data/designs.js'

const pick = <T extends string>(v: unknown, allowed: Record<T, unknown>, fallback: T): T =>
  typeof v === 'string' && v in allowed ? (v as T) : fallback

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '')

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return res.status(500).json({ error: 'Payments are not configured yet' })

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const c = body?.config ?? {}

  const finish = pick<FinishId>(c.finish, FINISHES, 'gloss')
  const material = pick<MaterialId>(c.material, MATERIALS, 'standard')
  const extras = (Array.isArray(c.extras) ? c.extras : []).filter((x: unknown): x is ExtraId => typeof x === 'string' && x in EXTRAS)
  const colours = [...Object.values(c.colors ?? {}), c.rider?.numberColor, c.rider?.plateColor, c.rider?.frontPlateColor, c.rider?.nameColor]
  const usesNeon = colours.some((h) => typeof h === 'string' && NEON_HEXES.has(h))

  const bike = bikeById(clip(c.bikeId, 40))
  const design = designById(c.designId)
  const kit = c.kit === 'plates' ? 'plates' : 'full'
  const lines = priceLines({ kit, bikeType: bike.type, finish, material, extras, usesNeon })

  const origin = req.headers.origin ?? `https://${req.headers.host}`
  const stripe = new Stripe(key)
  const orderId = `CDL-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 6).toUpperCase()}`
  const logos = (Array.isArray(body?.logos) ? body.logos : [])
    .slice(0, 4)
    .filter((l: { path?: unknown }) => typeof l?.path === 'string' && /^logos\/[\w-]+\.(png|jpg|svg|webp)$/.test(l.path as string))
    .map((l: { name?: unknown; slot?: unknown; path: string }) => ({ name: clip(l.name, 80), slot: clip(l.slot, 20), path: l.path }))

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      currency: 'aed',
      line_items: lines.map((l) => ({
        quantity: 1,
        price_data: {
          currency: 'aed',
          unit_amount: l.amount * 100,
          product_data: { name: l.label, description: l === lines[0] ? `${bike.make} ${bike.model} · ${design.name}` : undefined },
        },
      })),
      phone_number_collection: { enabled: true },
      shipping_address_collection: { allowed_countries: ['AE', 'SA', 'OM', 'QA', 'BH', 'KW'] },
      // Everything the print team needs. Stripe metadata values max 500 chars.
      metadata: {
        kit: kit === 'plates' ? 'Number plates only (front + sides)' : 'Full kit',
        bike: `${bike.make} ${bike.model} (${bike.years})`,
        design: design.name,
        colours: JSON.stringify(c.colors ?? {}).slice(0, 500),
        rider: clip(`${c.rider?.name ?? ''} #${c.rider?.number ?? ''} font:${c.rider?.font ?? ''} plate:${c.rider?.plateColor ?? ''} front:${c.rider?.frontPlateColor ?? c.rider?.plateColor ?? ''} num:${c.rider?.numberColor ?? ''} name:${c.rider?.nameColor ?? ''}`, 500),
        plastics: clip(c.plastics, 20),
        order_id: orderId,
        logos: clip(
          [...logos.map((l: { name: string }) => l.name), ...(Array.isArray(c.layers) ? c.layers : []).filter((l: { logo?: unknown }) => l?.logo).map((l: { name?: unknown }) => String(l.name ?? 'logo'))].join(', '),
          500,
        ),
        notes: clip(c.notes, 500),
        design_link: clip(`${origin}/configurator?d=${body?.share ?? ''}`, 500),
      },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel`,
    })
    // Full order record for the print team (admin page → Orders).
    try {
      await put(
        `orders/${orderId}.json`,
        JSON.stringify({ id: orderId, createdAt: new Date().toISOString(), sessionId: session.id, config: { ...c, logos }, total: lines.reduce((a, l) => a + l.amount, 0), lines }),
        { access: ACCESS, contentType: 'application/json', addRandomSuffix: false },
      )
    } catch (e) {
      // Payment still works without storage; the order details are in Stripe metadata.
      console.error('Order not stored', e)
    }
    return res.status(200).json({ url: session.url })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Could not start checkout' })
  }
}
