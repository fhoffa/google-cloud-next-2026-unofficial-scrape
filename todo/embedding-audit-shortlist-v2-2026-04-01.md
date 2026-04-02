# Embedding audit shortlist v2 — 2026-04-01

This shortlist is based on semantic-only embeddings (title + description + tags + category + room + speaker companies), excluding the current labels and reasoning from the embedded text.

Raw flagged sessions in nearest-neighbor audit v2: **256**

## Infra-vs-Data suspects

- `Build vertical AI: Architect domain-specific models at scale with GKE`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912929/build-vertical-ai-architect-domain-specific-models-at-scale-with-gke`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Security', 'audience': 'Sec pros', 'reasoning': 'AI/ML focus; Security theme and Sec pros audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Infra', 'count': 8}, 'audience': {'label': 'Infra/Ops', 'count': 7}}`
  - Nearest neighbors: How GKE builds itself with AI; Engineering the future of Kubernetes for AI at scale; Platform engineering for AI: Architect a unified stack on GKE; GKE supercluster: Powering secure, planetary scale for AI workloads

- `AI inference: Performance when you need it, economy when you don't`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913116/ai-inference-performance-when-you-need-it-economy-when-you-don't`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'App dev', 'audience': 'Developers', 'reasoning': 'AI/ML focus; App dev theme and Developers audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 7}, 'theme': {'label': 'Infra', 'count': 8}, 'audience': {'label': 'Infra/Ops', 'count': 7}}`
  - Nearest neighbors: The GKE inference playbook: Optimize cost and performance; Intelligent compute infrastructure: Design for performance, reliability, and cost; Large-scale LLM inference on GKE; Engineering the future of Kubernetes for AI at scale

- `DeepMind startup workshop: Building agents with Gemini and Antigravity`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3909245/deepmind-startup-workshop-building-agents-with-gemini-and-antigravity`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Applied AI', 'audience': 'Developers', 'reasoning': 'AI focus; Applied AI theme — agent/voice/chatbot use case with Applied AI tag, no App Dev tag.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'App dev', 'count': 7}, 'audience': {'label': 'Developers', 'count': 7}}`
  - Nearest neighbors: DeepMind startup workshop: A guide to new frontier models & tools; What's new with Gemini from Google DeepMind; Implement Google DeepMind innovation within your enterprise; Gemini Robotics

- `Build and scale AI infrastructure with Compute Engine, Hyperdisk ML, and GKE`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913126/build-and-scale-ai-infrastructure-with-compute-engine-hyperdisk-ml-and-gke`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Infra theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Infra', 'count': 7}, 'audience': {'label': 'Infra/Ops', 'count': 6}}`
  - Nearest neighbors: AI Hypercomputer: Resilient AI infrastructure at scale; Build vertical AI: Architect domain-specific models at scale with GKE; Intelligent compute infrastructure: Design for performance, reliability, and cost; Engineering the future of Kubernetes for AI at scale

- `Build fast, run lean: Accelerate development with Gemini and Cloud Run`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912295/build-fast-run-lean-accelerate-development-with-gemini-and-cloud-run`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'App dev', 'audience': 'Infra/Ops', 'reasoning': 'AI/ML focus; App dev theme and Infra/Ops audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'App dev', 'count': 7}, 'audience': {'label': 'Developers', 'count': 6}}`
  - Nearest neighbors: Enable developer productivity with Gemini Enterprise; Build agentic AI with Gemini and developer platforms on GDC; Accelerate app development using Gemini AI and cloud tools; Accelerate CI/CD with coding agents

- `Building a mission-critical data on-ramp for AI with Hyperscience & PwC`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3916372/building-a-mission-critical-data-on-ramp-for-ai-with-hyperscience-pwc`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Infra/Ops', 'reasoning': 'AI/ML focus; Infra theme and Infra/Ops audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Data', 'count': 6}, 'audience': {'label': 'Leaders', 'count': 7}}`
  - Nearest neighbors: From chaos to command: Building your unified AI data hub; How to scale Agentic AI for the enterprise: A real life example at Cardinal Health with Genpact; AI at enterprise scale: Williams Sonoma, Smyths Toys, and Northwell Health; Beyond the hype: How leading businesses win with Gemini Enterprise

- `Cloud Run Developer Meetup`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913503/cloud-run-developer-meetup`
  - Current labels: `{'ai_focus': 'Not AI', 'theme': 'Infra', 'audience': 'Developers', 'reasoning': 'Non-AI; Infra theme and Developers audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 5}, 'theme': {'label': 'App dev', 'count': 8}, 'audience': {'label': 'Developers', 'count': 8}}`
  - Nearest neighbors: Go Developer Meetup; Cloud Certification Meetup; Global Developer Meetup; Python Developer Meetup

- `Data Professionals Meetup`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913489/data-professionals-meetup`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Data', 'audience': 'Developers', 'reasoning': 'AI/ML focus; Data theme and Developers audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 7}, 'theme': {'label': 'App dev', 'count': 6}, 'audience': {'label': 'Developers', 'count': 8}}`
  - Nearest neighbors: AI Application Developer Meetup; AI Software Lifecycle Meetup; Database Professionals Meetup; AI Infrastructure Engineer Meetup

- `A masterclass in managing billions of GCS objects and beyond`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913110/a-masterclass-in-managing-billions-of-gcs-objects-and-beyond`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Security', 'audience': 'Sec pros', 'reasoning': 'AI/ML focus; Security theme and Sec pros audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 7}, 'theme': {'label': 'Infra', 'count': 6}, 'audience': {'label': 'Infra/Ops', 'count': 7}}`
  - Nearest neighbors: Google Cloud storage products: The AI-ready foundation for your data; Cloud Storage Rapid: Turbocharged object storage for AI and analytics; Securing your Cloud data footprint with centralized backup; Sovereign-ready infrastructure: Architecting workloads for the public sector

- `Accelerate agent development with Gemini CLI, MCP, and Weave`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3893725/accelerate-agent-development-with-gemini-cli-mcp-and-weave`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Data', 'audience': 'Data pros', 'reasoning': 'AI/ML focus; Data theme and Data pros audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'App dev', 'count': 6}, 'audience': {'label': 'Developers', 'count': 6}}`
  - Nearest neighbors: Accelerate app development using Gemini AI and cloud tools; Secure and fast Agentic AI development with Gemini and GitLab; Automating the UI with Gemini CLI, MCP and Skills; How we built an AI agent workforce to automate coding

- `AI Infrastructure Engineer Meetup`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913491/ai-infrastructure-engineer-meetup`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Developers', 'reasoning': 'AI/ML focus; Infra theme and Developers audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'App dev', 'count': 5}, 'audience': {'label': 'Developers', 'count': 7}}`
  - Nearest neighbors: AI Application Developer Meetup; AI Agent Developer Meetup; AI Software Lifecycle Meetup; Platform Engineering Meetup

- `AI training and inference`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3920416/ai-training-and-inference`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Infra theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Infra', 'count': 7}, 'audience': {'label': 'Infra/Ops', 'count': 5}}`
  - Nearest neighbors: Accelerate your most demanding AI workloads with Managed Lustre; Scale reinforcement learning with high-performance storage; Cloud TPUs and GPUs; Inside Google AI infrastructure: A deep dive under the hood

## Leaders-vs-Data-pros suspects

- `Beyond the Black Box: Defensible Governance for the Agentic Era`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3964840/beyond-the-black-box-defensible-governance-for-the-agentic-era`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Security', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Security theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Security', 'count': 8}, 'audience': {'label': 'Sec pros', 'count': 8}}`
  - Nearest neighbors: The agent governance pattern: Architecting a secure enterprise AI workforce; Secure what's next: AI-driven defense for the enterprise; The Agentic SOC: Harmonizing Native AI with Human Expertise; The Engine and the Operator: Realizing High-Fidelity Outcomes with Google SecOps and MCP

- `Defending the frontier: Protecting AI with Google Cloud`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3909250/defending-the-frontier-protecting-ai-with-google-cloud`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Business', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Business theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Security', 'count': 8}, 'audience': {'label': 'Sec pros', 'count': 8}}`
  - Nearest neighbors: Secure what's next: AI-driven defense for the enterprise; Securing the AI Era; Securing the AI Era; Securing the AI Era

- `AI velocity vs. security`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3932026/ai-velocity-vs.-security`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Security', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Security theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Security', 'count': 8}, 'audience': {'label': 'Sec pros', 'count': 7}}`
  - Nearest neighbors: Security for non-deterministic AI; Test-driven development and security testing for AI code; Building trust in AI: A discussion on agent security and governance; The agent governance pattern: Architecting a secure enterprise AI workforce

- `Building trust in AI: A discussion on agent security and governance`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913060/building-trust-in-ai-a-discussion-on-agent-security-and-governance`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Security', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Security theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Security', 'count': 7}, 'audience': {'label': 'Sec pros', 'count': 7}}`
  - Nearest neighbors: Securing AI agents on Google Cloud; Simplify AI identity, governance and administration with agentic cross-cloud network; Secure AI agents from development to runtime; What’s next in IAM: Security, governance, and runtime defense for AI agents

- `3 quick wins across your small team with a unified AI workplace`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912241/3-quick-wins-across-your-small-team-with-a-unified-ai-workplace`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Data', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Data theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Business', 'count': 5}, 'audience': {'label': 'Leaders', 'count': 8}}`
  - Nearest neighbors: Beyond the hype: How leading businesses win with Gemini Enterprise; Enable developer productivity with Gemini Enterprise; From pilot to profit: Build an AI-powered organization with Gemini; Transform workflows with Gemini and the Google partner ecosystem

- `Build and scale AI infrastructure with Compute Engine, Hyperdisk ML, and GKE`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913126/build-and-scale-ai-infrastructure-with-compute-engine-hyperdisk-ml-and-gke`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Infra theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Infra', 'count': 7}, 'audience': {'label': 'Infra/Ops', 'count': 6}}`
  - Nearest neighbors: AI Hypercomputer: Resilient AI infrastructure at scale; Build vertical AI: Architect domain-specific models at scale with GKE; Intelligent compute infrastructure: Design for performance, reliability, and cost; Engineering the future of Kubernetes for AI at scale

- `Data Professionals Meetup`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913489/data-professionals-meetup`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Data', 'audience': 'Developers', 'reasoning': 'AI/ML focus; Data theme and Developers audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 7}, 'theme': {'label': 'App dev', 'count': 6}, 'audience': {'label': 'Developers', 'count': 8}}`
  - Nearest neighbors: AI Application Developer Meetup; AI Software Lifecycle Meetup; Database Professionals Meetup; AI Infrastructure Engineer Meetup

- `AI Infrastructure Engineer Meetup`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913491/ai-infrastructure-engineer-meetup`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Developers', 'reasoning': 'AI/ML focus; Infra theme and Developers audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'App dev', 'count': 5}, 'audience': {'label': 'Developers', 'count': 7}}`
  - Nearest neighbors: AI Application Developer Meetup; AI Agent Developer Meetup; AI Software Lifecycle Meetup; Platform Engineering Meetup

- `AI training and inference`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3920416/ai-training-and-inference`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Infra', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Infra theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Infra', 'count': 7}, 'audience': {'label': 'Infra/Ops', 'count': 5}}`
  - Nearest neighbors: Accelerate your most demanding AI workloads with Managed Lustre; Scale reinforcement learning with high-performance storage; Cloud TPUs and GPUs; Inside Google AI infrastructure: A deep dive under the hood

- `Beyond the warehouse: Architecting BigQuery for the future of analytics`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912291/beyond-the-warehouse-architecting-bigquery-for-the-future-of-analytics`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Data', 'audience': 'Leaders', 'reasoning': 'AI/ML focus; Data theme and Leaders audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 8}, 'theme': {'label': 'Data', 'count': 7}, 'audience': {'label': 'Data pros', 'count': 5}}`
  - Nearest neighbors: What's new in BigQuery: The data platform for agentic AI; Serverless data science: Seamless AI workflows with Spark and BigQuery; BigQuery Graph: Uncover complex, hidden relationships in your data; Data Engineering Agent: Your partner for BigQuery and the open lakehouse

## AI-focus disagreement suspects

- `Cybercrime trends: Lessons from the front lines`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913086/cybercrime-trends-lessons-from-the-front-lines`
  - Current labels: `{'ai_focus': 'AI', 'theme': 'Security', 'audience': 'Sec pros', 'reasoning': 'AI/ML focus; Security theme and Sec pros audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'Not AI', 'count': 8}, 'theme': {'label': 'Security', 'count': 8}, 'audience': {'label': 'Sec pros', 'count': 7}}`
  - Nearest neighbors: Transform cyber defense: Insights from Mandiant; 2026 M-Trends Report; 2026 M-Trends Report; 2026 M-Trends Report

- `Cloud security best practices: Keeping cloud data secure`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912982/cloud-security-best-practices-keeping-cloud-data-secure`
  - Current labels: `{'ai_focus': 'Not AI', 'theme': 'Security', 'audience': 'Sec pros', 'reasoning': 'Non-AI; Security theme and Sec pros audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 7}, 'theme': {'label': 'Security', 'count': 8}, 'audience': {'label': 'Sec pros', 'count': 7}}`
  - Nearest neighbors: Security best practices for GKE on AI; Securing your Cloud data footprint with centralized backup; Securing AI agents on Google Cloud; A discussion on securing Vertex AI

- `Deploying Applications with GKE Autopilot`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3924717/deploying-applications-with-gke-autopilot`
  - Current labels: `{'ai_focus': 'Not AI', 'theme': 'Infra', 'audience': 'Infra/Ops', 'reasoning': 'Non-AI; Infra theme and Infra/Ops audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 6}, 'theme': {'label': 'Infra', 'count': 8}, 'audience': {'label': 'Infra/Ops', 'count': 8}}`
  - Nearest neighbors: How GKE builds itself with AI; Build beyond the CPU: Native AI and agentic autoscaling on GKE; Deploying a Multi-Cluster Gateway Across GKE Clusters; Serve open models with Cloud Run and GKE

- `Architect with Google Axion: A decision framework for Arm workloads`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913066/architect-with-google-axion-a-decision-framework-for-arm-workloads`
  - Current labels: `{'ai_focus': 'Not AI', 'theme': 'Infra', 'audience': 'Infra/Ops', 'reasoning': 'Session about processor architecture and Arm workload mapping; strong Compute + Platform Engineers + SRE + Infrastructure Architects signals.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 7}, 'theme': {'label': 'Infra', 'count': 7}, 'audience': {'label': 'Infra/Ops', 'count': 7}}`
  - Nearest neighbors: The new Axion Bare Metal for Arm workloads; Beyond the sandbox: Redefine AI-native apps with GKE, Axion processors, and C4 instances; Inside Google AI infrastructure: A deep dive under the hood; Architecting rack-scale AI: Inside Nvidia Blackwell on Google Cloud

- `Cloud Native SASE with Fortinet and Google Unified Security`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3952911/cloud-native-sase-with-fortinet-and-google-unified-security`
  - Current labels: `{'ai_focus': 'Not AI', 'theme': 'Security', 'audience': 'Sec pros', 'reasoning': 'Non-AI; Security theme and Sec pros audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 5}, 'theme': {'label': 'Security', 'count': 8}, 'audience': {'label': 'Sec pros', 'count': 8}}`
  - Nearest neighbors: Protect critical Agentic AI infrastructure with Fortinet and GCP; Achieve multicloud security at scale with Google Unified Security; Securing agent traffic at scale: Network enforcement for the Agentic Enterprise; Secure innovation with Google Cloud

- `Cloud Run Developer Meetup`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913503/cloud-run-developer-meetup`
  - Current labels: `{'ai_focus': 'Not AI', 'theme': 'Infra', 'audience': 'Developers', 'reasoning': 'Non-AI; Infra theme and Developers audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 5}, 'theme': {'label': 'App dev', 'count': 8}, 'audience': {'label': 'Developers', 'count': 8}}`
  - Nearest neighbors: Go Developer Meetup; Cloud Certification Meetup; Global Developer Meetup; Python Developer Meetup

- `Achieve multicloud security at scale with Google Unified Security`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913121/achieve-multicloud-security-at-scale-with-google-unified-security`
  - Current labels: `{'ai_focus': 'Not AI', 'theme': 'Security', 'audience': 'Sec pros', 'reasoning': 'Non-AI; Security theme and Sec pros audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 6}, 'theme': {'label': 'Security', 'count': 7}, 'audience': {'label': 'Sec pros', 'count': 7}}`
  - Nearest neighbors: SecOps customer panel: How global leaders automate defense at hyperscale; Securing global innovation: How industry leaders scale defense across complex environments; Secure your resources with built-in Policy, Policy Intelligence, and PAM; Build a cross-cloud network to connect apps securely across clouds

- `Build and scale GKE workloads: A master class in node-level performance`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3912942/build-and-scale-gke-workloads-a-master-class-in-node-level-performance`
  - Current labels: `{'ai_focus': 'Not AI', 'theme': 'Infra', 'audience': 'Infra/Ops', 'reasoning': 'Non-AI; Infra theme and Infra/Ops audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 7}, 'theme': {'label': 'Infra', 'count': 7}, 'audience': {'label': 'Infra/Ops', 'count': 6}}`
  - Nearest neighbors: Build and optimize GKE workloads: A master class in node-level performance; GKE efficiency master class: Architecting for optimal price-performance; The GKE inference playbook: Optimize cost and performance; Build vertical AI: Architect domain-specific models at scale with GKE

- `Best practices for designing and deploying Cross-Cloud Network security`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3913008/best-practices-for-designing-and-deploying-cross-cloud-network-security`
  - Current labels: `{'ai_focus': 'Not AI', 'theme': 'Security', 'audience': 'Sec pros', 'reasoning': 'Non-AI; Security theme and Sec pros audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 6}, 'theme': {'label': 'Security', 'count': 7}, 'audience': {'label': 'Sec pros', 'count': 6}}`
  - Nearest neighbors: What's new in network security; Protect cloud workloads with AI-powered zero-trust network security; Build secure-by-design applications for Google Cloud; What's new in the Cross-Cloud Network

- `Defend Faster: Applied Threat Intel in Google SecOps`
  - URL: `https://www.googlecloudevents.com/next-vegas/session/3924708/defend-faster-applied-threat-intel-in-google-secops`
  - Current labels: `{'ai_focus': 'Not AI', 'theme': 'Security', 'audience': 'Sec pros', 'reasoning': 'Non-AI; Security theme and Sec pros audience based on title, description, and topic tags.'}`
  - Neighbor majority: `{'ai_focus': {'label': 'AI', 'count': 5}, 'theme': {'label': 'Security', 'count': 7}, 'audience': {'label': 'Sec pros', 'count': 7}}`
  - Nearest neighbors: Defending AI Workloads: Capture The Flag with Google AI Security Solutions; Defending AI Workloads: Capture The Flag with Google AI security solutions; ThreatSpace APT Hunting; ThreatSpace APT Hunting
