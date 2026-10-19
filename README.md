# Cactus Decal Lab

Website and live 3D graphics configurator for Cactus Decal Lab, Dubai.

- **Home page**: hero with a live 3D bike, design gallery, finishes, FAQ.
- **Configurator** (`/configurator`): bike → design → colours → name & number → logos → kit & finish → review & pay. Live 3D preview, 2D proof, instant AED price, save/share link.
- **Checkout**: Stripe Checkout in AED (card, Apple Pay, Google Pay).
- **Team area** (`/admin`, password protected): upload bike templates, see orders, download print files for Illustrator.

Built with React, Vite, three.js (react-three-fiber) and Framer Motion. Server functions in `api/` run on Vercel.

## Things to update before launch

| What | Where |
|---|---|
| Kit prices (AED 900 motocross, AED 1,300 trail) and the placeholder finish/extra prices | `src/data/pricing.ts` |
| Contact details, FAQ answers | `src/data/site.ts` |
| Bike models and fitment years | `src/data/bikes.ts` |
| Designs and colour swatches | `src/data/designs.ts` |
| "Built for UAE heat" claims, material specs | `src/pages/Home.tsx`, `src/data/pricing.ts` |

## Bike templates (SVG)

Upload each model's normal cut file in `/admin` → Bike templates. The layout is the usual one: the bike's right side on the left half, the left side mirrored on the right half, front plate and front fender in the middle.

- No layer names needed. Every filled shape becomes a piece. The shroud, side plate, rear fender, front fender and front plate are found automatically.
- The piece map in `/admin` shows what was found. Click a piece to correct it.
- The real outlines are placed on the 3D bike and the proofs. Each piece gets its part of the design, so the design flows from shroud to rear fender like a printed kit.
- The original SVG is stored privately. Only an outline copy (for the 3D preview) is public.

Outline copies for four models are already included in `public/templates/` (Honda CRF250R/RX · CRF450R/RX 2025, Husqvarna TC/FC/FS 2016–2022, GasGas MC 85 2021–2024, Kawasaki KX250 2025 / KX450 2024–2025). Upload the original SVGs for these in `/admin` too, so print files use the exact cut lines.

## Print files

`/admin` → Orders → **Print file** downloads an SVG on your template's own artboard, which opens directly in Adobe Illustrator (save it as .ai from there):

- `PRINT`: each piece filled with its part of the design, masked to the exact piece outline with a small bleed. Number, name, make lettering and logos go only on shrouds, side plates and rear fenders. Trim pieces get the pattern only.
- `CUT`: every piece outline as a magenta cut line.
- `INFO`: order details under the artboard.

All lettering is converted to vector outlines and customer logos are embedded. Only the team can download print files. Customers get a picture proof.

## Run locally

```bash
npm install
npm run dev          # http://localhost:5173 (no payments/admin storage locally)
```

## Deploy (Vercel)

1. Push this folder to a GitHub repository.
2. On vercel.com: Add New › Project › import the repository. Framework: Vite (auto-detected).
3. Storage tab › Create › Blob store and connect it to the project. This stores templates, logos and orders, all private.
4. Settings › Environment Variables: add `STRIPE_SECRET_KEY` and `ADMIN_PASSWORD` (see `.env.example`).
5. Deploy. Test a payment with Stripe's test card `4242 4242 4242 4242`, then switch to your live key.

Static preview build (no server, hash URLs): `VITE_HASH_ROUTER=1 npx vite build`.
