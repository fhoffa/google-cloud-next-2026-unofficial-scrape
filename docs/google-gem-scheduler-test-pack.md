# Google Gem scheduler test pack

This pack is designed to test the gem prompt in isolation, without relying on other conversational context.

Each case should be runnable with only:
- the copy-paste gem prompt in `docs/google-gem-scheduler-gem-prompt.txt`
- one JSON fixture file
- one user request

## Case 1: default Wednesday-Friday planning for a technical attendee

Fixture:
- `tests/fixtures/gem-scheduler-default-days.json`

User request:

```text
I'm a data engineer. I care most about BigQuery, data pipelines, agents, and Gemini. Build my schedule.
```

What a strong answer should do:
- assume Wednesday through Friday
- build a full schedule across every available slot in the fixture, not just one session per day
- pick `3001` and `3007` on Wednesday
- pick `3003` and `3009` on Thursday
- pick `3005` and `3011` on Friday
- produce an explorer link with the chosen primary ids

Sample output:
- `tests/fixtures/gem-scheduler-default-days.output.txt`

## Case 2: Thursday-only executive attendee

Fixture:
- `tests/fixtures/gem-scheduler-executive-thursday.json`

User request:

```text
I'm attending Thursday only. I'm an executive and I care about AI strategy, adoption, and governance. Build my schedule.
```

What a strong answer should do:
- use Thursday only, not Wednesday or Friday
- pick `5001` for the first slot
- pick `5003` for the second slot
- avoid preferring the technical labs over executive sessions
- produce an explorer link with `5001,5003`

Sample output:
- `tests/fixtures/gem-scheduler-executive-thursday.output.txt`

## Case 3: full-session fallback behavior

Fixture:
- `tests/fixtures/gem-scheduler-full-fallback.json`

User request:

```text
I'm a security engineer focused on AI and agent security. Give me the best option for this slot.
```

What a strong answer should do:
- keep `4001` as the primary recommendation or explicitly explain why `4002` becomes primary
- if `4001` is recommended, label it `Full`
- suggest `4002` as the same-slot alternative
- mention that the attendee can still line up for `4001` in case of cancellations
- avoid choosing `4003` unless the answer explains that it is a weak fallback

Sample output:
- `tests/fixtures/gem-scheduler-full-fallback.output.txt`

## Gem prompt file

Use this exact file for Gem setup:
- `docs/google-gem-scheduler-gem-prompt.txt`

## Evaluator usage

You can score a gem answer against a fixture with:

```bash
npm run gem:eval -- tests/fixtures/gem-scheduler-default-days.json tests/fixtures/gem-scheduler-default-days.output.txt
```

Or run the full dedicated suite:

```bash
npm run test:gem-scheduler
```

## Evaluation notes

These are prompt-contract cases, not product UI tests.

The key things to evaluate are:
- grounding in provided JSON only
- correct default-day behavior
- one primary recommendation per slot, covering every slot in the selected days
- same-slot alternatives only
- sensible persona matching
- valid `sessionids` explorer link generation
