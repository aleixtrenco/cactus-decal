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
| Prices (placeholders) | `src/data/pricing.ts` |
| Contact details, FAQ answers | `src/data/site.ts` |
| Bike models and fitment years | `src/data/bikes.ts` |
| Designs and colour swatches | `src/data/designs.ts` |
| "Built for UAE heat" claims, material specs | `src/pages/Home.tsx`, `src/data/pricing.ts` |

## Bike templates (SVG)

Upload one SVG per model in `/admin` → Bike templates. The template's panel shapes replace the built-in ones in the 3D preview, the customer proof and the print file.

1. Side view of the bike (right-hand side), panels placed as they sit on the bike. Units in mm.
2. Name each panel shape in the Layers panel: `shroud`, `side-plate`, `rear-fender`, `front-fender`. Other named shapes (`airbox`, `fork-guard`, ...) are printed too but not shown in 3D. Name the front number plate `front-plate` (it can sit anywhere on the artboard).
3. Add two small circles named `rear-axle` and `front-axle` at the wheel centres. They set the exact scale.
4. Shapes named `guide`, `bleed` or `background` are ignored.
5. Illustrator: File › Save As › SVG. Styling: Presentation Attributes. Object IDs: Layer Names.

After uploading you see the template on the 3D bike and both proofs. You can download a test print file before you publish.

## Print files

`/admin` → Orders → **Print file** downloads an SVG that opens directly in Adobe Illustrator (save it as .ai from there):

- `PRINT`: artwork for both sides (left side mirrored) and the front plate, masked to the exact template outlines with 3 mm bleed.
- `CUT`: template outlines as magenta cut lines.
- `INFO`: order details.

All lettering is converted to vector outlines, and customer logos are embedded. The design artwork is fully vector.

Only the team can download print files. Customers get a picture proof.

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
