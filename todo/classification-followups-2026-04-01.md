# Classification follow-ups — 2026-04-01

Goal: capture concrete misclassification signals from Felipe review so the next classifier-fix PR can target real examples instead of vague prompt tweaking.

## Observed pattern

The current classifier appears biased toward routing sessions into:
- `theme: Data`
- `audience: Data pros`

This seems to happen even when stronger infra/leadership cues are present in the title, description, or topic tags.

There may also be an inconsistency between stored `llm.reasoning` text and the final assigned `theme` / `audience` fields.

---

## Concrete examples

### 1) Self-confidence session looks like leaders, not data pros

URL:
- `https://www.googlecloudevents.com/next-vegas/session/4045147/self-confidence-how-to-overcome-the-“i'm-not-enough-mindset”`

Title:
- `Self-Confidence: How to Overcome the “I'm Not Enough Mindset!”`

Current stored classification:
- `ai_focus: Not AI`
- `theme: Data`
- `audience: Data pros`

Current topic tags:
- `Lounge Sessions`
- `General`
- `Business Intelligence`

Felipe signal:
- “Seems leaders”

Why this looks wrong:
- `Business Intelligence` appears to be over-weighted as a data signal.
- The actual title is a soft-skill / mindset / leadership-oriented session, not a data-practitioner session.

Likely better direction:
- audience should probably be `Leaders`
- theme likely `Business` or another non-technical bucket, but definitely not an automatic `Data`

---

### 2) Google Axion / Arm workloads should be Infra, not Data

URL:
- `https://www.googlecloudevents.com/next-vegas/session/3913066/architect-with-google-axion-a-decision-framework-for-arm-workloads`

Title:
- `Architect with Google Axion: A decision framework for Arm workloads`

Current stored classification:
- `ai_focus: Not AI`
- `theme: Data`
- `audience: Data pros`

Current topic tags include:
- `Compute`
- `DevOps`
- `IT Ops`
- `Platform Engineers`
- `SREs`
- `Infrastructure Architects & Admins`
- `IT Managers & Business Leaders`

Felipe signal:
- “This is infra”

Why this looks wrong:
- Strong infra cues dominate both title and topic tags.
- The description is explicitly about processors, workload fit, machine types, and compute architecture.
- `Database Professionals` should not override the much stronger infra signals.

Likely better direction:
- theme should be `Infra`
- audience should likely be `Infra/Ops`

---

### 3) NVIDIA / Snap experimentation platform seems AI infra

URL:
- `https://www.googlecloudevents.com/next-vegas/session/3920600/how-nvidia-saves-snap-millions-on-its-experimentation-platform`

Title:
- `How NVIDIA saves Snap millions on its experimentation platform`

Current stored classification:
- `ai_focus: Not AI`
- `theme: Data`
- `audience: Data pros`

Current topic tags:
- `Lightning Talks`
- `Customer Story`
- `Technology & Leadership`

Description cues:
- `RAPIDS Accelerator for Apache Spark`
- `NVIDIA GPUs`
- `production workloads`
- `80% cost reduction`
- `CPU-only jobs`

Felipe signal:
- “This seems AI infra”

Why this looks wrong:
- The content is clearly infra / platform / compute-performance oriented.
- It may also qualify as AI-adjacent or AI infra depending on the repo's `ai_focus` definition.
- At minimum, `theme: Data` / `audience: Data pros` is too weak a read.

Likely better direction:
- theme likely `Infra`
- audience likely `Infra/Ops` or possibly `Developers`
- review whether AI infrastructure sessions should count as `ai_focus: AI`

---

## Hypotheses to test in next PR

1. `Business Intelligence` should not automatically force `Data` / `Data pros` when title/description strongly indicate leadership or soft-skill content.
2. Infra-heavy tags such as:
   - `Compute`
   - `DevOps`
   - `IT Ops`
   - `Platform Engineers`
   - `SREs`
   - `Infrastructure Architects & Admins`
   should outrank weak data-adjacent signals such as `Database Professionals`.
3. Sessions about GPUs / accelerators / workloads / platform efficiency may need explicit handling so they do not collapse into generic `Data`.
4. Validate whether `llm.reasoning` can drift from stored labels; one observed session had reasoning text that did not match stored `theme` / `audience`.
5. Add regression tests for the three concrete sessions above.


## Additional suspicious examples from quick scan

- `Architect with Google Axion: A decision framework for Arm workloads`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913066/architect-with-google-axion-a-decision-framework-for-arm-workloads`
  - Suspicion: `leadership, infra` cues but currently classified as `theme: Data`, `audience: Data pros`
  - Topic tags: `Breakouts, Technical, Compute, Database Professionals, DevOps, IT Ops, Platform Engineers, SREs`

- `How NVIDIA saves Snap millions on its experimentation platform`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3920600/how-nvidia-saves-snap-millions-on-its-experimentation-platform`
  - Suspicion: `leadership, infra` cues but currently classified as `theme: Data`, `audience: Data pros`
  - Topic tags: `Lightning Talks, Customer Story, Technology & Leadership`

- `Self-Confidence: How to Overcome the “I'm Not Enough Mindset!”`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/4045147/self-confidence-how-to-overcome-the-“i'm-not-enough-mindset”`
  - Suspicion: `leadership` cues but currently classified as `theme: Data`, `audience: Data pros`
  - Topic tags: `Lounge Sessions, General, Business Intelligence`

- `Build multihost inference systems with Pathways-managed TPUs on GKE`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3971399/build-multihost-inference-systems-with-pathways-managed-tpus-on-gke`
  - Suspicion: `leadership, infra` cues but currently classified as `theme: Data`, `audience: Data pros`
  - Topic tags: `Breakouts, Technical, Architecture, Kubernetes, Data Analysts, Data Scientists, Data Engineers, DevOps`

- `Building an AI supercomputer: Scale Slurm workloads on GKE`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912936/building-an-ai-supercomputer-scale-slurm-workloads-on-gke`
  - Suspicion: `leadership, infra` cues but currently classified as `theme: Data`, `audience: Data pros`
  - Topic tags: `Discussion Groups, Advanced Technical, Kubernetes, Cloud Runtimes, Data Analysts, Data Scientists, Data Engineers, DevOps`

- `CPU infrastructure for the age of inference: Lessons from industry leaders`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913144/cpu-infrastructure-for-the-age-of-inference-lessons-from-industry-leaders`
  - Suspicion: `leadership, infra` cues but currently classified as `theme: Data`, `audience: Data pros`
  - Topic tags: `Breakouts, Introductory, Compute, Migration, Database Professionals, DevOps, IT Ops, Platform Engineers`

- `Architecting with Ray on GKE: Apple's playbook`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912908/architecting-with-ray-on-gke-apple's-playbook`
  - Suspicion: `leadership, infra` cues but currently classified as `theme: Data`, `audience: Data pros`
  - Topic tags: `Breakouts, Technical, Kubernetes, Cloud Runtimes, Application Developers, Data Analysts, Data Scientists, Data Engineers`

- `Empowering women tech-makers: Build a cloud-powered future`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912930/empowering-women-tech-makers-build-a-cloud-powered-future`
  - Suspicion: `leadership, infra` cues but currently classified as `theme: Data`, `audience: Data pros`
  - Topic tags: `Breakouts, General, Workspace, Agents, Data Analysts, Data Scientists, Data Engineers, Database Professionals`

## Suggested next PR scope

- tighten classification rules/prompt for infra vs data vs leadership
- decide and document how `AI infrastructure` maps into `ai_focus`
- add regression fixtures/tests for these sessions
- regenerate classified output and insights artifacts
