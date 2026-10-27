---
name: memcell
description: Living memory for this workspace. Recall before acting — it carries what was established here (instructions, decisions, facts, preferences, active session threads, and grounded workspace documents), every claim carrying confidence earned from reported outcomes rather than asserted. Use at the start of any non-trivial task, whenever an approach fails or a decision is made, and whenever a document carries operational context. Report outcomes afterwards — a memory never told what happened stops learning.
---

# memcell

Memory your agents recall from before they act, and report back to
afterwards:

- **Shared workspace memory** — instructions, decisions, facts, and preferences
  established while working here, carrying confidence calibrated from real outcomes.
- **Working threads & grounded documents** — active or resumed session threads
  with milestones and action checkpoints, alongside indexed workspace reference
  documents.

Every entry is one claim, carrying the evidence behind it and a confidence
figure that moves only when outcomes are reported: what worked rises, what
failed falls. That is the difference from a static instruction file, which is
written once and never sharpened by what happened.

## How to reach it

Two ways, and either is enough.

**Tools** named `recall`, `remember`, `report`, `ingest_document`, `search_documents`, and `get_insights`. Use them if
they are there.

**The shell**, otherwise — same doors, same memory:

```
memcell recall "<what you are trying to do or know>"
memcell remember "<one claim, in one sentence>"
memcell report <memory-id> worked|failed
memcell thread
memcell ingest <path>
memcell source add <url-or-repo>
memcell insights
memcell import <file>
```

If those commands are missing, run them through `npx memcell` instead. If
they answer `not wired`, this directory has no memory yet: tell the user
once, give them `npx memcell connect`, and carry on without it.

Never invent a memory tool, and never keep memory in a file of your own.

## recall — before you act

Ask with the task in your own words: an intent or a question, not keywords.

```
memcell recall "how should retries behave when the payment gateway times out?"
memcell recall "what are our escalation and approval steps for customer refunds?"
```

Do this at the start of a task, not after acting. Each answer carries a
confidence figure, any 1-hop knowledge graph relations (`justifies`,
`depends_on`, `limits`, `supersedes`, etc.), active or resumed working
threads, grounded workspace document chunks, and the id you need to report on it.

**Reading a result:**

- **0.7 and above** — the workspace's current position. Follow it, or state
  plainly why you are departing from it.
- **below 0.7** — a lead. Weigh it against what you observe directly.
- **`dead_end`** — an approach already tried and failed here. Do not retry
  it silently. If you believe it no longer applies, say so first, then go
  through it deliberately.
- **`pinned`** — a standing memory, present whatever you asked. It did not
  answer your question; do not read its presence as relevance.
- **`diverged`** — you already went against this one earlier in this
  session. It is served again for that reason. Re-read it before continuing,
  and if you believe it no longer applies, say so plainly instead of working
  around it a second time.

Nothing served means nothing is established here yet. That is an answer:
proceed, and file what you learn.

## remember — when something is established

One claim, one sentence, when work settles something durable (`instruction`, `decision`, `fact`, or `preference`) that a
transcript would bury.

```
memcell remember "Retries cap at five attempts; after that the job parks in the dead-letter table." --type instruction --enforce
memcell remember "Route enterprise support escalations through the regional operations queue." --type decision
memcell remember "Polling the gateway for capture status times out under load." --type fact --observation "timed out after 50 concurrent requests"
```

File instructions, operational or product decisions, constraints discovered, and approaches that failed. Do not
file transient status updates or raw logs.

An **action guard** or **standing instruction** — something a future session could disobey — takes `--at`, naming
the moments it bears on, so it is served again at the one it applies to
rather than only at the start of a session:

```
memcell remember "Never publish customer reports without redacting PII." --type instruction --at send
memcell remember "Validate schema versions before writing batch exports." --type instruction --at record
memcell remember "Work on a draft copy; the published template is the reference." --type instruction --at change
```

`read` looked something up, nothing changed · `change` something of yours
changed and you can still undo it · `record` it is durable and your own side
will act on it · `send` it left and cannot be taken back · `answer` the
person you are working for has your words. Several are fine. Leave `--at`
off for knowledge — a fact cannot be disobeyed.

## report — what makes the figures real

When something memory served turns out to have worked or failed, say so
against its id:

```
memcell report 941435d1-36da-4611-9a41-8e410d2af25a worked
memcell report 941435d1-36da-4611-9a41-8e410d2af25a failed --note "the cap did not hold under load"
```

This is the only thing that moves confidence, and it is what separates this
from a notes file. A recall nobody reports on teaches the record nothing,
and stale confidence is worse than none.

Report `failed` when you followed a memory and the work went wrong, or
when it turned out untrue. Going against a memory that still stands is a
different thing: it is recorded on its own, moves no confidence, and brings
the memory back on your next recall. Say so in the conversation either
way, rather than silently overriding it.

## ingest, source & import — when files or web pages carry context

Index workspace PDFs, DOCX handbooks, CSV tables, HTML pages, JSON configs, and Markdown documentation for grounded retrieval and knowledge graph bootstrap:

```
memcell ingest
memcell ingest handbooks/escalation-policy.pdf
memcell source add https://docs.example.com/sitemap.xml
memcell import docs/retry-policy.md
```

Do not summarize the document yourself — it is indexed for grounded retrieval and distilled into individual
memories, each keeping provenance back to what it came from.

## While you work

In a wired workspace, hooks already recall at session start, stream real-time mid-turn thread and action checkpoints as tools execute, and capture the turn's material and working thread milestones at the end—preserving both high-level decisions and detailed operational specifications (`content` and `resources`) without recording raw user prompts verbatim. The calls above are what you reach for mid-turn: recall before deciding, report when an outcome lands.
