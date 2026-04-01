# Classification audit notes — 2026-04-01

A narrow follow-up audit after Felipe flagged several sessions that felt obviously misclassified. The goal here is not to re-label the whole conference by instinct; it is to identify concrete failure modes, collect strong counterexamples, and make the next classifier-fix PR more surgical.

## What looks broken

The classifier appears to be overusing `theme: Data` and `audience: Data pros` when any data-adjacent tag is present, even when the session title, description, and broader topic tags point more strongly to infrastructure, platform/ops, or leadership.

A second issue also shows up: some stored `llm.reasoning` strings do not appear to agree with the final stored labels. That suggests either post-processing drift or stale reasoning text.

## Quick numbers from this audit pass

- Heuristic scan found **95** suspicious sessions currently stored as `theme: Data`, `audience: Data pros` but showing strong infra and/or leadership cues.
- Simple reasoning-vs-label mismatch check found **43** suspicious records.

These numbers are not meant as final truth; they are meant to show this is not just a 2–3 session anomaly.

## Showcase examples Felipe already surfaced

### Self-Confidence: How to Overcome the “I'm Not Enough Mindset!”

- URL: `https://www.googlecloudevents.com/next-vegas/session/4045147/self-confidence-how-to-overcome-the-“i'm-not-enough-mindset”`
- Current classification: `ai_focus: Not AI`, `theme: Data`, `audience: Data pros`
- Why it is suspicious: `leadership`
- Topic tags: `Lounge Sessions, General, Business Intelligence`
- Description cue: “Even the most successful leaders often struggle with the "I'm not enough" narrative, a mindset that quietly sabotages influence and decision-making. Join Nada Lena Nasserdeen, founder of Rise Up For You, to dismantle the limiting beliefs holding you back. In t...”

### Architect with Google Axion: A decision framework for Arm workloads

- URL: `https://www.googlecloudevents.com/next-vegas/session/3913066/architect-with-google-axion-a-decision-framework-for-arm-workloads`
- Current classification: `ai_focus: Not AI`, `theme: Data`, `audience: Data pros`
- Why it is suspicious: `leadership, infra`
- Topic tags: `Breakouts, Technical, Compute, Database Professionals, DevOps, IT Ops, Platform Engineers, SREs, Infrastructure Architects & Admins, IT Managers & Business Leaders, Customer Story, Technology & Leadership`
- Description cue: “Moving to Arm shouldn’t be a guessing game. Join experts for a breakdown of the Google Axion custom Arm-based processor family and how to map it to your specific workload requirements. We’ll examine the architectural differences between the cost-optimized N fa...”

### How NVIDIA saves Snap millions on its experimentation platform

- URL: `https://www.googlecloudevents.com/next-vegas/session/3920600/how-nvidia-saves-snap-millions-on-its-experimentation-platform`
- Current classification: `ai_focus: Not AI`, `theme: Data`, `audience: Data pros`
- Why it is suspicious: `leadership, infra`
- Topic tags: `Lightning Talks, Customer Story, Technology & Leadership`
- Description cue: “We'll detail our journey, achievements, and insights gained from implementing the RAPIDS Accelerator for Apache Spark across Snap's most substantial data processing pipelines. A significant cost reduction of 80% has been realized on NVIDIA GPUs in comparison t...”

### Build multihost inference systems with Pathways-managed TPUs on GKE

- URL: `https://www.googlecloudevents.com/next-vegas/session/3971399/build-multihost-inference-systems-with-pathways-managed-tpus-on-gke`
- Current classification: `ai_focus: AI`, `theme: Data`, `audience: Data pros`
- Why it is suspicious: `leadership, infra`
- Topic tags: `Breakouts, Technical, Architecture, Kubernetes, Data Analysts, Data Scientists, Data Engineers, DevOps, IT Ops, Platform Engineers, SREs, Infrastructure Architects & Admins`
- Description cue: “Serving modern large language models often requires inference to scale beyond a single accelerator host. Multihost inference introduces challenges such as coordinating execution across hosts, efficiently loading large model checkpoints, and maintaining low lat...”

### Building an AI supercomputer: Scale Slurm workloads on GKE

- URL: `https://www.googlecloudevents.com/next-vegas/session/3912936/building-an-ai-supercomputer-scale-slurm-workloads-on-gke`
- Current classification: `ai_focus: AI`, `theme: Data`, `audience: Data pros`
- Why it is suspicious: `leadership, infra`
- Topic tags: `Discussion Groups, Advanced Technical, Kubernetes, Cloud Runtimes, Data Analysts, Data Scientists, Data Engineers, DevOps, IT Ops, Platform Engineers, SREs, Infrastructure Architects & Admins`
- Description cue: “Dive into the architecture of running Slurm on GKE for large-scale AI training. We will detail the new Managed Slinky architecture and its deep integration with Google’s AI Hypercomputer stack—including Cluster Director and native TPU support. Learn how to com...”

### CPU infrastructure for the age of inference: Lessons from industry leaders

- URL: `https://www.googlecloudevents.com/next-vegas/session/3913144/cpu-infrastructure-for-the-age-of-inference-lessons-from-industry-leaders`
- Current classification: `ai_focus: AI`, `theme: Data`, `audience: Data pros`
- Why it is suspicious: `leadership, infra`
- Topic tags: `Breakouts, Introductory, Compute, Migration, Database Professionals, DevOps, IT Ops, Platform Engineers, SREs, Infrastructure Architects & Admins, IT Managers & Business Leaders, Customer Story`
- Description cue: “General-purpose compute is emerging as the critical engine for the age of inference. Join this session to learn firsthand from industry leaders who have successfully implemented a workload-optimized approach to power their AI stacks. We’ll cover topics ranging...”

### Architecting with Ray on GKE: Apple's playbook

- URL: `https://www.googlecloudevents.com/next-vegas/session/3912908/architecting-with-ray-on-gke-apple's-playbook`
- Current classification: `ai_focus: AI`, `theme: Data`, `audience: Data pros`
- Why it is suspicious: `leadership, infra`
- Topic tags: `Breakouts, Technical, Kubernetes, Cloud Runtimes, Application Developers, Data Analysts, Data Scientists, Data Engineers, DevOps, IT Ops, Platform Engineers, SREs`
- Description cue: “Building multi-tenant AI platforms is complex, often forcing teams to manage infrastructure instead of improving models. Google Kubernetes Engine (GKE) provides a highly scalable environment to solve this problem. In this session, Apple shares their playbook. ...”

### Empowering women tech-makers: Build a cloud-powered future

- URL: `https://www.googlecloudevents.com/next-vegas/session/3912930/empowering-women-tech-makers-build-a-cloud-powered-future`
- Current classification: `ai_focus: AI`, `theme: Data`, `audience: Data pros`
- Why it is suspicious: `leadership, infra`
- Topic tags: `Breakouts, General, Workspace, Agents, Data Analysts, Data Scientists, Data Engineers, Database Professionals, Infrastructure Architects & Admins, IT Managers & Business Leaders, Technology & Leadership`
- Description cue: “How can cloud technology accelerate your career? Join leaders from Women Techmakers (WTM) to break down cloud fundamentals and discover how WTM resources build technical confidence. Whether you’re a student or a career-changer, you’ll learn to use cloud tools ...”

## Additional high-confidence suspects worth spot-checking

- `Accelerate large-scale model pretraining and reinforcement learning fine-tuning`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912998/accelerate-large-scale-model-pretraining-and-reinforcement-learning-fine-tuning`
  - Current classification: `ai_focus: AI`, `theme: Data`, `audience: Data pros`
  - Why it is suspicious: `leadership, infra`
  - Tags: `Breakouts, Introductory, Compute, Data Analysts, Data Scientists, Data Engineers, Infrastructure Architects & Admins, Technology & Leadership`

- `Accelerating alpha: Citadel's hybrid HPC and AI strategy`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913010/accelerating-alpha-citadel's-hybrid-hpc-and-ai-strategy`
  - Current classification: `ai_focus: AI`, `theme: Data`, `audience: Data pros`
  - Why it is suspicious: `leadership, infra`
  - Tags: `Breakouts, Technical, Compute, Data Analysts, Data Scientists, Data Engineers, DevOps, IT Ops, Platform Engineers, SREs`

- `Build data-rich AI on GKE: A deep dive with ClickHouse and Character.AI`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912933/build-data-rich-ai-on-gke-a-deep-dive-with-clickhouse-and-character.ai`
  - Current classification: `ai_focus: AI`, `theme: Data`, `audience: Data pros`
  - Why it is suspicious: `leadership, infra`
  - Tags: `Breakouts, Technical, Kubernetes, Cloud Runtimes, Data Analysts, Data Scientists, Data Engineers, DevOps, IT Ops, Platform Engineers`

- `Scale multimodal AI: Serverless data-parallel ML with Dataflow`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912290/scale-multimodal-ai-serverless-data-parallel-ml-with-dataflow`
  - Current classification: `ai_focus: AI`, `theme: Data`, `audience: Data pros`
  - Why it is suspicious: `leadership, infra`
  - Tags: `Breakouts, Technical, Data Analytics, Serverless, Data Analysts, Data Scientists, Data Engineers, DevOps, IT Ops, Platform Engineers`

- `Scale open model serving on TPUs`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913115/scale-open-model-serving-on-tpus`
  - Current classification: `ai_focus: AI`, `theme: Data`, `audience: Data pros`
  - Why it is suspicious: `leadership, infra`
  - Tags: `Breakouts, Introductory, Compute, Open Models, Data Analysts, Data Scientists, Data Engineers, Infrastructure Architects & Admins, Technology & Leadership, Telecommunications`

- `Scaling Claude: Inside Anthropic's TPU strategy and architecture`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913022/scaling-claude-inside-anthropic's-tpu-strategy-and-architecture`
  - Current classification: `ai_focus: AI`, `theme: Data`, `audience: Data pros`
  - Why it is suspicious: `leadership, infra`
  - Tags: `Breakouts, Technical, Architecture, Compute, Database Professionals, DevOps, IT Ops, Platform Engineers, SREs, Infrastructure Architects & Admins`

- `Scaling inference for reasoning models & agents with NVIDIA on GKE`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/4033905/scaling-inference-for-reasoning-models-agents-with-nvidia-on-gke`
  - Current classification: `ai_focus: AI`, `theme: Data`, `audience: Data pros`
  - Why it is suspicious: `leadership, infra`
  - Tags: `Breakouts, Technical, Compute, Kubernetes, Storage, Open Models, Agents, Application Developers, Data Analysts, Data Scientists`

- `Unlock high-performance AI with the new Cloud TPU experience`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913072/unlock-high-performance-ai-with-the-new-cloud-tpu-experience`
  - Current classification: `ai_focus: AI`, `theme: Data`, `audience: Data pros`
  - Why it is suspicious: `leadership, infra`
  - Tags: `Breakouts, Technical, Compute, Open Models, Data Analysts, Data Scientists, Data Engineers, Infrastructure Architects & Admins, Partner Innovation, Technology & Leadership`

- `What's new in streaming: Real-time data for agentic AI`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912220/what's-new-in-streaming-real-time-data-for-agentic-ai`
  - Current classification: `ai_focus: AI`, `theme: Data`, `audience: Data pros`
  - Why it is suspicious: `leadership, infra`
  - Tags: `Breakouts, Introductory, Data Analytics, Data Analysts, Data Scientists, Data Engineers, DevOps, IT Ops, Platform Engineers, SREs`

- `Automate BigQuery optimization for continuous cost efficiency`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3917596/automate-bigquery-optimization-for-continuous-cost-efficiency`
  - Current classification: `ai_focus: AI`, `theme: Data`, `audience: Data pros`
  - Why it is suspicious: `leadership, infra`
  - Tags: `Lightning Talks, Technical, Cost Optimization, Data Analysts, Data Scientists, Data Engineers, DevOps, IT Ops, Platform Engineers, SREs`

## Reasoning-vs-label mismatch examples

- `Achieve state-of-the-art inference: High performance on TPUs and GPUs with llm-d`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912927/achieve-state-of-the-art-inference-high-performance-on-tpus-and-gpus-with-llm-d`
  - Stored labels: `theme: Infra`, `audience: Infra/Ops`
  - Stored reasoning: `AI/ML focus; Business theme and General audience based on title, description, and topic tags.`

- `Agents that deliver outcomes`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3895089/agents-that-deliver-outcomes`
  - Stored labels: `theme: Business`, `audience: Leaders`
  - Stored reasoning: `AI/ML focus; Business theme and General audience based on title, description, and topic tags.`

- `AI Hypercomputer: Resilient AI infrastructure at scale`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913036/ai-hypercomputer-resilient-ai-infrastructure-at-scale`
  - Stored labels: `theme: Infra`, `audience: Infra/Ops`
  - Stored reasoning: `AI/ML focus; Infra theme and General audience based on title, description, and topic tags.`

- `AI-Powered Google Cloud Platform architecture diagramming platform`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3908814/ai-powered-google-cloud-platform-architecture-diagramming-platform`
  - Stored labels: `theme: Infra`, `audience: Infra/Ops`
  - Stored reasoning: `AI/ML focus; Infra theme and General audience based on title, description, and topic tags.`

- `Antigravity for Enterprise Development`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3991537/antigravity-for-enterprise-development`
  - Stored labels: `theme: App dev`, `audience: Developers`
  - Stored reasoning: `AI (Antigravity is Google AI coding tool); Business theme and General audience based on title, description, and topic tags.`

- `Automating the UI with Gemini CLI, MCP and Skills`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3909329/automating-the-ui-with-gemini-cli-mcp-and-skills`
  - Stored labels: `theme: Business`, `audience: Developers`
  - Stored reasoning: `AI/ML focus; Business theme and General audience based on title, description, and topic tags.`

- `Build a multi-agent PR roaster with Antigravity & ADK`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3931994/build-a-multi-agent-pr-roaster-with-antigravity-adk`
  - Stored labels: `theme: Business`, `audience: Developers`
  - Stored reasoning: `AI/ML focus; Business theme and General audience based on title, description, and topic tags.`

- `Build and govern your Autonomous Workforce on ServiceNow powered by Gemini`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3964832/build-and-govern-your-autonomous-workforce-on-servicenow-powered-by-gemini`
  - Stored labels: `theme: Business`, `audience: Leaders`
  - Stored reasoning: `AI/ML focus; Business theme and General audience based on title, description, and topic tags.`

## Double-checks this suggests for the next PR

1. **Infra should outrank weak data signals**
   - If tags include things like `Compute`, `Kubernetes`, `Platform Engineers`, `SREs`, `Infrastructure Architects & Admins`, `IT Ops`, or `DevOps`, the classifier should not casually fall back to `Data / Data pros` just because `Database Professionals` or `Data Analytics` also appears.

2. **Leadership should not be swallowed by Business Intelligence**
   - Tags like `Business Intelligence` seem too able to drag obviously leadership-oriented or soft-skill sessions into `Data pros`. That should be resisted when the title/description are about confidence, women in tech, executive framing, or broader career/leadership themes.

3. **AI infrastructure needs an explicit policy**
   - Sessions about TPUs, GPUs, inference systems, Slurm on GKE, Ray on GKE, and training infrastructure are a gray area if `ai_focus` is underspecified. The next PR should define whether those are `AI` because they serve AI workloads, or `Not AI` because they are infrastructure-first.

4. **Reasoning text may be stale or post-processed incorrectly**
   - If the saved `reasoning` says `Business theme and General audience` but the saved labels are `Data / Data pros`, something is drifting. The next PR should verify whether reasoning and stored labels are produced in the same pass and remain aligned.

5. **Regression tests should use named real sessions**
   - The next PR should pin a few specific sessions (leadership, infra, AI-infra boundary) so the classifier cannot quietly slide back into `Data / Data pros` after later prompt tweaks.
