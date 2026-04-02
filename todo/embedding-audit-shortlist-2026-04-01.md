# Embedding audit shortlist — 2026-04-01

This is the first human-readable cut from the nearest-neighbor embedding audit. It is meant to surface likely taxonomy problems, not to auto-relabel sessions blindly.

Raw flagged sessions in nearest-neighbor audit: **259**

## Infra-vs-Data suspects

- `AI training and inference`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3920416/ai-training-and-inference`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Infra theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Infra', 'count': 8}, 'audience': {'label': 'Infra/Ops', 'count': 7}}`
  - Nearest neighbors: Accelerate your most demanding AI workloads with Managed Lustre; Google Cloud storage products: The AI-ready foundation for your data; Cloud TPUs and GPUs; Scale reinforcement learning with high-performance storage

- `AI inference: Performance when you need it, economy when you don't`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913116/ai-inference-performance-when-you-need-it-economy-when-you-don't`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'App dev', 'audience': 'Developers', 'reasoning': 'AI/ML focus; App dev theme and Developers audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Infra', 'count': 8}, 'audience': {'label': 'Infra/Ops', 'count': 6}}`
  - Nearest neighbors: The GKE inference playbook: Optimize cost and performance; Beyond the sandbox: Redefine AI-native apps with GKE, Axion processors, and C4 instances; Large-scale LLM inference on GKE; Intelligent compute infrastructure: Design for performance, reliability, and cost

- `Beyond the warehouse: Architecting BigQuery for the future of analytics`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912291/beyond-the-warehouse-architecting-bigquery-for-the-future-of-analytics`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Data', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Data theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Data', 'count': 8}, 'audience': {'label': 'Data pros', 'count': 5}}`
  - Nearest neighbors: What's new in BigQuery: The data platform for agentic AI; Serverless data science: Seamless AI workflows with Spark and BigQuery; The BigQuery advantage: AI-powered migrations to an AI-ready data platform; Optimize BigQuery observability and FinOps for the agentic era

- `BigQuery Graph: Uncover complex, hidden relationships in your data`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912233/bigquery-graph-uncover-complex-hidden-relationships-in-your-data`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Data', 'audience': 'Infra/Ops', 'reasoning': 'AI/ML focus; Data theme and Infra/Ops audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Data', 'count': 8}, 'audience': {'label': 'Data pros', 'count': 5}}`
  - Nearest neighbors: What's new in BigQuery: The data platform for agentic AI; Optimize BigQuery observability and FinOps for the agentic era; Beyond the warehouse: Architecting BigQuery for the future of analytics; Supercharging unstructured data analytics with generative AI in BigQuery

- `Build and scale AI infrastructure with Compute Engine, Hyperdisk ML, and GKE`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913126/build-and-scale-ai-infrastructure-with-compute-engine-hyperdisk-ml-and-gke`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Infra theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Infra', 'count': 7}, 'audience': {'label': 'Infra/Ops', 'count': 6}}`
  - Nearest neighbors: Intelligent compute infrastructure: Design for performance, reliability, and cost; Build vertical AI: Architect domain-specific models at scale with GKE; Build data-rich AI on GKE: A deep dive with ClickHouse and Character.AI; AI at Snap's scale: Building a global compute fabric with GKE custom compute classes

- `Build fast, run lean: Accelerate development with Gemini and Cloud Run`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912295/build-fast-run-lean-accelerate-development-with-gemini-and-cloud-run`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'App dev', 'audience': 'Infra/Ops', 'reasoning': 'AI/ML focus; App dev theme and Infra/Ops audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'App dev', 'count': 7}, 'audience': {'label': 'Developers', 'count': 6}}`
  - Nearest neighbors: Accelerate app development using Gemini AI and cloud tools; Accelerate CI/CD with coding agents; Startup coding lab: Accelerate with Gemini AI & Code Assist; Build agentic AI with Gemini and developer platforms on GDC

- `Build vertical AI: Architect domain-specific models at scale with GKE`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912929/build-vertical-ai-architect-domain-specific-models-at-scale-with-gke`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Security', 'audience': 'Sec pros', 'reasoning': 'AI/ML focus; Security theme and Sec pros audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Infra', 'count': 7}, 'audience': {'label': 'Infra/Ops', 'count': 6}}`
  - Nearest neighbors: Build and scale AI infrastructure with Compute Engine, Hyperdisk ML, and GKE; How GKE builds itself with AI; GKE supercluster: Powering secure, planetary scale for AI workloads; Platform engineering for AI: Architect a unified stack on GKE

- `Beyond vibe coding: Deploy prototypes with Vertex AI and Cloud Run`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3911911/beyond-vibe-coding-deploy-prototypes-with-vertex-ai-and-cloud-run`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Developers', 'reasoning': 'AI/infra focus; Infra theme — infrastructure-primary session with no App Dev tag.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'App dev', 'count': 6}, 'audience': {'label': 'Developers', 'count': 6}}`
  - Nearest neighbors: Build without boundaries: Unifying vibe coding and production with Vertex AI Studio and MCP; Vibe from code to cloud: Create and deploy apps directly from your IDEs; Vibe coding apps with autonomous multi-agents on GKE and Data Cloud; From prototype to production: 45 minutes to a reliable Vertex AI agent

- `Building a voice AI agent that listens, understands, and (most importantly) sells`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3909335/building-a-voice-ai-agent-that-listens-understands-and-most-importantly-sells`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Infra/Ops', 'reasoning': 'AI/ML focus; Infra theme and Infra/Ops audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'App dev', 'count': 5}, 'audience': {'label': 'Developers', 'count': 7}}`
  - Nearest neighbors: Beyond Chatbots: Building Realtime Multimodal Agents with the Gemini Live API; Real-time multimodality: Building seamless experiences with the Gemini Live API; Agentic commerce: Transform the shopping experience with Google agents and open standards; Real-time recall: Build personalized multimodal agents with Google ADK

- `Accelerate R&D with Gemini-based agents Co-Scientist and AlphaEvolve`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3920154/accelerate-rd-with-gemini-based-agents-co-scientist-and-alphaevolve`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Applied AI', 'audience': 'Developers', 'reasoning': 'AI focus; Applied AI theme — agent-centric session with no App Dev tag.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'App dev', 'count': 6}, 'audience': {'label': 'Developers', 'count': 5}}`
  - Nearest neighbors: Implement Google DeepMind innovation within your enterprise; Accelerate research at scale with Gemini and Google AI infrastructure; Enable developer productivity with Gemini Enterprise; Accelerate app development using Gemini AI and cloud tools

- `Build AI agents at scale with Google Cloud`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3818849/build-ai-agents-at-scale-with-google-cloud`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'App dev', 'audience': 'Developers', 'reasoning': 'AI/ML focus; App dev theme and Developers audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Applied AI', 'count': 4}, 'audience': {'label': 'Leaders', 'count': 7}}`
  - Nearest neighbors: Building enterprise-grade AI agents: How enterprises scale business with Agentic AI on Google Cloud; Scale AI agents in production; Build production-ready agents on Google Cloud: A guide for architects and CTOs; What's new in Google Cloud's agent platform

- `Accelerate your path to AI readiness with Google Cloud VMware Engine`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912979/accelerate-your-path-to-ai-readiness-with-google-cloud-vmware-engine`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Infra/Ops', 'reasoning': 'AI/ML focus; Infra theme and Infra/Ops audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 7}, 'theme': {'label': 'Infra', 'count': 6}, 'audience': {'label': 'Leaders', 'count': 5}}`
  - Nearest neighbors: The migration trifecta: Move fast, shift budget, and deploy AI; Seamlessly migrate & modernize: VMware workloads on Google Cloud; Accelerate to innovate: How AI is rewriting the rules of data migration; Unlock Google Cloud's migration secrets: Security, speed, and scale

## Leaders-vs-Data-pros suspects

- `Beyond the Black Box: Defensible Governance for the Agentic Era`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3964840/beyond-the-black-box-defensible-governance-for-the-agentic-era`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Security', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Security theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Security', 'count': 8}, 'audience': {'label': 'Sec pros', 'count': 8}}`
  - Nearest neighbors: Securing the AI Era; Securing the AI Era; Securing the AI Era; Securing the AI Era

- `AI training and inference`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3920416/ai-training-and-inference`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Infra theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Infra', 'count': 8}, 'audience': {'label': 'Infra/Ops', 'count': 7}}`
  - Nearest neighbors: Accelerate your most demanding AI workloads with Managed Lustre; Google Cloud storage products: The AI-ready foundation for your data; Cloud TPUs and GPUs; Scale reinforcement learning with high-performance storage

- `AI velocity vs. security`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3932026/ai-velocity-vs.-security`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Security', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Security theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Security', 'count': 8}, 'audience': {'label': 'Sec pros', 'count': 7}}`
  - Nearest neighbors: Security for non-deterministic AI; Building trust in AI: A discussion on agent security and governance; Navigating the new frontier: AI-driven security strategies; The agent governance pattern: Architecting a secure enterprise AI workforce

- `Beyond the warehouse: Architecting BigQuery for the future of analytics`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912291/beyond-the-warehouse-architecting-bigquery-for-the-future-of-analytics`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Data', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Data theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Data', 'count': 8}, 'audience': {'label': 'Data pros', 'count': 5}}`
  - Nearest neighbors: What's new in BigQuery: The data platform for agentic AI; Serverless data science: Seamless AI workflows with Spark and BigQuery; The BigQuery advantage: AI-powered migrations to an AI-ready data platform; Optimize BigQuery observability and FinOps for the agentic era

- `Build and scale AI infrastructure with Compute Engine, Hyperdisk ML, and GKE`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913126/build-and-scale-ai-infrastructure-with-compute-engine-hyperdisk-ml-and-gke`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Infra theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Infra', 'count': 7}, 'audience': {'label': 'Infra/Ops', 'count': 6}}`
  - Nearest neighbors: Intelligent compute infrastructure: Design for performance, reliability, and cost; Build vertical AI: Architect domain-specific models at scale with GKE; Build data-rich AI on GKE: A deep dive with ClickHouse and Character.AI; AI at Snap's scale: Building a global compute fabric with GKE custom compute classes

- `Architecting for the agent and beyond: Inside Mattel's product quality world`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3895149/architecting-for-the-agent-and-beyond-inside-mattel's-product-quality-world`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Infra theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Applied AI', 'count': 5}, 'audience': {'label': 'Leaders', 'count': 5}}`
  - Nearest neighbors: Architecting Enterprise GenAI: Building Production-Grade Agents on Vertex AI; Path to production: Improve and scale agent quality with OpenTelemetry; The intelligence layer: Building AI-first customer experience; Build production-ready agents on Google Cloud: A guide for architects and CTOs

- `Automating excellence: How Gemini and Config Connector help create 10x cloud teams`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912910/automating-excellence-how-gemini-and-config-connector-help-create-10x-cloud-teams`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Business', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Business theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'App dev', 'count': 6}, 'audience': {'label': 'Developers', 'count': 3}}`
  - Nearest neighbors: Supercharge your SRE team with Gemini Cloud Assist; How we build and use Gemini CLI at Google Cloud; Build fast, run lean: Accelerate development with Gemini and Cloud Run; 10x productivity with the Gemini CLI

- `Accelerating the next wave of intelligent innovation with NVIDIA and Google Cloud`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3964834/accelerating-the-next-wave-of-intelligent-innovation-with-nvidia-and-google-cloud`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Data', 'audience': 'Developers', 'reasoning': 'AI/ML focus; Data theme and Developers audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Infra', 'count': 3}, 'audience': {'label': 'Leaders', 'count': 5}}`
  - Nearest neighbors: What's next in AI infrastructure: Scaling for the agentic and physical AI era; Accelerate to innovate: How AI is rewriting the rules of data migration; Fuel the future: How global leaders turn data into AI-powered growth; Building enterprise-grade AI agents: How enterprises scale business with Agentic AI on Google Cloud

- `Accelerate domain AI agents on Google Cloud Vertex AI with NVIDIA NeMo and NVIDIA Nemotron`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/4033904/accelerate-domain-ai-agents-on-google-cloud-vertex-ai-with-nvidia-nemo-and-nvidia-nemotron`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Applied AI', 'audience': 'Leaders', 'reasoning': 'AI focus; Applied AI theme — agent/voice/chatbot use case with Applied AI tag, no App Dev tag.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Data', 'count': 2}, 'audience': {'label': 'Developers', 'count': 5}}`
  - Nearest neighbors: Accelerating the next wave of intelligent innovation with NVIDIA and Google Cloud; Govern your agents: Architecting a secure agentic ecosystem with Vertex AI; What's new in Google Cloud's agent platform; From prototype to production: 45 minutes to a reliable Vertex AI agent

## AI-focus disagreement suspects

- `Achieve multicloud security at scale with Google Unified Security`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913121/achieve-multicloud-security-at-scale-with-google-unified-security`
  - Current labels: `{'ai_focus': 'Not AI', 'theme': 'Security', 'audience': 'Sec pros', 'reasoning': 'Non-AI; Security theme and Sec pros audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 6}, 'theme': {'label': 'Security', 'count': 8}, 'audience': {'label': 'Sec pros', 'count': 8}}`
  - Nearest neighbors: Google AI and security: Wherever the mission takes you; Navigating the new frontier: AI-driven security strategies; Enable secure cloud + AI development; SecOps customer panel: How global leaders automate defense at hyperscale

- `Best practices for designing and deploying Cross-Cloud Network security`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913008/best-practices-for-designing-and-deploying-cross-cloud-network-security`
  - Current labels: `{'ai_focus': 'Not AI', 'theme': 'Security', 'audience': 'Sec pros', 'reasoning': 'Non-AI; Security theme and Sec pros audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 7}, 'theme': {'label': 'Security', 'count': 8}, 'audience': {'label': 'Sec pros', 'count': 7}}`
  - Nearest neighbors: What's new in network security; Protect cloud workloads with AI-powered zero-trust network security; Cross-Cloud Network: An intelligent, governed, performant fabric for global AI; Build secure-by-design applications for Google Cloud

- `Blueprint for success: Scale Your business with 2026 priority plays`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3909198/blueprint-for-success-scale-your-business-with-2026-priority-plays`
  - Current labels: `{'ai_focus': 'Not AI', 'theme': 'Business', 'audience': 'Leaders', 'reasoning': 'Non-AI; Business theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 6}, 'theme': {'label': 'Business', 'count': 8}, 'audience': {'label': 'Leaders', 'count': 8}}`
  - Nearest neighbors: Level Up: Supercharge your partner marketing studio campaigns; Scale joint AI success and revenue generation in North America; Displace & win: The agentic workplace transformation Playbook; Foundation of success: Mastering co-sell and services registrations

- `Build and scale GKE workloads: A master class in node-level performance`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912942/build-and-scale-gke-workloads-a-master-class-in-node-level-performance`
  - Current labels: `{'ai_focus': 'Not AI', 'theme': 'Infra', 'audience': 'Infra/Ops', 'reasoning': 'Non-AI; Infra theme and Infra/Ops audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 7}, 'theme': {'label': 'Infra', 'count': 8}, 'audience': {'label': 'Infra/Ops', 'count': 6}}`
  - Nearest neighbors: Build and optimize GKE workloads: A master class in node-level performance; GKE efficiency master class: Architecting for optimal price-performance; The GKE inference playbook: Optimize cost and performance; AI at Snap's scale: Building a global compute fabric with GKE custom compute classes

- `Architect with Google Axion: A decision framework for Arm workloads`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913066/architect-with-google-axion-a-decision-framework-for-arm-workloads`
  - Current labels: `{'ai_focus': 'Not AI', 'theme': 'Infra', 'audience': 'Infra/Ops', 'reasoning': 'Session about processor architecture and Arm workload mapping; strong Compute + Platform Engineers + SRE + Infrastructure Architects signals.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 7}, 'theme': {'label': 'Infra', 'count': 7}, 'audience': {'label': 'Infra/Ops', 'count': 6}}`
  - Nearest neighbors: The new Axion Bare Metal for Arm workloads; Beyond the sandbox: Redefine AI-native apps with GKE, Axion processors, and C4 instances; Architecting rack-scale AI: Inside Nvidia Blackwell on Google Cloud; Intelligent compute infrastructure: Design for performance, reliability, and cost

- `Build and optimize GKE workloads: A master class in node-level performance`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912946/build-and-optimize-gke-workloads-a-master-class-in-node-level-performance`
  - Current labels: `{'ai_focus': 'Not AI', 'theme': 'Infra', 'audience': 'Infra/Ops', 'reasoning': 'Non-AI; Infra theme and Infra/Ops audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 7}, 'theme': {'label': 'Infra', 'count': 7}, 'audience': {'label': 'Infra/Ops', 'count': 6}}`
  - Nearest neighbors: Build and scale GKE workloads: A master class in node-level performance; GKE efficiency master class: Architecting for optimal price-performance; The GKE inference playbook: Optimize cost and performance; AI inference: Performance when you need it, economy when you don't

- `Beyond backup: What cyber recovery actually requires today`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3908727/beyond-backup-what-cyber-recovery-actually-requires-today`
  - Current labels: `{'ai_focus': 'Not AI', 'theme': 'Security', 'audience': 'Sec pros', 'reasoning': 'Non-AI; Security theme and Sec pros audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 6}, 'theme': {'label': 'Security', 'count': 7}, 'audience': {'label': 'Sec pros', 'count': 6}}`
  - Nearest neighbors: Resilience everywhere across Google Cloud, On-Prem, and Edge; Securing your Cloud data footprint with centralized backup; Secure by design: Cloud SQL brute-force protection and air-gapped recovery; Enable secure cloud + AI development

- `Beyond boundaries: Scaling compliance, controls, sovereignty with partners`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913141/beyond-boundaries-scaling-compliance-controls-sovereignty-with-partners`
  - Current labels: `{'ai_focus': 'Not AI', 'theme': 'Security', 'audience': 'Sec pros', 'reasoning': 'Non-AI; Security theme and Sec pros audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 6}, 'theme': {'label': 'Security', 'count': 8}, 'audience': {'label': 'Sec pros', 'count': 5}}`
  - Nearest neighbors: Scaling sovereign AI: Empowering global growth with local control; Data Boundary in action: Production-ready sovereignty and compliance; Solve the sovereignty puzzle: Your cloud, your rules; Scaling sovereign AI: Empower global growth with local control

- `BigQuery and Looker Studio patterns`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3932054/bigquery-and-looker-studio-patterns`
  - Current labels: `{'ai_focus': 'Not AI', 'theme': 'Data', 'audience': 'Data pros', 'reasoning': 'Non-AI; Data theme and Data pros audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 6}, 'theme': {'label': 'Data', 'count': 8}, 'audience': {'label': 'Data pros', 'count': 5}}`
  - Nearest neighbors: From data to dashboard: Empower BigQuery users with Looker Studio; Visualizing BigQuery Data with Looker Studio; BigQuery Graph: Uncover complex, hidden relationships in your data; What's new in BigQuery: The data platform for agentic AI
