# Cactus Decal Lab

Website and live 3D graphics configurator for Cactus Decal Lab, Dubai.

- **Home page**: hero with the live 3D Honda CRF 450 in its stock look with the Cactus Decal logo on the shrouds (`public/logo.png`), customer builds, pricing, finishes, FAQ.
- **Configurator** (`/configurator`): 4 steps, bike → design → kit & finish → review & pay. Every kit starts blank; on the design step the customer clicks a piece of the template to colour it, switch on its ready-made areas (and nudge, turn or resize them), and add shapes, text, logos and photos, plus their number and name. The bike make is no longer written as text (brand logo files will replace it). Customers who already have a kit as a picture can upload its flat print layout (PNG/JPG): each piece is found, matched to the same piece of their model and fitted into its cut outline (`src/lib/importDesign.ts`). Live 3D preview, 2D proof, instant AED price, save/share link.
- **Checkout**: Stripe Checkout in AED (card, Apple Pay, Google Pay).
- **Team area** (`/admin`, password protected): upload bike templates, see orders, download print files for Illustrator.

Built with React, Vite, three.js (react-three-fiber) and Framer Motion. Server functions in `api/` run on Vercel.

## Things to update before launch

| What | Where |
|---|---|
| Kit prices (AED 900 motocross, AED 1,300 trail, AED 400 number plates only) and the placeholder finish/extra prices | `src/data/pricing.ts` |
| Contact details, FAQ answers | `src/data/site.ts` |
| Bike models and fitment years | `src/data/bikes.ts` |
| Colour swatches | `src/data/designs.ts` |
| Lettering fonts: 21 bundled (add your own `.woff` the same way), plus the online Fontsource library of 1,500+ open-licence fonts under "More fonts…" | `src/data/fonts.ts`, `src/data/fontIds.ts`, `src/main.tsx` |
| "Built for UAE heat" claims, material specs | `src/pages/Home.tsx`, `src/data/pricing.ts` |

## Bike templates (SVG)

Upload each model's normal cut file in `/admin` → Bike templates. The layout is the usual one: the bike's right side on the left half, the left side mirrored on the right half, front plate and front fender in the middle.

- No layer names needed. Every filled shape becomes a piece. The shroud, side plate, rear fender, front fender and front plate are found automatically.
- The piece map in `/admin` shows what was found. Click a piece to correct it.
- Every part gets ready-made colour areas (bands, blocks, stripes, edge trim, a backing behind the number, fender tip and checkers) made from that piece's own outline and its placement on the bike, so they fit each model with nothing to align. Change the shapes in `src/lib/zones.ts`.
- The real outlines are placed on the 3D bike and the proofs. Each piece gets its part of the design, so the design flows from shroud to rear fender like a printed kit.
- The original SVG is stored privately. Only an outline copy (for the 3D preview) is public.

Outline copies for these models are already included in `public/templates/` (Honda CRF250R/RX · CRF450R/RX 2025, Honda CRF1000L Africa Twin 2015–2019, Honda CRF1100L Africa Twin Adventure Sports 2020–2023, Husqvarna TC/FC/FS 2016–2022, Husqvarna TC 65 2024, Yamaha YZ85 2022–2024, GasGas MC 85 2021–2024, Kawasaki KX250 2025 / KX450 2024–2025). Upload the original SVGs for these in `/admin` too, so print files use the exact cut lines.

## 3D bike models

Each bike can show a real 3D model instead of the built-in bike. Upload a `.glb` in `/admin` → the bike → **3D model**, then press **Auto-place on model** and fine-tune by dragging.

One model per brand is enough: every bike of the same make without its own model shows that brand's model (all Husqvarnas use the Husqvarna model), while each bike's own template still decides the printed pieces. To line a template's pieces up exactly on the brand model, open it in `/admin` and press **Use the <brand> model**.

- Phones load a lighter copy with smaller textures when the template sets `model.mobileUrl` (make one with `python3 tools/glb_lite.py in.glb out-m.glb 512`).
- The front fender is projected from above; its area on the model is found automatically.

- Any model works, with no special UVs needed. If it has a material named like `livery` or `plastic`, only that material gets the graphics, and its original artwork is replaced by the chosen plastics colour.
- Blender files: `pip install bpy`, then `python tools/blend2glb.py in.blend out.glb "Dark Plastics=Dark Trim"` (renames are optional: only materials named like *livery/plastic/decal* get graphics), then compress with gltfpack as below.
- Other formats: `.usdz` → `tools/usd2glb.py` (needs `pip install usd-core numpy pillow`), then `npx gltfpack -i in.glb -o out.glb -cc` to compress. FBX/OBJ: export as glTF Binary from Blender.
- Bundled: `public/models/husq-tcfc-16.glb` (2022 Husqvarna FS 450, converted from the supplied USDZ). Check the source licence allows commercial use before launch.
- Bundled: `public/models/honda-crf.glb` (+ `-m` phone copy), "FREE Honda CRF 450" by Jacobdesigns on Sketchfab, CC BY 4.0: keep the credit in the site footer. Its materials were renamed so only the shrouds, fenders and number plates take graphics. The original "BACKYARD" lettering and maker's tag were painted out of its textures with `tools/glb_retouch.py`. Set as the Honda motocross model (`types: ["MX"]` in `crf-25.json`), so Honda trail bikes won't use it.
- Bundled: `public/models/ktm-790-adv.glb` (+ `-m` phone copy), "KTM 790 Adv R Rally 2020" by espero7757 on Sketchfab, CC BY 4.0: keep the footer credit. It is a photo scan with one texture, so the plastics were split out by colour (orange, white and blue charts on the body) and the scanned ground cropped away; pieces of `ktm-adv-19.json` are fitted by hand.
- Bundled: `public/models/honda-africa-twin.glb` (+ `-m` phone copy), "2023 Honda CRF1100L Africa Twin" by VTX on Sketchfab, **CC BY-NC-SA 4.0 (non-commercial)**: get the author's permission or replace it before launch, and keep the footer credit while it is used. Made with `tools/africa_twin_livery.py`: the panniers are removed, and the red, blue and striped bodywork plus the black side panels under the template pieces become the livery. Used for the CRF1100L Africa Twin Adventure Sports (`crf1100-adv-20.json`, `types: ["Trail"]`) and CRF1000L Africa Twin 2015–2019 (`crf1000-at-15.json`) templates, whose pieces are fitted by hand; pass both template files to the script when rebuilding the model. The model is the standard Africa Twin, so the Adventure Sports and CRF1000L tank and fairing pieces are close but not exact on it.

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
