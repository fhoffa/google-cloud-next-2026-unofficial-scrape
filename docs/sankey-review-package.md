# Sankey review package

This doc explains how to generate wider Sankey variants from `scripts/make_sankey.py`.

## Variants

Suggested outputs:

- `tmp/sankey-alternatives/sankey-wide-v1-balanced.png`
- `tmp/sankey-alternatives/sankey-wide-v2-extra-space.png`
- `tmp/sankey-alternatives/sankey-wide-v3-max-breathing.png`

## Regenerate

```bash
python3 scripts/make_sankey.py \
  --output tmp/sankey-alternatives/sankey-wide-v1-balanced.png \
  --fig-width 24 \
  --x-positions 0.08,0.34,0.64,0.93 \
  --min-theme-label 12 \
  --min-audience-label 10

python3 scripts/make_sankey.py \
  --output tmp/sankey-alternatives/sankey-wide-v2-extra-space.png \
  --fig-width 28 \
  --x-positions 0.06,0.33,0.66,0.94 \
  --min-theme-label 14 \
  --min-audience-label 12

python3 scripts/make_sankey.py \
  --output tmp/sankey-alternatives/sankey-wide-v3-max-breathing.png \
  --fig-width 32 \
  --x-positions 0.05,0.32,0.67,0.95 \
  --min-theme-label 16 \
  --min-audience-label 14
```

## Handoff checklist for someone else
1. Run the three commands above.
2. Open files from `tmp/sankey-alternatives/` and pick preferred variant.
3. Optional: regenerate with custom spacing/thresholds using `--fig-width`, `--x-positions`, `--min-theme-label`, and `--min-audience-label`.
