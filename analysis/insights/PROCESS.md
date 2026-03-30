# Insights analysis process

This folder captures the current analysis work for the Google Cloud Next insights/Sankey exploration.

## What is in this folder

- `make_sankey.py` — reproducible chart generator
- `classified_sessions.json` — current classified session database used for validation and charting
- `README.md` — current methodology and rule notes

## Current process

1. Start from the latest session dataset (`sessions/latest.json`)
2. Classify each session into:
   - `AI` vs `Not AI`
   - theme bucket
   - audience bucket
3. Validate the classification by checking representative examples for each important visible segment
4. Generate Sankey visuals from the classified database
5. Review whether the chart is both:
   - analytically defensible
   - visually interesting / understandable

## Important review standard going forward

We should not accept a classifier change only because aggregate counts look nicer.

Every meaningful classifier update should be reviewed with:

### 1. Example review
Check representative session examples for important buckets, especially:
- `AI > App dev > Developers`
- `AI > Business > Leaders`
- `AI > Infra > Infra/Ops`
- `Not AI > Security > Security`
- `Not AI > Data > Data`
- any suspicious bucket that looks semantically mixed

If examples look wrong, the classifier is wrong.

### 2. Site-tag alignment
When possible, prefer the conference site's own tags over overfitted inference.
Examples:
- `App Dev`
- `Application Developers`
- `Security Professionals`
- `IT Managers & Business Leaders`
- `Platform Engineers`, `SREs`, `IT Ops`

### 3. Conservative inference
Use inference only when the official tags are missing or genuinely ambiguous.
Hard title overrides are acceptable when phrasing is explicit, for example:
- `for developers`
- `developer meetup`
- `for leaders`

### 4. Room as weak prior only
Room can be a tie-break signal, not a primary source of truth.

### 5. Visual review
The chart itself should be reviewed for:
- readability
- label redundancy
- whether the 4th layer is actually adding a new dimension
- whether the chart communicates something interesting

## Next implementation direction

Before shipping `/insights` publicly, we should:

1. stabilize the classifier in code
2. generate representative examples per visible segment
3. review the examples manually
4. only then wire the Sankey into the product surface

## Product direction discussed

Likely shape:
- keep the main explorer as the main page
- add a separate `/insights` page for shareability and social previews
- use the Sankey there
- make segments link back to filtered session views
