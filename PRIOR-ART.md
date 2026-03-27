# Prior Art & Legal Context

Community-built session trackers for cloud conferences have a long history of filling real gaps — better search, calendar views, change notifications — that official tools don't provide. This project follows in that tradition. It's worth knowing what happened to a similar effort in 2023.

## The AWS re:Invent 2023 Incident

### The Trackers

Two AWS community members built unofficial session trackers for AWS re:Invent 2023, both of which had significant community followings:

**Luc van Donkersgoed** (AWS Serverless Hero) built [reinvent-2023-session-fetcher](https://lucvandonkersgoed.com/2023/08/27/creating-a-serverless-reinvent-session-tracker/), a serverless app that polled the session catalog API, stored sessions in DynamoDB, tracked changes over time, and sent push notifications (email, SMS, mobile) when sessions were added, removed, or modified.

**Raphael Manke** built the [AWS re:Invent Planner](https://reinvent-planner.cloud/), a full webapp with advanced filtering, a calendar view (absent from AWS's official tool), bookmarking, and cross-device sync. It had ~7,000 page views in the weeks before the takedown.

Both tools scraped publicly accessible APIs — the same endpoints any browser would hit when loading the official catalog.

### The Cease & Desist

In October 2023, right as session registration opened, AWS Events customer support sent takedown notices to both developers. The notices cited AWS Site Terms and claimed the session data was "gated for registered attendees only" — a claim that was factually dubious, since the APIs were publicly accessible. The email was framed as a "request," but the implicit legal threat from a trillion-dollar company was unambiguous.

Luc described it publicly:

> "I'm sad to share that AWS is reaching out to all third-party Re:Invent session trackers with a takedown notice."

He complied immediately — and, in a panic, **permanently deleted his database and all backups**. His tracker never came back.

### The Reversal

The backlash was swift. The story hit [Hacker News](https://news.ycombinator.com/item?id=37912861) the same day, and AWS community managers intervened within hours. Raphael and AWS reached an agreement and his tracker was restored on October 17, 2023. AWS issued a public statement and private apologies to both developers.

The actual concern, it turned out, was narrow: AWS wanted **room capacity figures removed**, because room assignments were still subject to change based on session demand. Not the session data. Not the entire sites.

As Corey Quinn wrote in [Last Week in AWS](https://www.lastweekinaws.com/blog/the-missed-opportunity-aws-reinvent-and-the-community-that-cared/):

> "This could have been entirely avoided by simply asking for what they wanted (session capacity information removed) rather than what they asked for (taking down the entire site)."

### The Damage

- **Luc's tracker:** permanently gone. His data was deleted before the reversal.
- **Raphael's tracker:** restored within hours; it continues to operate and has evolved into [reinvent-planner.cloud](https://reinvent-planner.cloud/).

### Relevance to This Project

This project scrapes publicly visible pages from the Google Cloud Next session library. It does not store or expose capacity information. It is intentionally conservative in its request rate and caches aggressively to minimize load on the event site.

The 2023 incident is a reminder that even well-intentioned community tools can attract legal pressure. If Google ever raises a concern, the right response is to engage with them directly — not to destroy the data.

## Links

- [The Missed Opportunity: AWS, re:Invent, and the Community That Cared](https://www.lastweekinaws.com/blog/the-missed-opportunity-aws-reinvent-and-the-community-that-cared/) — Corey Quinn, Last Week in AWS
- [Hacker News thread](https://news.ycombinator.com/item?id=37912861)
- [Luc's blog post on building the tracker](https://lucvandonkersgoed.com/2023/08/27/creating-a-serverless-reinvent-session-tracker/)
- [Raphael's re:Invent Planner (current)](https://reinvent-planner.cloud/)
