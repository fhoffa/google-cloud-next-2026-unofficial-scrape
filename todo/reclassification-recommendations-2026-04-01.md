# Reclassification recommendations — 2026-04-01

Conservative recommendations from the embedding audit. These are not blanket cluster-driven relabels; they are the subset where title/description/topic cues and embedding neighborhood point in the same direction.

Recommended changes in this pass: **5**

## AI training and inference

- URL: `https://www.googlecloudevents.com/next-vegas/session/3920416/ai-training-and-inference`
- Current: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Infra theme and Leaders audience based on title, description, and topic tags.'}`
- Proposed: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Infra/Ops', 'reasoning': 'AI/ML focus; Infra theme and Leaders audience based on title, description, and topic tags.'}`
- Why: embedding neighbors strongly support Infra/Ops audience
- Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Infra', 'count': 8}, 'audience': {'label': 'Infra/Ops', 'count': 7}}`

## Build and scale AI infrastructure with Compute Engine, Hyperdisk ML, and GKE

- URL: `https://www.googlecloudevents.com/next-vegas/session/3913126/build-and-scale-ai-infrastructure-with-compute-engine-hyperdisk-ml-and-gke`
- Current: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Infra theme and Leaders audience based on title, description, and topic tags.'}`
- Proposed: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Infra/Ops', 'reasoning': 'AI/ML focus; Infra theme and Leaders audience based on title, description, and topic tags.'}`
- Why: embedding neighbors strongly support Infra/Ops audience
- Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Infra', 'count': 7}, 'audience': {'label': 'Infra/Ops', 'count': 6}}`

## Best practices for moving, innovating, and extending your SAP Cloud ERP

- URL: `https://www.googlecloudevents.com/next-vegas/session/3952208/best-practices-for-moving-innovating-and-extending-your-sap-cloud-erp`
- Current: `{'ai_focus': 'AI', 'theme': 'Data', 'audience': 'Data pros', 'reasoning': 'AI/ML focus; Data theme and Data pros audience based on title, description, and topic tags.'}`
- Proposed: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Infra/Ops', 'reasoning': 'AI/ML focus; Data theme and Data pros audience based on title, description, and topic tags.'}`
- Why: infra/compute/platform cues dominate over Data/Data pros
- Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 7}, 'theme': {'label': 'Data', 'count': 5}, 'audience': {'label': 'Leaders', 'count': 7}}`

## Beyond migration: Engineering the self-optimizing enterprise

- URL: `https://www.googlecloudevents.com/next-vegas/session/3920346/beyond-migration-engineering-the-self-optimizing-enterprise`
- Current: `{'ai_focus': 'AI', 'theme': 'Data', 'audience': 'Data pros', 'reasoning': 'AI/ML focus; Data theme and Data pros audience based on title, description, and topic tags.'}`
- Proposed: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Infra/Ops', 'reasoning': 'AI/ML focus; Data theme and Data pros audience based on title, description, and topic tags.'}`
- Why: leadership/soft-skill cues dominate over weak data-adjacent tags; infra/compute/platform cues dominate over Data/Data pros
- Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Data', 'count': 5}, 'audience': {'label': 'Leaders', 'count': 5}}`

## Building a voice AI agent that listens, understands, and (most importantly) sells

- URL: `https://www.googlecloudevents.com/next-vegas/session/3909335/building-a-voice-ai-agent-that-listens-understands-and-most-importantly-sells`
- Current: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Infra/Ops', 'reasoning': 'AI/ML focus; Infra theme and Infra/Ops audience based on title, description, and topic tags.'}`
- Proposed: `{'ai_focus': 'AI', 'theme': 'App dev', 'audience': 'Developers', 'reasoning': 'AI/ML focus; Infra theme and Infra/Ops audience based on title, description, and topic tags.'}`
- Why: developer/build/deploy signals and nearest neighbors cluster with App dev
- Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'App dev', 'count': 5}, 'audience': {'label': 'Developers', 'count': 7}}`

