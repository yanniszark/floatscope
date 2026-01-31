# FloatScope

## Tech Stack

- **Framework**: Next.js 16 (App Router) with React 19
- **Language**: TypeScript (strict mode)
- **Styling**: CSS Modules (`*.module.css`) — ships with Next.js, no extra dependencies
- **Validation**: Python [gfloat](https://github.com/graphcore-research/gfloat) library for reference tables

## Commands

```bash
# Install dependencies
npm install

# Run dev server (http://localhost:3000)
npm run dev

# Production build
npm run build

# Start production server
npm start

# Validate float conversions against gfloat reference tables
# (requires Python venv setup — see below)
npx tsx validate.ts
```

## Validation Setup

The validation script compares our TypeScript conversion logic against the Python `gfloat` library.

```bash
# Create venv and install gfloat (one-time)
python3 -m venv .venv
.venv/bin/pip install gfloat

# Generate reference tables from gfloat
.venv/bin/python3 generate_reference.py

# Run validation (decode + round-trip for all bit patterns)
npx tsx validate.ts
```

## Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Main page (client component)
│   ├── page.module.css     # Page styles
│   └── globals.css         # Global styles / CSS variables
└── lib/
    └── float.ts            # Core conversion logic
```

## Supported Formats

| Format     | Bits | Sign | Exp | Mant | Bias | Special Values                              |
|------------|------|------|-----|------|------|---------------------------------------------|
| f8e5m2     | 8    | 1    | 5   | 2    | 15   | IEEE: Inf (mant=0) + NaN (mant≠0)          |
| f8e4m3     | 8    | 1    | 4   | 3    | 7    | All-NaN: all max-exp patterns are NaN       |
| f8e4m3fn   | 8    | 1    | 4   | 3    | 7    | FN: only S_1111_111 is NaN, rest are finite |
| f4e2m1     | 4    | 1    | 2   | 1    | 1    | None: all bit patterns are finite           |
| f32        | 32   | 1    | 8   | 23   | 127  | IEEE: Inf (mant=0) + NaN (mant≠0)          |

## Special Value Modes (`specialValues` in `FloatFormat`)

- `"ieee"` — mantissa=0 → ±Inf, mantissa≠0 → NaN
- `"all-nan"` — all max-exponent patterns are NaN, no Inf
- `"fn"` — only max-exponent + max-mantissa is NaN, rest are finite
- `"none"` — no special values, all bit patterns are valid finite numbers
