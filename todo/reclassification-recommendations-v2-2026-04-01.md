# Reclassification recommendations v2 — 2026-04-01

These recommendations are based on the semantic-only embedding audit (v2). They intentionally avoid blanket relabeling and only include sessions where title/description/tags and nearest-neighbor evidence align.

Recommended changes in this pass: **5**

## Accelerate agent development with Gemini CLI, MCP, and Weave

- URL: `https://www.googlecloudevents.com/next-vegas/session/3893725/accelerate-agent-development-with-gemini-cli-mcp-and-weave`
- Current: `{'ai_focus': 'AI', 'theme': 'Data', 'audience': 'Data pros', 'reasoning': 'AI/ML focus; Data theme and Data pros audience based on title, description, and topic tags.'}`
- Proposed: `{'ai_focus': 'AI', 'theme': 'App dev', 'audience': 'Developers', 'reasoning': 'AI/ML focus; Data theme and Data pros audience based on title, description, and topic tags.'}`
- Why: developer/build/deploy cues align with App dev neighborhood
- Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'App dev', 'count': 6}, 'audience': {'label': 'Developers', 'count': 6}}`

## Build and scale AI infrastructure with Compute Engine, Hyperdisk ML, and GKE

- URL: `https://www.googlecloudevents.com/next-vegas/session/3913126/build-and-scale-ai-infrastructure-with-compute-engine-hyperdisk-ml-and-gke`
- Current: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Infra theme and Leaders audience based on title, description, and topic tags.'}`
- Proposed: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Infra/Ops', 'reasoning': 'AI/ML focus; Infra theme and Leaders audience based on title, description, and topic tags.'}`
- Why: infra session with strong Infra/Ops neighbor consensus
- Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Infra', 'count': 7}, 'audience': {'label': 'Infra/Ops', 'count': 6}}`

## Build fast, run lean: Accelerate development with Gemini and Cloud Run

- URL: `https://www.googlecloudevents.com/next-vegas/session/3912295/build-fast-run-lean-accelerate-development-with-gemini-and-cloud-run`
- Current: `{'ai_focus': 'AI', 'theme': 'App dev', 'audience': 'Infra/Ops', 'reasoning': 'AI/ML focus; App dev theme and Infra/Ops audience based on title, description, and topic tags.'}`
- Proposed: `{'ai_focus': 'AI', 'theme': 'App dev', 'audience': 'Developers', 'reasoning': 'AI/ML focus; App dev theme and Infra/Ops audience based on title, description, and topic tags.'}`
- Why: App dev neighborhood strongly points to Developers audience
- Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'App dev', 'count': 7}, 'audience': {'label': 'Developers', 'count': 6}}`

## Beyond migration: Engineering the self-optimizing enterprise

- URL: `https://www.googlecloudevents.com/next-vegas/session/3920346/beyond-migration-engineering-the-self-optimizing-enterprise`
- Current: `{'ai_focus': 'AI', 'theme': 'Data', 'audience': 'Data pros', 'reasoning': 'AI/ML focus; Data theme and Data pros audience based on title, description, and topic tags.'}`
- Proposed: `{'ai_focus': 'AI', 'theme': 'Business', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Data theme and Data pros audience based on title, description, and topic tags.'}`
- Why: leadership/soft-skill cues dominate over weak data-adjacent tags
- Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Business', 'count': 4}, 'audience': {'label': 'Leaders', 'count': 6}}`

## DeepMind startup workshop: Building agents with Gemini and Antigravity

- URL: `https://www.googlecloudevents.com/next-vegas/session/3909245/deepmind-startup-workshop-building-agents-with-gemini-and-antigravity`
- Current: `{'ai_focus': 'AI', 'theme': 'Applied AI', 'audience': 'Developers', 'reasoning': 'AI focus; Applied AI theme — agent/voice/chatbot use case with Applied AI tag, no App Dev tag.'}`
- Proposed: `{'ai_focus': 'AI', 'theme': 'App dev', 'audience': 'Developers', 'reasoning': 'AI focus; Applied AI theme — agent/voice/chatbot use case with Applied AI tag, no App Dev tag.'}`
- Why: builder/workshop semantics cluster with App dev more than Applied AI
- Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'App dev', 'count': 7}, 'audience': {'label': 'Developers', 'count': 7}}`

