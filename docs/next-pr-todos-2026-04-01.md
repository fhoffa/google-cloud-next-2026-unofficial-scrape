# TODOs for next PR (2026-04-01)

## 1) Regenerate surfaced stats from the newer 1048-session state

Current branch state is split:
- `sessions/latest.json` and `sessions/classified_sessions.json` still reflect **1037** sessions
- latest restored snapshot (`sessions/snapshots/2026-04-01T04-47-15Z.json`) reflects **1048** sessions

Next PR should reconcile this by regenerating the main surfaced dataset / classified dataset / insights outputs from the newer snapshot state so explorer counts and insights stats catch up.

## 2) Refine session classification away from defaulting some infra/agent sessions into App Dev

Examples Felipe flagged:
- `https://www.googlecloudevents.com/next-vegas/session/3912245/large-scale-llm-inference-on-gke`
  - This looks more like **Infra** than App Dev.
- `https://www.googlecloudevents.com/next-vegas/session/3932036/architecting-voice-and-chat-agent-and-how-these-worlds-are-merging`
  - If a session is about **agents / chatbots / applied use cases** and does not have an explicit App Dev tag, it may fit better under **Applied AI** than classic App Dev.

Suggested rule exploration for next PR:
- If a session lacks an explicit App Dev tag and is centered on:
  - agents
n  - chatbots / voice agents
  - applied agent architecture / applied AI systems
- prefer **Applied AI** over defaulting to **App Dev**.

Suggested complementary rule:
- infrastructure-heavy sessions (for example LLM inference on GKE, cluster/runtime/system scaling, infra for serving) should bias toward **Infra** even when adjacent to developer workflows.

Goal for next PR:
- tighten classification so App Dev is reserved for genuinely application-development-centric sessions, while agent/chatbot/product-use-case sessions can land in Applied AI and infra-heavy deployment/runtime topics can land in Infra.
