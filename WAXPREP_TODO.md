WAXPREP TODO

This is a living document for current research and implementation work.

## CURRENT RESEARCH

Paste the research or instructions for the current task below:

- 


## AGENT WORKFLOW

When working on WaxPrep, the agent must:

1. Read this document and the other root documents first.
2. Inspect the entire repository and understand the current `main` branch before changing anything.
3. Understand the existing architecture, files, dependencies, and current state before implementing the requested work.
4. Review the research/instructions above and determine exactly what needs to be changed.
5. Before making changes, create a new side branch from the correct current `main` state.
6. Never modify or rename `main` directly.
7. Implement the authorized work on the side branch.
8. Document meaningful changes in the appropriate `docs/` section.
9. Run the relevant tests/checks and review the final diff.
10. Save all completed work and documentation on the side branch.
11. Report exactly what was changed, what was researched, what was implemented, and anything that still needs attention.
12. Tell the founder to review the completed side branch.
13. **Do not merge automatically.**
14. After the founder has reviewed the work, ask for explicit permission before merging the side branch into `main`.



# WAXPREP MASTER BUILD GUIDE



# WaxPrep Conversation & Context Architecture — Research Report

*A companion to the Memory Subsystem report. Where that one asked "what should the tutor remember," this one asks the question underneath every instance of "the tutor forgot" — "what does the tutor actually see, right now, for this message." That's a different problem, and it's the one most systems get wrong first.*

---

## 0. The one distinction that organizes everything else

Before the 25 sections: **Context is what gets assembled for *this specific turn*. Memory is what persists *across* turns.** They're not two competing storage systems — Context is the *runtime consumer* of Memory, plus the current conversation, plus temporary state that memory shouldn't even see. Get this boundary wrong and you get one of two failure modes: either Context becomes a thin pass-through with no intelligence of its own (just "dump memory + last N messages"), or Memory and Context duplicate each other's job and drift out of sync. The rest of this report is really an elaboration of that one line.

Your classification examples are worth answering directly, right up front, because they establish the pattern used throughout:

- **"I don't understand quadratic equations."** → *Current context* immediately (the AI needs to respond to it now). *Also* a candidate for the Memory subsystem's misconception/knowledge-state pipeline (does this recur? is it corroborated?). It does **not** belong in "episodic memory" as its own category — it's a signal that episodic memory's formation process consumes, not a memory itself.
- **"My goal is to score 300 in JAMB."** → Almost entirely *Memory* (durable, structured, belongs in the profile layer) — but a *pointer* to it belongs in Context's always-present capsule (§7 in the Memory report), because "why does today's answer emphasize speed over depth" should be explainable by a fact the model can see without retrieval.
- **"You explained factorization to me using football examples yesterday."** → This is a *reference* the Context subsystem must resolve (§10-12 below) by retrieving from Memory's episodic layer — Context doesn't store this, it *resolves and injects* it.
- **"I'm currently doing question 17."** → This is *neither* Context nor Memory in the durable sense — it's **task/session state** (§9, §16 below), a third category your current three-layer framing doesn't have a home for, and its absence is very likely part of why "context bloat" and "weak prioritization" were flagged as current weaknesses — without an explicit task-state layer, this kind of fact has nowhere principled to live, so it either gets crammed into conversation history (bloat) or lost.
- **"I always get confused when the coefficient is negative."** → *Memory* (misconception fingerprint), but Context needs a fast, cheap way to check "is there an active misconception matching the current topic" *before* generating an explanation, not after — this is a retrieval-timing question, covered in §5.

So: **Conversation & Context is not a fourth memory type — it's the assembly and runtime layer that decides, for this exact message, what subset of everything (live conversation + task state + retrieved memory + identity) actually gets shown to the model.** That reframing is the report's single most load-bearing recommendation, and it's worth stating as such rather than leaving it implicit under section 15 of your list.

---

## 1-2. What an ideal conversation architecture and context architecture look like

**Conversation architecture** answers: how is the raw stream of WhatsApp messages organized into meaningful units? **Context architecture** answers: given those units plus everything else the system knows, what gets built into a prompt right now?

The research field treats these as genuinely separate problems with genuinely separate literatures — dialogue systems / topic segmentation research answers the first; context engineering / agent-memory research answers the second — and conflating them (treating "context" as just "however conversations happen to be chunked") is a common source of the exact weaknesses you flagged (weak prioritization, limited compression). The ideal architecture keeps them as two explicit stages: **segment, then assemble.**

A useful framing from recent context-engineering literature is that agent context management reduces to four operations — **write** (persist something outside the immediate context), **select** (retrieve/pull relevant persisted material back in), **compress** (reduce what's already accumulated), and **isolate** (keep some information out of the main thread entirely, e.g., in a sub-task or tool call, so it doesn't pollute the primary context). This is a genuinely useful vocabulary because it maps directly onto your subsystem's actual pipeline stages: "load memories" is *select*, "token counting + truncation" is a crude form of *compress*, and — this is the gap worth naming — there's currently no *isolate* step at all, which is part of why long conversations bloat: everything that happens ends up in one linear stream instead of some of it being handled in a scoped side-channel that doesn't need to persist into the main context.

---

## 3. How conversation state should work

**Conversation boundaries should not be a pure timeout.** Research on dialogue/topic segmentation is explicit that boundary detection benefits from combining multiple signals rather than relying on any single one — lexical/topical shift signals, semantic coherence between consecutive turns, and structural cues, rather than time gaps alone. For WaxPrep specifically, the practical signal stack, in order of cheapness:

1. **Time gap** (cheap, always available) — a genuinely useful *weak* signal (hours-to-days apart strongly suggests a new session), but not sufficient alone — a student can return after 20 minutes to a completely different subject, or send two messages an hour apart that are still the same thread ("let me try that problem... okay actually I got stuck").
2. **Subject/topic discontinuity** (cheap-ish — can be a lightweight classifier or even keyword/embedding similarity between the new message and recent context, not necessarily a full LLM call) — recent unsupervised dialogue-segmentation work does exactly this, assessing topic similarity between adjacent utterances via embeddings to decide where a break plausibly falls.
3. **Explicit signal** ("let's move to Physics now," "I have a new question") — cheap and high-confidence when present, worth pattern-matching for directly.

The important reframe: **don't treat "conversation" as one flat concept the way a WhatsApp thread suggests it should be.** The research distinction worth adopting is between a **session** (a burst of activity, likely bounded by time gaps — this is what "conversation_messages" probably already captures) and a **thread/topic** (a coherent subject-matter arc, which can span multiple sessions and can also have *multiple threads interleaved within one session* — your own example: Math → Physics → random question → Math → JAMB → Physics → back to the original Math problem). Treating these as the same thing is very likely the root cause of "whether switching subjects should split or preserve context" feeling like a hard question — it's only hard if you're trying to answer it with one data structure. With two (session boundary + thread tags on messages within and across sessions), the question dissolves: sessions split by time/explicit signal as before; **threads are a separate, non-exclusive tag** that lets "back to the original Math problem" be resolved by thread continuity even when three sessions and two subjects happened in between.

---

## 4. How context should be assembled

The anti-pattern named directly in your prompt — "take the last N messages" — is worth explaining *why* it fails, not just that it does: recent, well-replicated research on long-context LLMs shows a consistent **U-shaped accuracy curve** — models are much better at using information at the very beginning or very end of a long context than information buried in the middle, a phenomenon sometimes called "lost in the middle" or, more broadly, "context rot" as length grows. Two direct consequences for WaxPrep: (1) simply appending more history doesn't reliably help even if it fits in the token budget — a fact buried in the middle of a long recent-message dump can be effectively invisible to the model even though it's technically "in context"; (2) **where** retrieved material is placed in the assembled prompt matters as much as **whether** it's included — structured, front-loaded or clearly-delineated context (a labeled "Student Profile" block, a labeled "Relevant Prior Discussion" block) is more reliably used than an undifferentiated wall of raw history.

The assembly process that follows from this, concretely:

1. **Classify the incoming message** (cheap, fast — even heuristic/small-model): new question vs. continuation vs. reference-to-past vs. off-topic vs. task-status update. This determines *which* of the context sources below actually need to be pulled — this is the direct fix for "context prioritization is weak," because prioritization without a notion of *what kind of turn this is* has no principled basis to prioritize on.
2. **Always include** (cheap, fixed-size, no retrieval): the identity/profile capsule, current task/session state, last 2-4 raw turns for local coherence.
3. **Conditionally retrieve** based on step 1's classification: episodic search only if the message references the past; mastery/misconception lookup only if the message is topic-bearing; goal context only if pacing/motivation is relevant.
4. **Assemble with structure, not concatenation** — labeled sections, most important material at the start or end (not buried mid-block), consistent with the lost-in-the-middle finding above.
5. **Budget-check and compress** (§13) only the lowest-priority tier if over budget — never truncate blindly from the top or bottom without regard to what's being cut.

---

## 5. How context should interact with Memory

The interaction should be a **request/response boundary, not a shared read-write space.** Context is a *consumer* of Memory (read-mostly, at assembly time) and a *trigger* for Memory writes (it flags candidates; it doesn't decide durability itself — that's Memory's formation/consolidation logic, per the companion report's §7-8). Concretely:

- **Context reads from Memory synchronously, at assembly time**, but only the parts it classified as needed (step 3 above) — this is the direct fix for treating memory retrieval as monolithic ("load memories" as one undifferentiated step in your current flow diagram is exactly the pattern worth splitting).
- **Context writes to Memory asynchronously**, after the turn completes, by handing off candidate signals to Memory's background formation pipeline — never blocking the user-facing response on a memory-write.
- **Neither owns "truth" about the same fact in two places.** If mastery state lives in Memory's student model, Context should never independently maintain its own copy of "is this topic mastered" — it requests it fresh (or from a short-lived cache, §14) every time. Two systems each holding a slightly-stale copy of the same fact is a classic source of "conflicting messages" and "stale student information," two risks you explicitly flagged in §"CONTEXT SAFETY."

---

## 6. How context should interact with Identity/WaxID

Identity should be the **narrowest, most stable, least-often-recomputed layer** — closer to a lookup key than to "context" in the retrieval sense. Concretely: Identity resolves *which student this is* (and, given the sibling/shared-device edge case flagged in the Memory report's §23, ideally does some lightweight consistency checking — does this message's content match the existing identity's established profile facts, or does something suggest a different person is now texting from this number). Everything downstream (Memory, task state, conversation history) is *scoped by* the resolved identity, not merged with it. This should be the very first step in the assembly pipeline, before conversation loading — if Identity resolution is wrong, everything downstream is wrong, so it deserves to fail loudly and early rather than silently propagate.

---

## 7. How context should interact with the Student Model

Directly: the Student Model (Memory report §5, layer 3 — mastery, misconceptions, goals) should be consulted at two distinct points, not one:

1. **At assembly time**, for the topic-scoped lookup described in §5 above (is there a known misconception for this topic, what's current mastery).
2. **After generation**, as a trigger — did this turn produce evidence that should update the student model (a correct/incorrect answer, a new misconception surfacing, a stated goal)? This is a *write-trigger*, handed to Memory's async formation pipeline, not something Context resolves itself.

The mistake to avoid: letting Context *read* student-model data but have no path to *feed* new evidence back into it — that one-directional flow is exactly how a system ends up "confidently" teaching to a stale mastery level even though the live conversation just demonstrated the student has moved past it.

---

## 8-9. Long-term continuity and connecting multiple conversations

This is where the session/thread distinction from §3 pays off directly. "Continue what we were doing before" (your Conversation 10 example) resolves as: **find the most recent thread with no closing signal** — i.e., the most recent topic/thread tag whose last message wasn't resolved (no "got it, thanks," no explicit topic switch, no completed exercise) — ranked by recency, filtered by "still open." This is structurally similar to the "unfinished business" problem (§16) and arguably *is* the same mechanism: an open thread and an active task are close to the same underlying construct viewed from two angles (topic-continuity vs. completion-status).

Research on this class of problem — connecting scattered mentions of the same topic across a long dialogue history — increasingly treats it as an explicit **topic-continuity structure layered over episodic memory**, rather than something plain vector retrieval solves well on its own, precisely because pure similarity search (as covered in the Memory report's §9) has no notion of "this is a *continuation* of that specific earlier thing" versus "this happens to be semantically similar to several unrelated past things." A lightweight thread ID (not a full graph database — a foreign key linking messages/episodes that share a topic arc) gets most of the benefit at a fraction of the engineering cost of a full "conversation graph."

---

## 10. How unfinished tasks should be preserved

This deserves to be its own small, explicit table, not folded into conversation history or memory prose. A **task/session-state record** — separate from both raw messages and durable memory — with fields roughly like: what (an exercise, a set of questions, a specific unresolved question), status (in-progress/paused/abandoned), where they left off ("question 17 of 20"), and a soft expiry (a paused task that's been untouched for months is a different situation than one paused yesterday — it shouldn't vanish, but it also shouldn't be presented with the same urgency).

This directly answers "I'll finish these 10 questions later" → "they return tomorrow, should the system know that": yes, and the mechanism that makes it know isn't memory retrieval finding a relevant past message — it's a structured task-state row with `status: paused` being checked at the start of the next session, the same way a to-do list works, not the way a search engine works. Treating this as a search/retrieval problem instead of a structured-state problem is a subtle but real design trap.

---

## 11. Topic and thread continuity

Covered substantively in §3, §8-9. Worth adding the multi-thread-interleaving case explicitly, since it's the hardest version of what you described (Math → Physics → random → Math → JAMB → Physics → back to original Math problem): the practical answer is **threads as tags, not as exclusive containers.** A session can touch multiple threads; a thread can span multiple sessions; "back to the original Math problem" resolves by thread-ID continuity, not by session adjacency. This is a genuinely different data model from "a conversation is a conversation" and is very likely the single structural change with the highest payoff relative to engineering cost, because it's a modest schema addition (a thread/topic ID with light linkage logic) rather than a new subsystem.

---

## 12. How temporal references should work

"Yesterday," "last week," "earlier," "the last time," "this morning" — these resolve reliably only if **every stored unit (message, episode summary, task state) carries an unambiguous timestamp, and the system converts the relative reference into an absolute range before searching**, rather than trying to search on the fuzzy phrase itself. This is a small but important point: "the last time" isn't a search query, it's an instruction to **sort episodic memory by recency, filtered by topic if one is implied, and take the most recent match** — a structured operation, not a semantic-similarity one. Treating temporal phrases as things to embed-and-search (rather than as things to *parse into a time filter* and then search) is a common and avoidable mistake — this is the practical form of "timestamp-aware retrieval," and it's genuinely simpler than it sounds: a small pre-processing step that maps "yesterday" → an actual date range using the message's own send-timestamp as the reference point, before anything touches a vector index.

---

## 13. How context compression should work

Your own example (a summary saying "student struggled with algebra" losing the precise misconception) is exactly the failure mode the field calls **lossy compression destroying diagnostically important detail**, and it's worth taking seriously rather than treating as a minor tuning issue — recent empirical work comparing context-compression strategies for long-running agents found that naive LLM-based summarization and simpler non-LLM approaches (like masking/dropping less-relevant older content wholesale rather than rewriting it) perform comparably in many settings, which is a useful, slightly counter-intuitive finding: **more sophisticated summarization is not automatically safer than simpler selective retention** — sometimes keeping a smaller amount of *original* content verbatim beats summarizing a larger amount and hoping nothing important got smoothed away.

The practical implication for WaxPrep: **don't compress everything the same way.** Two different compression strategies for two different needs:
- **Narrative compression** (what happened, in prose) — fine for "what was the general arc of yesterday's session," genuinely lossy by design, acceptable for that purpose.
- **Structured extraction, not summarization, for anything diagnostically load-bearing** — a misconception shouldn't be compressed into a sentence inside a paragraph summary at all; it should be *extracted as a structured fact* (Memory report §7) *before* the raw conversation is ever compressed or discarded, so the diagnostic detail lives in a place immune to summarization's lossiness rather than being one clause in prose that a future summarization pass might further degrade.

This is really the same idea as the Memory report's structured-mastery-model recommendation, applied here: **anything that changes tutoring behavior should be extracted into structured form before compression touches it; only genuinely narrative material should ever go through prose summarization.**

---

## 14. How context prioritization should work

Your proposed tier sketch (current conversation / active task / relevant recent history / relevant long-term memory / general profile) is a reasonable starting intuition, and research on agent-memory retrieval scoring (Memory report §9-10 — recency/relevance/importance composite scoring) supports tiering as a real pattern, not just an intuition. The refinement worth making: **tiers should be scoped by message-classification (§4), not fixed.** A "continue from yesterday" message inverts the natural priority order — episodic history should outrank "current conversation" because there effectively *is* no current conversation yet to prioritize. A live in-session question inverts it back. So: keep the tier concept, but treat *which tier gets the most budget* as a function of the message-type classification step, not a static ordering applied uniformly to every turn.

---

## 15. How retrieval should work

Substantively covered by the Memory report's §9-10 (request-type-aware retrieval: structured lookup for facts that should never depend on search succeeding, recency-weighted episodic search for vague past-references, topic-filtered-then-recency-ranked for the interleaved-subjects case). The one addition specific to Context (as distinct from Memory) is **retrieval budget as a first-class parameter, not an afterthought**: decide *how much* to retrieve based on the token budget remaining *before* running the retrieval, not run retrieval at a fixed size and then discover it doesn't fit — this avoids the current-weakness pattern of "old content is essentially truncated," which is what happens when compression/truncation is the last step rather than something retrieval itself is aware of from the start.

---

## 16. How caching should work

Two genuinely different kinds of caching apply here, and conflating them is a common mistake:

**Application-level caching** (Redis or in-process) — for things that are expensive to *recompute* but don't need to be perfectly fresh every millisecond: the assembled profile capsule, recent mastery-state lookups, thread-open/closed status. Short TTLs (minutes) are appropriate — long enough to avoid redundant DB round-trips within a burst of messages, short enough that a same-session update (a student demonstrates new mastery mid-conversation) doesn't get served stale for long.

**Provider-level prompt caching** — a different mechanism entirely, worth understanding on its own terms because it's a major, currently-unexploited cost lever: Anthropic's API (and equivalents) let you mark a stable *prefix* of a request as cacheable, and subsequent calls that share that exact prefix get a large discount (cached-token reads priced around 10% of normal input cost) and a significant latency reduction — but the match is **literal byte-for-byte prefix match, not semantic** — if anything earlier in the prompt changes, the cache misses entirely from that point forward. The direct implication for context assembly: **structure the prompt with the most stable material first** (system instructions, tool definitions) and the most volatile material last (this turn's specific message) — this is a concrete architectural constraint that should shape how the system prompt and context object get built, not an unrelated infra detail. (Note: WaxPrep's current LLM provider affects exactly which caching mechanics apply — different providers implement this differently, and it's worth confirming current provider support rather than assuming Anthropic's specific numbers transfer directly, but the *general principle* — stable-content-first ordering pays off regardless of provider — holds broadly.)

**What should always be rebuilt, never cached:** anything touching current mastery state or task status — caching *staleness* here is a direct path to the tutor confidently teaching to an out-of-date understanding of the student, which is a worse failure than the latency/cost you'd save.

---

## 17. How versioning/provenance should work

Your "why did you tell me that yesterday" example is a genuinely good test case, and the honest answer is: **full reconstruction of a past context is expensive to guarantee and probably not worth guaranteeing exactly** — but a *lightweight* version is cheap and valuable: log, per response, a compact record of *what was included* (which episode summaries were retrieved, what mastery-state values were read, what task state was active) — not the full assembled prompt text, just references/IDs and key values. This gets you debuggability and a reasonable answer to "why did it say that" without the storage and complexity cost of true byte-for-byte reproducibility (full prompt snapshots for every turn, forever, is a real storage cost that scales with usage and mostly serves a debugging need that a lighter-weight log satisfies almost as well). Treat this as **debugging/audit infrastructure, scoped modestly**, not a formal versioning system — full reproducibility is the kind of thing worth deferring (§23) until there's a concrete need (a support/dispute case, a systematic quality investigation) that a lighter log can't answer.

---

## 18. Privacy and security for Context specifically

Most of the substantive privacy framework (NDPA, minors, data minimization, right to erasure) lives in the Memory report's §18 and applies here by inheritance, since Context is a consumer of Memory. The risks specific to *Context* as its own subsystem:

- **Cross-student context leakage** — the most acute version of this risk lives exactly where caching (§16) and identity resolution (§6) intersect: a caching layer keyed incorrectly (by session rather than by verified student identity, for instance) is a realistic path to one student's context bleeding into another's response. This argues for identity-scoped cache keys as a hard rule, not a convention.
- **Prompt injection inside old conversation history** — a student (or, in principle, content pulled in through some future tool/search capability) embedding instruction-like text in a message that later gets retrieved and re-injected into a system prompt as "prior context" is a real, documented category of risk in the broader agent-memory-security literature (the Memory report's §19 covers this for Memory specifically; the Context-specific angle is that *assembled* context — the system prompt built from retrieved material — is exactly the channel this kind of injection would travel through). The mitigation is the same one noted there: retrieved conversational content should be clearly delineated as *data*, not as instructions, in how it's assembled into the prompt (e.g., wrapped in an explicit "prior conversation excerpt" block the system prompt tells the model to treat as reference material, not directives) — a formatting/assembly discipline, not a separate security subsystem.
- **Wrong conversation association** — the sibling/shared-device case again: if identity resolution is wrong, every downstream context-assembly step compounds the error, silently mixing two people's histories. This is why §6 recommends identity resolution fail loudly rather than silently proceed on a low-confidence match.

---

## 19. How AI tools should interact with context

Your question — should the AI receive all context automatically, or request more through tools, or should retrieval itself be agentic — has a real, current answer in the field, and it's genuinely a spectrum rather than a binary:

- **Mandatory, always-injected context** (small, cheap): identity, profile capsule, task state, last few turns. No reason to make this tool-mediated — it should just always be there, because it's small and universally relevant.
- **Tool-accessible, on-demand context** (larger, situational): deeper episodic search ("what did we discuss about this topic three months ago"), broader student-history queries. Making these tool calls rather than automatic injections is the right instinct for exactly the reason your own document raised elsewhere — it avoids stuffing everything into every prompt, and it lets the model's own judgment about what's needed for *this specific message* narrow the retrieval, which is generally more precise than a fixed automatic-retrieval rule trying to anticipate every case.

This "some context automatic, some context tool-accessible" split is consistent with how production context-engineering guidance frames the write/select/compress/isolate operations (§1-2) — not everything needs to be pre-loaded; *selecting* via an explicit tool call, only when the model's own reasoning determines it's needed, is a legitimate and increasingly standard pattern, and it has a real secondary benefit worth naming: it keeps the *default* prompt small and cheap (good for the caching discipline in §16), while still giving the model a path to depth when a message genuinely calls for it. The risk to manage is latency (a tool-call round-trip mid-conversation adds real time, which matters less on WhatsApp than in a live chat UI, but isn't free) and over-triggering (a model that reaches for the "search deep history" tool on every message defeats the purpose) — both are solvable with reasonable tool-use instructions and monitoring, not fundamental blockers.

---

## 20. Token and cost management

Three distinct levers, worth keeping conceptually separate because they trade off differently:

1. **What gets included** (retrieval scope, §14-15) — the biggest lever, and the one earlier sections mostly address: better selection beats brute-force inclusion every time, both for cost and for quality (recall the lost-in-the-middle finding — more tokens isn't free even when you can afford them).
2. **How it's priced** (caching, §16) — a close second lever, and one that's currently likely unexploited given the "context caching is limited/nonexistent" self-assessment; structuring the prompt for prefix-cache-friendliness (stable content first) is close to a free win once implemented, independent of any retrieval-quality improvements.
3. **Which model handles which step** — not previously mentioned, but worth being explicit about: not every step needs your primary tutoring model. Cheap/fast model tiers are appropriate for classification (§4's message-type step), for candidate extraction (Memory report §7), and for background consolidation (Memory report §8) — reserving the more capable (and more expensive) model specifically for the actual tutoring response generation, where quality matters most directly to the student experience.

Your own instruction — don't optimize cost so aggressively the tutor stops feeling like it knows the student — is worth taking as a hard constraint on all three levers: the identity/profile capsule and task state (§4, §6, §10) should never be cut for cost reasons, even under budget pressure, because those are precisely the small, cheap things that carry disproportionate weight for "does this feel like the same tutor." Cost pressure should fall on the deep/optional retrieval tiers first, never on the always-present core.

---

## 21. Scalability

Largely inherits the Memory report's §20-21 analysis (Postgres+pgvector scales further than commonly assumed at WaxPrep's actual data volumes; the real cost driver is LLM calls, not storage; push deterministic operations into cheap SQL/embedding-similarity, reserve LLM calls for genuinely fuzzy steps). The Context-specific addition: **conversation/message tables are the fastest-growing data in the system by raw volume** (every single message, forever, for every student) — this is a legitimate case for a deliberate **archival policy separate from the memory-decay policy** discussed in the Memory report: raw message rows past some age can move to cold/cheaper storage once their content has been captured in episode summaries (Memory report §8), without that being a "forgetting" decision at all — the summary (and any structured facts extracted from it) remains fully active; only the redundant raw text moves to a slower, cheaper tier. This is a pure storage-cost optimization, orthogonal to the decay/forgetting logic that governs what influences retrieval and tutoring behavior.

---

## 22. Educational-specific context needs

Most of the substance here is shared with the Memory report's §2, §14-15 (mastery-aware context, misconception-aware context, goal-aware pacing). The genuinely Context-specific addition is **lesson/exercise-level continuity as its own structured unit**, distinct from both conversation and memory: a "lesson" or "exercise" (a bounded, multi-turn pedagogical unit — working through 10 practice questions, walking through a worked example) has its own natural state (in-progress/complete, which question, what's been covered) that's a closer cousin to the task-state concept in §10 than to either conversation history or long-term memory. Existing intelligent-tutoring-system research treats this kind of bounded pedagogical unit as a first-class construct (distinct from raw dialogue turns) precisely because tutoring has structure that generic conversation doesn't — a lesson has a beginning, an intended arc, and a completion criterion, none of which "conversation" as a WhatsApp-message-stream concept naturally captures. Building this as an explicit structured concept (not inferring it after the fact from message patterns) is likely to pay off directly in continuity quality — "let's pick back up on question 17" only works reliably if "question 17 of this specific exercise" was a tracked state, not a fact buried in chat history that has to be re-derived by search every time.

---

## 23. Evaluation

Directly usable, concrete metrics, ordered from cheapest-to-measure to hardest:

- **Reference resolution accuracy**: hand-build a small set of realistic test transcripts ("continue from yesterday," "explain it like last time," "remember I told you about JAMB") with known-correct resolutions, and check the system resolves them correctly — the same evaluation instinct recommended in the Memory report's §25 (a small hand-built regression set), applied specifically to conversation-continuity scenarios. This is genuinely low-cost to build and high-value as a regression check whenever the assembly pipeline changes.
- **Compression fidelity**: for a sample of compressed episode summaries, check whether the diagnostically important details (the *specific* misconception, not just "struggled with algebra") survived — this is checkable by a human reviewer on a small sample, doesn't need automated tooling to start.
- **Irrelevant-context rate**: does the assembled context include material that had no bearing on the actual response (a cheap thing to spot-check by reading assembled-context logs against the responses they produced) — this is the direct, measurable form of the "over-personalization creep" anti-pattern named in the Memory report's §22.
- **Repetition rate**: does the tutor re-explain something it already explained, or re-ask something already answered, within a short window — directly measurable from conversation logs without new instrumentation.
- **Cache hit rate and cost-per-conversation** — mechanical, already exposed by most LLM providers' usage metadata, and directly actionable (a stuck-at-zero cache hit rate, per the caching research above, is a clear, cheap-to-detect signal that §16's ordering discipline isn't being followed).

The harder-to-measure ones (does it "improve tutoring outcomes," does it "reduce false context") are real questions but need real usage data and a longer time horizon — worth designing the *logging* for now (so the data exists later) without expecting to answer them from day one.

---

## 24-25. What to implement now, later, never, and common mistakes

**Implement now** (directly addresses the flagged current weaknesses, low engineering cost relative to payoff):
- Message-type classification as the first step of assembly (§4) — the foundational fix that makes prioritization, retrieval scope, and compression all become well-posed problems instead of one-size-fits-all guesses.
- Session vs. thread as two separate concepts (§3, §9, §11) — a schema addition, not a new subsystem.
- An explicit task/session-state table (§10, §22) — directly fixes "I'm on question 17" and "finish later" continuity, which nothing in the current three-layer memory model has a clean home for.
- Structured extraction before compression for diagnostically important content (§13) — directly fixes the algebra-misconception-loss failure mode.
- Prefix-stable prompt structuring for caching (§16, §20) — likely a large, currently-unrealized cost win, cheap to implement.
- A small hand-built continuity-evaluation transcript set (§23).

**Implement later** (genuinely useful, but needs either more usage data or more scale to justify):
- Learned/trained topic-segmentation or message-classification models (start with cheap heuristics/small-model classification now, per §3-4; revisit with real data once volume justifies training something more sophisticated).
- Fuller context-versioning/reproducibility infrastructure (§17) — the lightweight logging version now, full snapshotting only if a concrete need emerges.
- Archival tiering for raw message storage (§21) — matters once volume makes it matter, not before.

**Should NOT be implemented** (mirrors the Memory report's §26 for consistency, since Context and Memory share an infrastructure philosophy):
- A full "conversation graph" database — the thread-as-tag approach (§9, §11) gets most of the value without the operational cost of a graph store.
- True agentic, fully-autonomous context retrieval with no mandatory/tool-accessible split (§19) — full agentic retrieval-for-everything adds latency and unpredictability that a WhatsApp tutor doesn't need; the hybrid split is the right level of sophistication for now.
- Exact full-prompt reproducibility for every historical turn — expensive relative to the debugging value it provides; the lightweight log (§17) is the appropriately-scoped version.

**Common architectural mistakes worth naming explicitly** (the throughline of this whole report, restated as a checklist):
1. Treating "context" as one undifferentiated blob assembled the same way for every message type, instead of branching on what kind of turn this is.
2. Letting compression run uniformly over everything instead of extracting structured, diagnostically-important facts *before* anything gets summarized.
3. Conflating "conversation" (a time-bounded session) with "topic" (a subject-matter thread that can span sessions) — this single conflation is very likely the root of several of the specific difficulties named in your prompt.
4. Treating temporal references ("yesterday," "last time") as search queries instead of as instructions to filter by an actual resolved time range.
5. Building caching without regard to prefix-stability ordering, and consequently getting none of the cost/latency benefit despite having "caching" nominally in place.
6. No explicit task/session-state layer, forcing "what was I doing" to be inferred from conversation history every time instead of read directly from structured state.

---

### Established vs. assumed, as requested

**Established / well-supported by research:** multi-signal (not pure-timeout) session boundary detection; lost-in-the-middle / context-rot degradation with long undifferentiated context; prefix-based prompt caching mechanics and their cost impact; naive summarization risking loss of diagnostically specific detail; write/select/compress/isolate as a useful vocabulary for context-management strategy.

**Recommended architecture (this report's synthesis, not a single citable source):** the session-vs-thread split; task/session-state as an explicit third layer distinct from Memory and raw conversation; message-type classification as the first assembly step.

**Assumptions made explicit:** that WaxPrep's current message/data volume makes Postgres-centric, non-graph, non-fully-agentic approaches sufficient for the foreseeable future — this should be revisited, not treated as permanent, if usage scales far beyond current levels.

**Open questions, genuinely unresolved by research and worth deciding deliberately rather than by default:** exactly how much latency budget a tool-mediated "deep retrieval" call can spend on WhatsApp before it hurts the experience; whether guardians should have any visibility into task/session state (inherits the same open question from the Memory report's §18); the right granularity for "lesson"/"exercise" as a structured unit across WaxPrep's actual subject content, which depends on curriculum specifics this report doesn't have visibility into.



Good — I have the full file. And your earlier question before this — "how will the AI know I was talking about Physics 10 turns ago?" — that is *exactly* what Stage 18 answers. That question is the entire reason Stage 18 exists. I'll explain it fully in the document. Let me do a few final research searches first.

I have everything I need. Now let me write this document properly — starting with a plain explanation of your earlier question, then going into the full architecture.

---

# WAXPREP — STAGES 18–21: COMPLETE PRODUCTION-GRADE RESEARCH DOCUMENT
## Context Engineering · Response Delivery · AI Orchestration · First Prototype
### Primary Research Architect — September 2026

---

# PREFACE: ANSWERING YOUR QUESTION FIRST

Before this document begins, I want to answer the question you asked before uploading this file, because it is the most important question in these four stages, and the entire document is really the answer to it.

You asked: **"How will the AI know I was discussing Physics 10 turns ago?"**

Right now, without Stage 18, the answer is: **it would not know.** Every time a student sends a message, the current system packages that one message and sends it to the AI in isolation. The AI responds to that one message with no knowledge of anything said before. It would be like calling a tutor, asking a question, hanging up, calling back, asking another question, and the tutor having amnesia every single call.

This is the problem Stage 18 solves.

The solution is not magic. It is engineering. When the student's message arrives and a job is ready to be processed, Stage 18's job is to go to the database, fetch the recent conversation history — say the last 20 turns of messages between the student and WaxPrep — and include them in the same package sent to the AI. So instead of sending "what is acceleration?", you send:

```
Student: "Sir I don't understand velocity"
AI: "Velocity is speed in a specific direction..."
Student: "Ok. What about momentum"
AI: "Momentum is mass times velocity..."
Student: "What about acceleration?"
```

Now the AI reads the whole conversation top to bottom and responds knowing that this student has been working through Newtonian mechanics, already understands velocity and momentum, and is now asking about acceleration. It can connect all of it.

The AI's memory is exactly the conversation history you put in front of it. Stage 18 is the system that assembles that history correctly, safely, and efficiently before every AI call. That is all it is — but done correctly, it is what makes WaxPrep feel like a real tutor rather than a goldfish.

Now the full document.

---

# 1. EXECUTIVE SUMMARY

Stages 18–21 complete WaxPrep's first working AI tutoring loop. Every stage before these built the pipes. These four stages put water in the pipes and prove it flows from student to AI to student continuously and coherently.

Stage 18 gives the AI short-term working memory by assembling the recent conversation history into each request. Stage 19 ensures every AI response is validated, formatted for WhatsApp, and delivered reliably. Stage 20 introduces a clean orchestration layer that coordinates all the pieces and adds basic provider fallback. Stage 21 wires all of it together into the first prototype that a real Nigerian student can actually use.

The architecture decisions in these stages are constrained by three non-negotiable facts. First, WaxPrep runs on WhatsApp, which has its own formatting rules, character limits, and delivery constraints. Second, the AI is the intelligence — the infrastructure must serve the AI's reasoning without replacing it. Third, every design decision made now must not require a rewrite when later stages add long-term memory, tools, retrieval, and student modeling.

The final recommendation at the end of this document is direct and specific. There will be no ambiguity about what to build.

---

# 2. WHAT THESE STAGES ACTUALLY MEAN

**Stage 18 — Context Window Management** is the working memory layer. It answers: when the AI worker is about to call the AI provider, what conversation history does it include, how much of it, and what happens when there is too much?

**Stage 19 — Response Validation, Formatting and Delivery** is the output gate. It answers: after the AI generates a response, what checks does it pass through before reaching the student, and how does WaxPrep format text for WhatsApp specifically?

**Stage 20 — AI Orchestration** is the coordination layer. It answers: which piece of code is responsible for calling Stage 18, then Stage 17 (system prompt), then the AI provider, then Stage 19, in the right order, handling failures gracefully?

**Stage 21 — First Prototype** is the integration stage. It answers: how do you wire Stages 18, 19, and 20 together with the existing infrastructure to produce a product that works end-to-end for a real student?

These are not separate features. They are four parts of one machine. They must be designed as a unit.

---

# 3. THE COMPLETE INFORMATION FLOW

```
Student types "Sir, I don't understand this quadratic equation"
↓
WhatsApp forwards message to WaxPrep's webhook (HTTPS)
↓
SECURITY GATE [Stages 9, 10]
  Signature verified (HMAC-SHA256)
  Payload normalized
  Inbound message persisted (messages table, status: 'received')
↓
IDENTITY [Stage 12]
  Phone normalized
  HMAC-SHA256 → phoneHash → WaxID resolved
  Account status checked (active/suspended/blocked)
↓
DEBOUNCE & QUEUE [Stage 6]
  Message added to debounce window
  If student sends more messages within 2.5 seconds → debounce resets
  Debounce fires → one BullMQ job with WaxID
  Returns 200 OK to WhatsApp immediately
↓
WORKER PICKS UP JOB [Stage 6]
  Per-student Redlock acquired
  session resolved or created [Stage 13]
↓
CONTEXT ASSEMBLER [Stage 18 — NEW]
  Fetch all unprocessed messages from this debounce window
  Fetch recent conversation history from messages table
  Calculate token budget
  Apply truncation if needed
  Produce AIMessage[] array (chronologically ordered)
↓
SYSTEM PROMPT BUILDER [Stage 17]
  Load waxprep_identity.v1.txt
  Inject {{CURRENT_DATE}}
  Return { systemPrompt, promptVersion }
↓
AI ORCHESTRATOR [Stage 20 — NEW]
  Build AIRequest { systemPrompt, messages, model, maxTokens, ... }
  Apply idempotency check
  Call primary provider through Stage 15 abstraction
    If primary fails with retryable error → fallback provider (if configured)
    If primary fails with non-retryable error → send student fallback message
  Record ai_requests entry [Stage 16]
↓
AI PROVIDER [Stage 15, 16]
  Anthropic Claude (or configured provider)
  Returns AIResponse { content, usage, finishReason, ... }
↓
RESPONSE VALIDATOR [Stage 19 — NEW]
  Empty check
  Prompt leakage check
  Repetition detection
  Format appropriateness check
↓
RESPONSE FORMATTER [Stage 19 — NEW]
  Markdown → WhatsApp syntax conversion
  Intelligent semantic chunking (≤1000 chars default)
  Chunk sequencing
↓
OUTBOUND DELIVERY [Stage 11, Stage 19 — NEW]
  Each chunk queued as outbound BullMQ job
  Per-student lock for sequential delivery
  Typing indicator sent before first chunk
  Chunk sent → WhatsApp API
  processing_status updated ('sent' → 'delivered' → 'read' via status webhooks)
  Redlock released
↓
Student reads WaxPrep's response on WhatsApp
```

Every step in this diagram has a failure path. Every failure path ends with either a retry (if the failure is transient) or a graceful student-facing message (if the failure is permanent or exhausted). No failure anywhere in this chain should produce silence for the student.

---

# 4. STAGE 18 — CONTEXT WINDOW MANAGEMENT (WORKING MEMORY)

## 4.1 The Fundamental Problem This Stage Solves

An LLM has no persistent memory. When you send a message to Claude or any other large language model, it processes only what you put in the current request. It has no idea what happened in previous API calls unless you include that information explicitly in the current request.

This is not a limitation of AI intelligence. It is the architecture of how transformer-based models work. The model attends to tokens. It can only attend to tokens that are present in its current context window. Tokens from previous API calls are gone.

This means that if your student sends ten messages and each one is processed as a separate, isolated AI call, the AI will respond to each message as though it is the first thing the student has ever said to it. The eleventh response will not know anything about the first ten exchanges. The student will experience WaxPrep as having severe amnesia.

Stage 18 solves this by doing something very simple: before each AI call, it fetches the recent conversation messages from the database and includes them in the AI request as the conversation history. The AI sees the full recent conversation — student messages and AI responses interleaved chronologically — and responds as though it has been in the room the whole time.

This is sometimes called a "context window" (the window of conversation the AI can see), "working memory" (the short-term memory of the current session), or "conversation history" (the literal record of what was said). All three terms refer to the same thing in this context. Stage 18 manages this window: what goes in, how much of it, and what to do when there is too much.

## 4.2 Context Window Reality — What the Numbers Actually Mean

**FACT:** Claude Sonnet 4.6 supports a 1,000,000 token context window as of 2026. This sounds enormous. A million tokens could hold approximately 750,000 words — the length of several long novels.

**CRITICAL INSIGHT:** The advertised context window is never the usable context window. Here is why.

The total tokens consumed by a single WaxPrep request are:

```
TOTAL = system_prompt_tokens
      + conversation_history_tokens  
      + current_message_tokens
      + [future: memory_tokens]
      + [future: tool_result_tokens]
      + [future: retrieved_knowledge_tokens]
      + response_reservation_tokens  ← this must be reserved before the call
      + safety_margin_tokens
```

The response reservation is particularly important. `max_tokens` (the configured maximum response length) must be subtracted from the usable input budget because Anthropic counts the total tokens (input + output) toward certain rate limits, and the model needs room to actually respond. If you fill the context window entirely with input tokens, the model may be able to say almost nothing in response.

For WaxPrep's practical situation in Stage 18, the math is reassuring. A typical WaxPrep session will have:
- System prompt: approximately 500–800 tokens
- Conversation history (20 turns of typical tutoring exchange): approximately 3,000–6,000 tokens
- Current message: approximately 20–100 tokens
- Response reservation: 1,024 tokens (configured `max_tokens`)
- Safety margin: 500 tokens

Total: approximately 5,044–8,424 tokens. This is less than 1% of Claude Sonnet 4.6's 1M token context window.

**This means that for the foreseeable life of WaxPrep's student base, context overflow is not an immediate technical crisis.** A student would need to have an extraordinarily long, uninterrupted session — thousands of turns — before hitting the context limit with Claude Sonnet. The number is comfortably small.

**However, Stage 18 must still implement proper token budget management.** The reasons are:

First, future stages will add tokens to the request. When long-term memory is added, those memory entries consume tokens. When retrieval is added, retrieved documents consume tokens. When tools are added, tool definitions consume tokens. Stage 18 must be designed so that when those future slots are added, the total budget is still managed correctly.

Second, not all providers have 1M token windows. If WaxPrep ever routes to Groq or uses a smaller model for cost reasons, the context limit may be much tighter (Groq models in 2026 typically have 8K–128K context windows, depending on the model).

Third, prompt caching (Anthropic's cost-reduction feature) works on stable content at the beginning of the context. If history keeps growing without truncation, eventually the cached stable content gets pushed out of its position and caching becomes less effective.

## 4.3 The Token Budgeting Model

**RECOMMENDATION:** Implement a strict slot-based token budget in the `ContextAssembler`. The total budget is defined as the model's usable context limit minus a conservative safety margin.

```
TOTAL_CONTEXT_BUDGET = model_context_limit - safety_margin

slot allocations:
  SYSTEM_PROMPT_SLOT    = 1,200 tokens  (generous for current + future growth)
  RESPONSE_RESERVATION  = 1,024 tokens  (= AI_MAX_OUTPUT_TOKENS from config)
  FUTURE_MEMORY_SLOT    = 800 tokens    (reserved, empty in Stage 18)
  FUTURE_TOOLS_SLOT     = 400 tokens    (reserved, empty in Stage 18)
  FUTURE_RETRIEVAL_SLOT = 1,200 tokens  (reserved, empty in Stage 18)
  CURRENT_MESSAGE_SLOT  = 400 tokens    (maximum expected per debounce window)
  SAFETY_MARGIN         = 500 tokens    (never touch this)

HISTORY_BUDGET = TOTAL_CONTEXT_BUDGET
               - SYSTEM_PROMPT_SLOT
               - RESPONSE_RESERVATION
               - FUTURE_MEMORY_SLOT
               - FUTURE_TOOLS_SLOT
               - FUTURE_RETRIEVAL_SLOT
               - CURRENT_MESSAGE_SLOT
               - SAFETY_MARGIN
```

For Claude Sonnet 4.6 (1M token window), the `HISTORY_BUDGET` will be enormous — far more than any real student conversation will ever consume. The budget model still matters because it is the mechanism future stages will use to limit themselves.

**The FUTURE_*_SLOT values are reserved but empty in Stage 18.** They are declared in the budget calculation as zero now but as named constants in code. When future stages are implemented, they replace the zero with actual token consumption. The budget calculation code does not change — only the slot values change.

## 4.4 Token Estimation — The Practical Method

**FACT:** Exact token counting requires calling the provider's tokenizer library. Anthropic provides `@anthropic-ai/tokenizer` for exact counts. However, calling the tokenizer on every request adds latency.

**RECOMMENDATION:** Use a character-based heuristic for token estimation in production, with the following well-established ratios:
- English text: approximately 4 characters per token.
- Nigerian English text: essentially the same (standard alphabet, similar word density).
- Code, numbers, and special characters: approximately 3 characters per token.

**The formula:**
```javascript
function estimateTokens(text) {
  // Conservative estimate: 3.5 chars per token (rounds up for safety)
  return Math.ceil(text.length / 3.5);
}
```

Use 3.5 (not 4) to be slightly conservative — underestimating token count is dangerous (you might exceed the budget), while overestimating is merely inefficient (you leave some tokens unused).

**Log the estimated token count for every request.** When actual usage is returned from the provider (which it always is in the `usage` field of the response), log the actual count too. Over time, analyze the ratio of estimated to actual to detect if the heuristic is drifting (it should not, but verifying is good operational practice).

**NEVER use exact tokenizer calls in the critical path of the context assembler for Stage 18.** The heuristic is accurate enough. Exact tokenization adds ~5–10ms of CPU time per request and a dependency to manage. Not worth it at this scale.

## 4.5 Conversation History Retrieval

The `ContextAssembler` must fetch conversation history from the `messages` table established in Stage 14. This is a straightforward database query, but several details matter.

**What to fetch:**
```sql
SELECT direction, type, content_json, whatsapp_timestamp, created_at
FROM messages
WHERE wax_id = $1          -- ALWAYS scope to the student
  AND session_id = $2      -- ALWAYS scope to the session
  AND deleted_at IS NULL   -- Exclude soft-deleted messages
  AND processing_status NOT IN ('failed', 'received')
    -- Exclude messages still in processing and permanently failed messages
    -- 'received' status means: arrived but not yet processed → not yet part of history
  AND type = 'text'        -- Stage 18: text only. Future stages add image/audio
ORDER BY created_at ASC    -- CRITICAL: chronological order, oldest first
LIMIT $3                   -- Configurable: AI_CONTEXT_MAX_MESSAGES
```

**WHY `ORDER BY created_at ASC`:** The AI reads the conversation history from top to bottom. The first message in the array should be the oldest (the beginning of the conversation) and the last should be the most recent. If you reverse this order, the AI reads the conversation backwards. It will respond as though it is at the beginning of the conversation when it is actually at the end. This produces bizarre, incoherent responses.

**WHY exclude `processing_status = 'received'`:** Messages in `received` status have arrived at the database but have not been processed by the AI yet. These are the messages in the current debounce window — they are the current student input, not the historical conversation. They should be passed as the current input (assembled separately from the history), not mixed into the history.

**What to include as "current messages":** After the debounce fires, fetch all messages with `processing_status = 'received'` for this student in this session. Sort them by `created_at ASC` (chronological order — the student's multi-message burst should be presented in the order they sent it). Group them logically into one "user turn" (all the student's current messages combined represent a single conversational contribution in the current debounce window).

**WHY this separation matters:** If the student sends "Sir" then "I don't understand" then "quadratic equations" within the debounce window, these three messages represent one conversational turn. They should be combined into a single user message: "Sir. I don't understand. Quadratic equations." (or presented as separate lines in one content block). They should NOT appear as three separate user turns in the conversation history — that would look unnatural to the AI and might cause it to respond to each phrase separately.

## 4.6 The Conversation Reconstruction Algorithm

Before assembling the history, the `ContextAssembler` must reconstruct the conversation as an alternating sequence of `user` and `assistant` turns. This is not always trivial from raw database records.

**FACT:** Anthropic's Messages API requires that the `messages` array strictly alternates between `user` and `assistant` roles. Two consecutive messages with the same role are rejected with a 400 error.

**FACT:** WhatsApp users often send multiple messages in sequence before the AI responds. The debounce handles the current window, but earlier in the session, the student may have sent several rapid messages that were processed together. In the database, these appear as multiple consecutive `inbound` records followed by one or more `outbound` records.

**The reconstruction logic must:**
1. Fetch messages in chronological order.
2. Group consecutive inbound messages into one `user` turn (combining their content).
3. Group consecutive outbound messages into one `assistant` turn (combining their content in order).
4. Alternate naturally: `user, assistant, user, assistant`.
5. Never produce two consecutive turns with the same role.

**EDGE CASE — Multiple outbound chunks:** When WaxPrep sends a long response split into multiple WhatsApp chunks, each chunk is a separate row in the `messages` table (all `outbound`, sequentially ordered by `chunk_index`). For context reconstruction, these multiple outbound rows represent one `assistant` turn. Concatenate them in `chunk_index` order with line breaks between them. Present them to the AI as one unified assistant response.

**EDGE CASE — Session starts with AI greeting:** If WaxPrep sends a first-time welcome message before the student says anything, the conversation history starts with an `assistant` message. This is valid — some providers allow assistant-first histories. Verify this is acceptable for the configured provider. For Anthropic, the first message in `messages[]` can be either `user` or `assistant`, but the array cannot start with two consecutive same-role messages.

## 4.7 The Truncation Algorithm

When the conversation history exceeds the history budget (which will rarely happen with Claude Sonnet 4.6's 1M window at Stage 18, but will happen eventually, and will happen sooner with providers that have smaller context windows), the `ContextAssembler` must truncate.

**RECOMMENDATION: Newest-First Retention — Remove Complete Turns from the Oldest End**

The correct algorithm is:

```
1. Estimate total tokens for full history
2. While estimated_tokens > HISTORY_BUDGET:
     a. Remove the oldest COMPLETE turn from the history
        (A "complete turn" = one user message AND the following assistant response, if present)
     b. If only a user message exists at the oldest position (no following assistant response),
        remove only that user message
     c. Re-estimate remaining tokens
3. Log: { removedTurns, originalTurnCount, finalTurnCount, estimatedTokens }
```

**WHY remove complete turns, not partial messages:** Removing half a user message or cutting an assistant response mid-sentence creates incoherent history. The AI might see a question without an answer, or an answer without a question. This produces confused, non-sequitur responses. Always remove the oldest complete exchange as a unit.

**WHY remove from the oldest end:** The most recent messages are the most relevant. The student is asking about something NOW. What they said 20 turns ago is less relevant than what they said 2 turns ago. Removing old turns preserves recent context while staying within the budget.

**WHAT NOT TO DO at Stage 18:** Do not implement summarization. Summarization (compressing old messages into a summary that is prepended to the truncated history) is an excellent technique for long conversations, but it adds significant complexity: it requires a separate AI call (costing tokens and latency), a summarization prompt, storage of the summary, and logic for when to regenerate the summary. This is Stage 22+ work. Stage 18's truncation is pure slice-and-remove. Simple, reliable, and sufficient for the session lengths WaxPrep will encounter at launch.

**LOG EVERY TRUNCATION as a warning:** Truncation should be rare at this stage. If it is happening frequently, that is a signal that either the budget allocation is wrong or sessions are running much longer than expected. Every truncation event should be logged at `WARN` level with the session ID, number of turns removed, and remaining turns.

## 4.8 Context Assembly — The Complete Picture

The `ContextAssembler` returns a structured context object, not just a flat array of messages:

```
ContextAssembly {
  messages: AIMessage[]         // The full conversation history including current input
  estimatedInputTokens: number  // Total estimated input tokens
  historyTurnCount: number      // How many history turns were included
  currentMessageCount: number   // How many current messages were aggregated
  wasTruncated: boolean         // Whether truncation was applied
  truncatedTurns: number        // How many turns were removed (0 if no truncation)
  
  // Slot usage for observability
  tokenUsage: {
    systemPromptEstimate: number
    historyEstimate: number
    currentMessageEstimate: number
    totalInputEstimate: number
    reservedForResponse: number
  }
}
```

The `AIOrchestrator` (Stage 20) receives this object and includes the `messages` array in the AI request. The metadata (`estimatedInputTokens`, `historyTurnCount`, etc.) is used for logging and stored in the `ai_requests` table.

## 4.9 Future Memory Slots — Designing for Extension

One of Stage 18's most important architectural responsibilities is making it easy to add future capabilities without rewriting context assembly.

**RECOMMENDATION:** Design the `ContextAssembler` to accept optional "slots" that future stages can fill:

```
ContextAssemblerInput {
  waxId: string
  sessionId: string
  currentMessages: NormalizedMessage[]  // Debounce window messages
  
  // Future slots (empty in Stage 18):
  longTermMemory?: MemoryEntry[]        // Stage N: episodic memory retrieval
  studentModel?: StudentModelSummary    // Stage N: what the AI knows about the student
  retrievedKnowledge?: KnowledgeEntry[] // Stage N: retrieved subject knowledge
  toolResults?: ToolResult[]            // Stage N: results from tool calls
}
```

In Stage 18, all optional slots are absent (undefined). The assembler checks whether each slot has content and, if so, includes it in the appropriate position in the context. If absent, it skips that slot. Future stages fill those slots without changing the assembler's core logic.

The position of each slot in the final context matters. A reasonable default ordering (from most stable to least stable, optimizing for prompt caching):

```
Context order:
  1. SYSTEM PROMPT (most stable → cache this)
  2. STUDENT MODEL (semi-stable, rarely changes)
  3. LONG-TERM MEMORY (retrieved, session-specific)
  4. RETRIEVED KNOWLEDGE (retrieved for current query)
  5. CONVERSATION HISTORY (session history)
  6. TOOL RESULTS (current turn, if any)
  7. CURRENT STUDENT MESSAGES (current turn, least stable)
```

Stage 18 populates only positions 5 and 7. Future stages populate 2, 3, 4, and 6 without changing the architecture.

## 4.10 WhatsApp Conversation Behavior — Special Considerations

WhatsApp conversations have characteristics that are different from desktop chat applications, and context assembly must handle them correctly.

**Multi-message bursts (ALREADY HANDLED by debounce):** Nigerian students on WhatsApp frequently send thoughts as multiple short messages: "Sir", "wait", "ok so the formula is F=ma right?", "but how do I find F". The debounce window (Stage 6) already handles this by waiting 2.5 seconds and aggregating all messages into one job. Stage 18 receives these aggregated messages and combines them into a single user turn. This is correct behavior.

**Corrections:** A student might send "The answer is 42" then immediately "no wait, I meant 24". The debounce aggregates these together. The assembled context shows the student saying both — "The answer is 42. No wait, I meant 24." The AI will naturally interpret this as a self-correction, which is the correct educational behavior.

**Voice notes (audio):** In Stage 18, audio messages should be included in the context as a placeholder note: "[Student sent a voice note — audio content not yet available]". This acknowledges the message without ignoring it, and gives the AI context that a voice note was sent. Future stages will transcribe audio and replace this placeholder. Without this placeholder, the AI would have a gap in the conversation — it would see a student message before and after the voice note with no indication of what happened in between.

**Mixed media:** Similarly, images in Stage 18 appear as: "[Student sent an image — image content not yet available]". Same rationale.

**IMPORTANT:** Do not silently skip media messages in context reconstruction. Skipping them creates invisible gaps in the conversation history that confuse the AI.

## 4.11 Context Integrity and Corruption Prevention

**Context corruption** is when the assembled history contains invalid, inconsistent, or malformed data that causes the AI to produce strange responses.

**Validation the `ContextAssembler` must perform before returning:**

1. **Alternating roles check:** Verify that the `messages` array strictly alternates between `user` and `assistant`. If it does not (indicating a reconstruction bug), log an error and attempt repair by merging consecutive same-role messages.

2. **Non-empty messages check:** No message in the array should have empty content. An empty message confuses the model. If an empty message is encountered, either remove it (if it was an assistant message with no content) or replace it with a placeholder (if it was a student message with no text content, e.g. a media message).

3. **Chronological order check:** Messages should be in ascending `created_at` order. If a timestamp anomaly is detected (a later message has an earlier timestamp than a preceding message), log a warning. Sort by timestamp regardless — do not assume the database returns them in order even with `ORDER BY`, as application-level bugs can reorder arrays.

4. **Maximum single message length check:** If any single message exceeds 2,000 tokens (approximately 7,000 characters), log a warning. This is an unusual situation (student pasted a very long text) and may warrant truncating that individual message to a safe length.

## 4.12 Performance Characteristics

**FACT:** The context assembler runs on every AI request, in the critical path between the student's message arriving and the AI responding. Performance matters.

**The database query:** A single `SELECT` from the `messages` table with the recommended indexes (`idx_messages_wax_session` on `(wax_id, session_id, created_at)`) will complete in under 5ms for typical session sizes. This is negligible.

**Redis caching:** Do NOT cache conversation history in Redis in Stage 18. The messages table is the source of truth. Caching history in Redis creates a consistency problem: if a message fails to be written to Redis (network blip), the next request assembles history that's missing the latest message. The database has the transactional guarantees that Redis does not. The database query is fast enough (under 5ms). Do not add caching complexity to optimize something that is not a bottleneck.

**The estimation computation:** Character counting and arithmetic. Sub-millisecond. Not a concern.

**The reconstruction logic:** A single pass over the fetched rows. Sub-millisecond for any realistic session size. Not a concern.

**Total Context Assembly overhead:** Under 10ms in total. This is acceptable — the AI call itself will take 2,000–15,000ms. A 10ms overhead is less than 0.5% of the total job time.

## 4.13 Context Logging — What to Log and What to Forbid

**LOG (at INFO level for every request):**
- `estimatedInputTokens` — total estimated input token count
- `historyTurnCount` — how many turns of history were included
- `currentMessageCount` — how many current messages were included
- `wasTruncated` — boolean
- `truncatedTurns` — number of turns removed (if any)
- `sessionId` — for debugging
- `waxId` — for debugging (WaxID is pseudonymous, safe to log)

**LOG (at WARN level when these occur):**
- Truncation events (with detail about how many turns were removed)
- Messages missing from history (gaps detected)
- Role alternation violations found and repaired
- Very large individual messages

**NEVER LOG:**
- The actual content of any message (student text is private)
- The assembled `messages` array content
- Any PII (phone numbers, names if stored)

**PRINCIPLE:** The context log tells you the shape of the context, not the content. Shape is operational data. Content is student data. They are different things. The database already stores the content for authorized audit purposes. Logs are not an audit trail — they are operational diagnostics.

---

# 5. STAGE 19 — RESPONSE VALIDATION, FORMATTING & DELIVERY

## 5.1 Why a Delivery Gate Is Non-Negotiable

Every AI-generated response must pass through a validation and formatting layer before reaching the student. This is not optional. The reasons are multiple.

Modern LLMs are capable but not perfect. Even the best models occasionally produce:
- Empty responses (the model generated nothing).
- Responses that accidentally include text that looks like the system prompt ("As per my instructions, I am WaxPrep, and my instructions say...").
- Repetitive loops where the same sentence is repeated multiple times.
- Markdown-formatted text (headers with `#`, bold with `**`) that renders as raw symbols on WhatsApp because WhatsApp uses different syntax.
- Responses with unusual Unicode characters that display strangely on Nigerian Android phones.

Beyond AI output quality, the delivery itself can fail. WhatsApp API calls timeout. Rate limits are hit. The network drops a request. Each of these failure modes needs a defined recovery path.

Stage 19 is the gate between the AI's output and the student's screen. Nothing passes through without being validated, formatted for WhatsApp specifically, and queued for reliable delivery.

## 5.2 WhatsApp Formatting — The Complete Technical Reference

**FACT:** WhatsApp uses its own simplified markup syntax. It is similar to Markdown but is NOT Markdown. Critical differences exist. The AI, trained on internet text, will sometimes produce standard Markdown (which does not render correctly on WhatsApp) or even HTML (which renders as raw tags).

**WhatsApp Supported Formatting:**

```
*bold*           → Bold text (single asterisk on each side, no spaces inside)
_italic_         → Italic text (single underscore on each side, no spaces inside)
~strikethrough~  → Strikethrough text (single tilde on each side)
```monospace```   → Monospace/code block (triple backtick on each side)
`inline code`    → Inline monospace (single backtick on each side)
> blockquote     → Block quote (greater-than sign at start of line, followed by space)
- bullet         → Bullet list (hyphen or asterisk at line start, followed by space)
1. numbered      → Numbered list (digit, period, space)
```

**WhatsApp DOES NOT Support:**
```
# Heading       → Renders as literal "# Heading"
## Heading      → Renders as literal "## Heading"
**bold**        → Renders as literal "**bold**" (double asterisk ≠ single asterisk)
__italic__      → Renders as literal "__italic__"
[link](url)     → Renders as literal text "[link](url)"
<b>html</b>     → Renders as literal "<b>html</b>"
---             → Renders as literal dashes
```

**IMPORTANT CONSTRAINT:** Bold cannot span multiple lines. If the AI wraps a bold phrase across a line break, the formatting will break. Bold must be applied per-line if needed.

**IMPORTANT CONSTRAINT:** Monospace (triple backtick) cannot be combined with other formatting. If you try to nest bold inside monospace, the inner formatting symbols appear as literal characters.

**WhatsApp Character Limit:**
- **FACT:** The hard platform limit for a single WhatsApp message is 4,096 characters. Messages exceeding this limit are rejected by the API.
- **PRACTICAL UX LIMIT:** Research consistently shows that WhatsApp messages over 300 characters see measurable drops in full-read rate in business contexts. For educational content, students need more text than a transactional message — but overwhelming a student with a 4,000-character wall of text on a mobile screen is counterproductive.
- **RECOMMENDATION:** Default chunk size of 1,000 characters for WaxPrep (`RESPONSE_MAX_CHUNK_CHARS=1000`). This is configurable. It balances sufficient context per message with readability on a phone screen.

**Unicode and Emoji:**
- WhatsApp supports Unicode fully. Yoruba, Hausa, and Igbo characters (where used) will render correctly.
- Emoji render correctly on both Android and iOS, but the visual appearance differs between platforms because Android and iOS use different emoji fonts. The meaning is the same; the visual styling differs.
- Mathematical symbols (π, Σ, ², ₃) are Unicode characters and render correctly on WhatsApp. The AI tutor should use these rather than ASCII approximations (pi, sum, ^2) where appropriate.

## 5.3 The Response Formatter — Markdown-to-WhatsApp Conversion

The AI will sometimes produce standard Markdown (especially when the system prompt does not explicitly restrict it). The response formatter must convert Markdown to WhatsApp's syntax.

**Conversion rules:**

```
## Heading → Convert to *Heading* (bold, no header syntax)
### Heading → Convert to *Heading* (bold, no header syntax)
**bold text** → *bold text* (double asterisk → single asterisk)
__italic__ → _italic_ (double underscore → single underscore)
[text](url) → text (URL) — WhatsApp auto-previews URLs; the link text becomes plain text
<br> → newline
<b> </b> → *  * 
Horizontal rules (---) → remove entirely or replace with a blank line

Mathematical: 
  x^2 → x² (Unicode superscript where available)
  x_1 → x₁ (Unicode subscript where available)
```

**What NOT to do:** Do not implement a full general-purpose Markdown parser. This adds unnecessary complexity. Implement only the specific conversions that are likely to appear in tutoring responses. The system prompt (Stage 17) should already instruct the AI to use WhatsApp formatting — the converter is a safety net for when the AI forgets, not the primary mechanism.

## 5.4 Output Validation — The Non-Negotiable Checks

Every AI response must pass these checks in order. If any check fails, the response is rejected and the appropriate recovery path is triggered.

**CHECK 1 — Empty Response:**
```
if (!response.content || response.content.trim().length === 0) {
  → REJECT: treat as MALFORMED_RESPONSE_ERROR
  → Retry once (AI occasionally generates nothing on the first try)
  → If still empty after retry: send student fallback message
}
```

**CHECK 2 — Minimum Meaningful Length:**
```
if (response.content.trim().length < 10) {
  → WARN: response is suspiciously short for a tutoring context
  → Do NOT reject — the AI may legitimately respond with "Yes." or "Correct!"
  → Log the short response for monitoring
  → Allow through
}
```

**CHECK 3 — Repetition Detection:**
```
Split response into sentences.
If any sentence appears 3 or more times consecutively:
  → REJECT as MALFORMED_RESPONSE_ERROR
  → Retry once
  → If still repetitive: send student fallback message

A response like:
  "Let me help you. Let me help you. Let me help you. Let me help you."
indicates a model failure mode and should never reach a student.
```

**CHECK 4 — Prompt Leakage Detection:**

The AI should never reproduce its system prompt back to the student. This can happen (rarely) when the AI is confused about the boundary between its instructions and the conversation.

```
Load the system prompt text from SystemPromptBuilder.
Check if any consecutive 50-character substring from the system prompt 
appears verbatim in the AI response.

If YES:
  → WARN: possible prompt leakage detected
  → Log at WARN level (for investigation)
  → For Stage 19: allow through but log — do NOT reject, because:
      a) The match might be coincidental (common educational phrases)
      b) Rejecting may leave the student with no response
  → Future dedicated safety stage will handle this more robustly.
```

**NOTE on the prompt leakage check:** This is a lightweight heuristic, not a sophisticated detector. It will have false positives (common tutoring phrases that appear in both the prompt and a response). At Stage 19, the goal is to detect obvious leakage ("As per my instructions..."), not to build a full NLP classifier. Implement the 50-character substring check as a first pass and refine based on actual incidents.

**CHECK 5 — Safety Finish Reason:**
```
if (response.finishReason === 'safety_refusal') {
  → Do NOT send the refusal text to the student
  → Log at WARN level: { waxId, sessionId, finishReason }
  → Send a neutral fallback: "I'm not able to help with that. 
    Is there a school subject I can assist you with?"
}
```

**WHAT NOT TO CHECK IN STAGE 19:**
- Do NOT implement NLP-based harmful content detection in Stage 19. This belongs in a dedicated future safety stage.
- Do NOT implement factual accuracy checking. The AI's educational knowledge must not be second-guessed by infrastructure rules.
- Do NOT implement style or tone policing. The AI decides how to communicate. Infrastructure delivers what the AI says.

## 5.5 The Intelligent Message Splitter

After validation, if the response is longer than `RESPONSE_MAX_CHUNK_CHARS`, it must be split into chunks for sequential delivery.

**RECOMMENDATION: The Semantic Paragraph-First Splitting Algorithm**

```
Algorithm:

1. If response.length <= RESPONSE_MAX_CHUNK_CHARS:
     Return [response] (single chunk, no splitting needed)

2. Split response on double-newline boundaries (paragraph breaks: \n\n)
3. Build chunks by accumulating paragraphs:
     - Start with empty current_chunk
     - For each paragraph:
         If current_chunk + "\n\n" + paragraph <= RESPONSE_MAX_CHUNK_CHARS:
             Append paragraph to current_chunk
         Else:
             If paragraph itself <= RESPONSE_MAX_CHUNK_CHARS:
                 → Flush current_chunk as a complete chunk
                 → Start new current_chunk with this paragraph
             Else:
                 → This paragraph is too long — split at sentence boundary:
                     Find the last ". " or "! " or "? " position 
                     within RESPONSE_MAX_CHUNK_CHARS from start of paragraph
                     Split there, flush first part, continue with remainder
4. Flush final current_chunk as last chunk
5. Filter out any chunk that is empty or only whitespace
6. Return ordered chunk array
```

**Edge cases the splitter must handle:**

- **Numbered lists:** A numbered list should not be split in the middle. If a list item would be separated from its preceding items, keep them together. If keeping them together would exceed the limit, start a new chunk with the continuation note: "Continuing..." — but only if the split is truly unavoidable.

- **Mathematical expressions:** Do not split mid-equation. If a formula `F = ma` would be split between two chunks, keep it together in one chunk.

- **Code blocks (monospace):** Never split inside a triple-backtick monospace block. The opening and closing backticks must always be in the same chunk.

- **Single-character residue:** Never produce a chunk that is only one or two characters. Merge it back into the previous chunk (even if that chunk exceeds the limit slightly — being 10 characters over the limit is better than sending a chunk containing just "." to a student).

**Chunk count monitoring:** Log the number of chunks for every split response. If a response is being split into more than 5 chunks, log a warning — either the AI is producing unusually long responses or `RESPONSE_MAX_CHUNK_CHARS` is set too low. Five WhatsApp messages in a row, even sequential, begins to feel like a flood.

## 5.6 The Delivery State Machine

Every outbound message has a lifecycle. This lifecycle must be explicitly tracked.

```
State machine for each outbound message chunk:

GENERATED     → Response text produced by AI, passed to validator
     ↓
VALIDATED     → Passed all validation checks, formatted for WhatsApp
     ↓
QUEUED        → Added to outbound BullMQ queue as individual chunk job
     ↓
SENDING       → Outbound worker picked up the job, calling WhatsApp API
     ↓
SENT          → WhatsApp API returned 200, message ID recorded
     ↓
DELIVERED     → Meta sent delivery webhook (message reached device)
     ↓
READ          → Meta sent read webhook (student opened the message)

Failure states:
SEND_FAILED   → WhatsApp API returned error
RETRY_QUEUED  → Send failed, job requeued for retry (up to QUEUE_MAX_RETRIES)
PERMANENTLY_FAILED → All retries exhausted

Recovery from PERMANENTLY_FAILED:
  → Log at ERROR level
  → The student did not receive the response
  → On the student's NEXT message: the AI context will include the outbound message 
    attempt in history (as sent text). The AI can be told (via system prompt context 
    in a future stage) that a previous response may not have been delivered.
  → Do NOT attempt to re-send automatically without the student's next action.
```

**Database representation:** The `messages` table `processing_status` column tracks this state. Status transitions are made by the outbound worker and by the status webhook handler.

**Timestamps matter:** Record a `sent_at` timestamp when the WhatsApp API confirms the send, a `delivered_at` when the delivery webhook arrives, and a `read_at` when the read webhook arrives. These timestamps enable future latency analysis (how long does delivery take?) and quality analysis (do students read the responses?).

## 5.7 Delivery Timing and WhatsApp UX

**Research findings on WhatsApp message UX for educational content:**

The typing indicator (Stage 11 infrastructure, Stage 19 integration point) should be sent when the AI processing starts — not before, not after. Sending it before processing begins (e.g., at webhook receipt) is misleading — WaxPrep is not yet "typing" anything. Sending it after processing completes is pointless. The correct moment is when the AI worker acquires the per-student lock and is about to call the AI provider.

**Inter-chunk delay:** When sending multiple chunks sequentially, insert a delay of `RESPONSE_CHUNK_DELAY_MS` (default: 500ms) between chunks. The reason is not rate limiting (WhatsApp allows much faster than this) — the reason is UX. Receiving three WhatsApp messages arriving simultaneously (even 50ms apart) feels like being hit with a wall of content. A 500ms pause gives the student's eye a chance to follow the natural rhythm of reading.

**Do NOT insert artificial delays to simulate typing:** Some chatbots add delays proportional to message length to simulate a human typing speed. This is unnecessary and slightly dishonest. Students using WaxPrep in 2026 understand they are talking to an AI. Fast delivery is a feature. The only delay is the 500ms inter-chunk pause for UX readability.

**Ideal educational response structure for WhatsApp:** Research on educational mobile messaging suggests:
- One concept per message chunk where possible.
- Short explanatory paragraph, then a check or question, in separate chunks.
- Mathematical steps shown one line at a time when possible.
- No walls of unbroken text — use line breaks within a chunk to separate ideas.

The AI's system prompt (Stage 17) should guide this behavior. The formatter should not impose structure on top of the AI's natural output — it should only handle the mechanical formatting rules (Markdown conversion, chunk splitting, character limits).

## 5.8 Failure Recovery Strategy

```
Failure at GENERATED stage (empty or repetitive response):
  → Retry AI call once (same provider, same prompt)
  → If still failing: send AI_FAILURE_STUDENT_MESSAGE
  → Record ai_requests with status 'failed', error_type appropriate

Failure at VALIDATED stage (prompt leakage detected):
  → Log warning
  → Allow through (Stage 19 is not a blocking gate for this — future safety stage handles)

Failure at SEND_FAILED stage (WhatsApp API error):
  → BullMQ retries with exponential backoff (up to QUEUE_MAX_RETRIES)
  → If 429 (rate limit): wait Retry-After header value before retry
  → If 400 (invalid recipient): mark permanently failed, stop retrying
  → If 500/503: retry

All permanent failures:
  → Log at ERROR level
  → Ensure the student receives SOME response
  → Update processing_status to 'permanently_failed' on the outbound message rows
```

**The invariant:** The student must always receive a response. Not always the AI's response — but always something. Silence after sending a message is the worst possible experience. A friendly "I'm having a moment, please try again" is dramatically better than silence.

---

# 6. STAGE 20 — AI ORCHESTRATION & ROUTING

## 6.1 What an Orchestrator Is and Why WaxPrep Needs One

Before Stage 20, the AI worker (the BullMQ job handler) directly orchestrates the AI call. It calls Stage 18 to get context, calls Stage 17 to get the system prompt, calls Stage 16 to make the AI call, and calls Stage 19 to validate and format. All of this is done inline in the worker's job handler function.

As the system grows, this inline orchestration becomes unmaintainable. The worker function becomes hundreds of lines long. Testing any single step requires running all steps. Adding a new step requires carefully inserting it in the right order. Error handling for each step is scattered through the worker function.

Stage 20 extracts all of this coordination into a dedicated `AIOrchestrator` class. The worker function becomes five lines: get context, get system prompt, call orchestrator, validate response, queue delivery. All the intelligence about how those steps relate to each other, how failures at each step are handled, and what order everything happens in lives in the orchestrator.

**This is the Mediator pattern applied to AI infrastructure.** The orchestrator is the single point of coordination. The worker does not need to know how the AI is called — it only knows that it calls the orchestrator with student and session context and receives a validated response.

## 6.2 The Orchestrator's Responsibilities

```
AIOrchestrator.process({waxId, sessionId, currentMessages, correlationId})
  → AIOrchestrationResult

AIOrchestrationResult {
  success: boolean
  response?: ValidatedAIResponse  // if success
  failureReason?: string           // if !success
  aiRequestId: string              // the ai_requests record ID
  metricsForLogging: OrchestratorMetrics
}
```

Internally, the orchestrator:

```
1. Build context (Stage 18 ContextAssembler)
2. Build system prompt (Stage 17 SystemPromptBuilder)
3. Build AIRequest (Stage 15 schema)
4. Check idempotency (has this exact set of messages already been processed successfully?)
5. Call primary provider (Stage 15 AnthropicAdapter)
   On RETRYABLE error:
     a. Wait appropriate backoff
     b. If fallback provider configured: try fallback
     c. If fallback fails or not configured: throw retryable error (BullMQ retries)
   On NON-RETRYABLE error:
     a. Record failure in ai_requests
     b. Return failure result (do not retry)
6. Record success in ai_requests
7. Validate response (Stage 19 ResponseValidator)
   On validation failure:
     a. Retry AI call once
     b. If still failing: return failure result
8. Format response (Stage 19 ResponseFormatter)
9. Return AIOrchestrationResult with formatted response
```

The orchestrator owns the full error handling for AI failures. The worker only needs to handle two outcomes: success (queue the response for delivery) and failure (the orchestrator already recorded the failure and the worker sends the fallback message).

## 6.3 Provider Routing and Fallback Architecture

**FACT (from research, June 2026):** When Anthropic disabled certain models without notice, any hardcoded model ID broke immediately. The correct architecture treats the model ID as runtime configuration, not a hardcoded constant. This is already established in Stage 15 (model comes from `config.AI_PRIMARY_MODEL`). Stage 20 extends this with a fallback chain.

**The Fallback Chain:**

```
PRIMARY_CHAIN = [config.AI_PRIMARY_PROVIDER + config.AI_PRIMARY_MODEL]
FALLBACK_CHAIN = [config.AI_FALLBACK_PROVIDER + config.AI_FALLBACK_MODEL]  // optional

On any request:
  1. Try PRIMARY_CHAIN[0]
  2. If PRIMARY_CHAIN[0] returns retryable error:
       If FALLBACK_CHAIN is configured:
         3. Try FALLBACK_CHAIN[0]
         4. If FALLBACK_CHAIN[0] succeeds: return result
         5. If FALLBACK_CHAIN[0] fails: throw retryable error (BullMQ retries full chain)
       Else (no fallback):
         3. Throw retryable error (BullMQ retries primary)
```

**CRITICAL RULE: Only attempt fallback on availability errors, not correctness errors.** If the primary provider returns a 400 (malformed request), attempting the fallback with the same request will also produce a 400. Burn rate for nothing. Fallback only on:
- `RATE_LIMIT_ERROR` (429)
- `PROVIDER_SERVER_ERROR` (500/503)
- `TIMEOUT_ERROR` (AbortSignal timeout)
- `MODEL_UNAVAILABLE_ERROR` (404 for model not found, 503 for model overloaded)

Do NOT fallback on:
- `AUTHENTICATION_ERROR` (401/403) — both providers would fail if the key is wrong
- `INVALID_REQUEST_ERROR` (400) — same bad request will fail everywhere
- `CONTEXT_LENGTH_ERROR` — same oversized context will fail everywhere

**Configuration for fallback:**
```
AI_FALLBACK_PROVIDER=openai        # Optional — if blank, no fallback
AI_FALLBACK_MODEL=gpt-4o-mini      # Optional
AI_FALLBACK_API_KEY=sk-...         # Optional — secret
```

If fallback configuration is absent, the orchestrator operates in single-provider mode. This is fine for Stage 20 launch. Fallback is an optional enhancement that adds resilience.

## 6.4 Provider Capability Metadata Registry

As the system grows, different providers will have different capabilities. The orchestrator needs to know what each provider can do so that it does not attempt to use a feature the active provider does not support.

**RECOMMENDATION:** Maintain a capability registry as code-level constants per adapter (already established in Stage 15). The orchestrator reads these capabilities before building the request to ensure it does not include features the provider does not support.

**Stage 20 relevant capabilities:**

```javascript
// AnthropicAdapter capabilities (Stage 20 relevant subset):
{
  supportsText: true,
  supportsImageInput: true,          // (but not used until Stage N)
  supportsToolCalling: true,         // (but not used until Stage N)
  supportsPromptCaching: true,
  supportsStructuredOutput: true,    // via tool calling / JSON mode
  maxContextTokens: 1000000,
  maxOutputTokens: 8192,
}
```

In Stage 20, the orchestrator uses only `supportsText`, `supportsPromptCaching`, and `maxContextTokens`. The others are read but not used yet. Future stages read the additional capabilities.

## 6.5 Structured Outputs — Architecture Decision for Future Compatibility

**FACT:** Structured outputs (also called JSON mode) allow you to instruct the AI to return a JSON object matching a specific schema. This is useful for AI-powered classifications, assessments, and data extraction — all of which WaxPrep will need in future stages.

For example, a future stage might ask: "Given this conversation, classify: (a) what subject is the student working on, (b) what concept is confusing them, (c) is the student making progress?" — and receive a structured JSON response that can be processed programmatically.

**At Stage 20:** WaxPrep does not need structured outputs for basic tutoring. The AI's text responses are the product. However, the orchestrator architecture must not make structured outputs difficult to add later.

**RECOMMENDATION:** Add an optional `responseSchema` field to the `AIRequest` schema:

```javascript
AIRequest {
  // ... existing fields ...
  responseSchema?: object   // JSON Schema for structured output (null = free text)
}
```

When `responseSchema` is null (Stage 20 default), the adapter ignores it and requests normal text. When populated (future stages), the adapter enables structured output mode and validates the response against the schema. This single optional field is all that is needed to preserve future compatibility.

## 6.6 Observability — What to Capture at the Orchestrator Level

Every orchestration run should produce a log entry and a database record. The AI request record is already established in Stage 16 (`ai_requests` table). Stage 20 enriches this record with orchestration-specific metadata.

**Additional fields for `ai_requests` table (new in Stage 20):**
```sql
ALTER TABLE ai_requests ADD COLUMN fallback_attempted BOOLEAN DEFAULT FALSE;
ALTER TABLE ai_requests ADD COLUMN fallback_provider TEXT;        -- Which fallback was used
ALTER TABLE ai_requests ADD COLUMN fallback_model TEXT;
ALTER TABLE ai_requests ADD COLUMN context_turn_count INTEGER;    -- How many history turns
ALTER TABLE ai_requests ADD COLUMN context_was_truncated BOOLEAN;
ALTER TABLE ai_requests ADD COLUMN validation_passed BOOLEAN;
ALTER TABLE ai_requests ADD COLUMN validation_issues TEXT[];      -- Array of issue codes
ALTER TABLE ai_requests ADD COLUMN chunk_count INTEGER;           -- How many chunks output
```

**Log at INFO level for every successful orchestration:**
```
{
  correlationId, waxId, sessionId,
  provider, model, promptVersion,
  inputTokens, outputTokens, cachedInputTokens,
  latencyMs, finishReason,
  historyTurnCount, contextWasTruncated,
  chunkCount,
  fallbackAttempted: false
}
```

**Log at WARN level for fallback events:**
```
{
  correlationId,
  primaryProvider, primaryError,
  fallbackProvider, fallbackModel,
  fallbackLatencyMs, fallbackSuccess
}
```

This observability data answers the operational questions that will matter in the first weeks after launch: Is the primary provider reliable? How often is fallback triggered? Are responses getting truncated? What is the average latency?

---

# 7. STAGE 21 — THE FIRST FUNCTIONING PROTOTYPE

## 7.1 What "Working" Actually Means

Stage 21 is not a new set of features to build. It is an integration milestone — the first moment that all previous stages (18 through 20, and everything before them) work together in an unbroken chain to serve a real Nigerian student over real WhatsApp.

The prototype is complete when the following scenario works reliably:

```
Scenario: A student studying for WAEC sends WaxPrep a message about Physics.

Student sends: "Good morning sir"
WaxPrep responds: [A warm, appropriate greeting that establishes tutoring context]

Student sends: "Please I need help with Newton's laws"
WaxPrep responds: [An explanation of Newton's laws in accessible language]

Student sends: "I don't understand the second one"
WaxPrep responds: [A focused explanation of Newton's Second Law, referencing 
                   that we just talked about Newton's laws]

Student sends: "Ok. So if I have a 5kg object and I apply 10N of force"
WaxPrep responds: [Walks through F=ma calculation step by step]

Student sends: "I got 2 m/s² is that right"
WaxPrep responds: [Confirms the student's answer, possibly deepens the concept]
```

This five-turn exchange demonstrates everything Stage 18–21 delivers: the AI maintains context across turns (remembers Newton's laws were discussed), adapts to the student's level, is patient and educational in tone, solves the specific mathematical problem, and engages with the student's attempt. None of this requires long-term memory or advanced capabilities. It requires a working context window, a good system prompt, and a reliable delivery pipeline.

## 7.2 First-Time User Experience

The very first message from a new student is handled by the AI's system prompt, not by a scripted onboarding flow. This is a deliberate architectural choice aligned with the Newborn AI philosophy.

The system prompt already establishes that WaxPrep is a tutor for Nigerian secondary students preparing for WAEC, NECO, JAMB, and BECE. When a new student sends their first message, the AI will naturally respond in a way that is contextually appropriate — if they say "good morning", the AI greets them warmly; if they immediately ask a physics question, the AI dives into tutoring.

**Do NOT build a scripted onboarding wizard.** No sequence of "Welcome! Please enter your name. Now please select your exam. Now select your subject." Scripted onboarding is rigid, fails when students give unexpected responses, and violates the conversational nature of WhatsApp. The AI handles onboarding naturally through conversation.

**One optional consideration:** The system prompt (Stage 17) can include a note that if the AI detects this appears to be a student's first message (no conversation history in context), it should briefly establish the tutoring context. This gives the AI awareness without scripting the exact words. Example instruction in the system prompt: "When a student appears to be contacting you for the first time (no prior conversation visible), warmly welcome them and ask what subject or exam you can help with. Keep this brief — follow the student's lead." This is a behavioral hint, not a script.

## 7.3 Conversation Continuity Within a Session

Within a single session (defined by the Stage 13 inactivity timeout of 30 minutes), the student will experience genuine continuity. Stage 18's context assembler ensures that every AI call includes the recent conversation history. The AI sees the full session conversation and responds as though it has been present for all of it.

**What the student experiences:**
- References to earlier topics ("as we discussed earlier, F = ma")
- Natural follow-up ("So building on the acceleration calculation we just did...")
- Correction acknowledgment ("Right, you said 2 m/s² — and that's correct")
- Concept scaffolding (the AI can build on what has already been explained in the session)

**What happens when a new session starts (after 30+ minutes of inactivity):**
The student's next message starts a new session. The context assembler fetches history from the new session — which has no history yet. The AI sees only the system prompt and the student's new message, with no knowledge of previous sessions.

This is correct behavior for Stage 21. The student may notice that WaxPrep "doesn't remember" them from yesterday. This is expected and acceptable. Long-term memory across sessions is a future stage, not a Stage 21 requirement.

**The system prompt should acknowledge this reality honestly.** Something like: "Each conversation session is fresh — you may need to briefly re-establish context at the start of a new session." This sets appropriate expectations without being apologetic about a limitation that will be solved in a future stage.

## 7.4 Error Recovery — Every Path Ends with a Student Response

The prototype must guarantee that no matter what goes wrong internally, the student never receives silence. Every error path must have a defined student-facing outcome.

```
ERROR SCENARIO 1: AI provider is down
  Student sends a message
  → Worker processes job
  → AI call fails (PROVIDER_SERVER_ERROR)
  → BullMQ retries 3 times with backoff
  → All retries fail
  → Orchestrator returns failure
  → Worker sends: "I'm having a little difficulty right now. 
    Please try again in a few minutes — I'll be here."

ERROR SCENARIO 2: Student's message is too short or ambiguous
  Student sends: "sir"
  → Message processed normally
  → Context assembled (including previous history if any)
  → AI interprets "sir" as a greeting or attention-getter
  → AI responds naturally: "Good morning! What would you like to 
    work on today?" or similar
  → This is not an error — the AI handles it

ERROR SCENARIO 3: AI produces empty response
  → ResponseValidator detects empty content
  → AIService retries once
  → If still empty: sends student fallback message
  → ai_requests record updated with status 'failed', error_type 'malformed_response'

ERROR SCENARIO 4: WhatsApp delivery fails
  → Outbound worker retries (BullMQ)
  → If all retries fail: marks outbound message as permanently_failed
  → Next time student contacts: AI context shows the attempted response 
    (as history shows it was sent) — AI can offer to re-explain if student reports 
    not receiving an answer

ERROR SCENARIO 5: Context assembly fails (database error)
  → Worker job fails
  → BullMQ retries
  → If database recovers: retry succeeds
  → If database is unavailable: eventually all retries exhaust
  → Student receives fallback message after QUEUE_MAX_RETRIES * backoff time
```

**The key invariant:** After any error that exhausts all retries, the student receives a message. Never silence.

## 7.5 Prototype Reliability — What Makes It Trustworthy

For a prototype to be trustworthy enough to show to real students, it needs:

**Idempotency across the full pipeline:**
- Duplicate WhatsApp webhooks → same message ID → `ON CONFLICT DO NOTHING` → not reprocessed
- Duplicate BullMQ jobs → same job ID → deduplicated by BullMQ
- Duplicate AI calls → idempotency key check in AIService → return cached result
- Duplicate outbound sends → `UNIQUE (outbound_chunk_id)` → not sent twice

**Correct ordering:**
- Messages within a debounce window → assembled chronologically (timestamp ASC)
- Response chunks → sent sequentially with per-student Redlock
- History → retrieved and ordered chronologically

**Graceful SIGTERM handling (deployments):**
- In-flight AI jobs complete before the process exits (worker.close() with timeout)
- In-progress outbound deliveries complete before exit
- No messages are lost during a Railway deployment

**Health monitoring:**
- `/health` endpoint (Stage 7) confirms the process is alive
- `/ready` endpoint confirms database and Redis are reachable
- Worker health endpoint (minimal HTTP server) confirms the worker is running

## 7.6 The Smoke Test Plan — How to Manually Verify the Prototype

Someone holding any phone with WhatsApp should be able to run through this test plan and confirm the prototype is working.

**Test 1 — Basic Response (2 minutes)**
- Send WaxPrep: "Good morning"
- Expected: A warm greeting acknowledging the tutoring context. Within 30 seconds.
- Pass criteria: Response received, appropriate educational tone, no raw system prompt text visible.

**Test 2 — Subject Question (3 minutes)**
- Send WaxPrep: "Please explain Newton's First Law"
- Expected: A clear, accessible explanation. Within 45 seconds.
- Pass criteria: Correct content, student-appropriate language, no technical errors in the message, delivered in 1-3 WhatsApp messages.

**Test 3 — Context Memory (5 minutes)**
- After Tes