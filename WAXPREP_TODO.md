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


I have everything. The voice memo is clear: skip the consent flow scripting and cost tracking, research everything else, and flag where the proposals violate AI-first principles. Let me research the most critical factual questions first.

I have everything I need. Writing the complete research document now.

---

# WAXPREP — CROSS-CUTTING CAPABILITIES RESEARCH
## Stages 47–56: Deep Architectural Investigation
### Research Architect Report — September 2026

---

# BEFORE ANYTHING ELSE: THREE MAJOR CORRECTIONS

These must be stated before the research begins because they affect every recommendation that follows.

**Correction 1: The wrong law is cited throughout the brief.** The brief repeatedly references "NDPR 2019" as the governing Nigerian data protection law. The NDPR 2019 was replaced and repealed by the Nigeria Data Protection Act 2023 (NDPA), signed into law on June 12, 2023. The NDPC (Nigeria Data Protection Commission) is now the regulating body, not NITDA. Every legal compliance decision in Stage 47 must be made under the NDPA 2023, not the NDPR 2019.

**Correction 2: "Exactly-once processing" does not exist.** Stage 54 uses the term as an engineering goal. True exactly-once delivery is mathematically impossible across a network (the Two Generals Problem). The correct engineering goal is idempotent at-least-once processing — design your operations to be safely repeatable so that processing something twice produces the same result as processing it once. This is not a pedantic distinction. Building toward "exactly-once" leads to architecturally wrong decisions. Building toward "idempotent at-least-once" leads to architecturally correct ones.

**Correction 3: The scripted command detection violates AI-first.** Throughout Stage 47 and Stage 53, the spec proposes detecting commands like "DELETE MY DATA", "YES", "NO", "WITHDRAW CONSENT", and similar keywords using deterministic string matching. This directly contradicts WaxPrep's AI-first philosophy. A student might say "I want to remove everything WaxPrep knows about me" — that must work just as well as "DELETE MY DATA". The AI must understand intent, not match keywords.

---

# EXECUTIVE SUMMARY

The capabilities covered in this research fall into three buckets.

The first bucket contains things that must exist before WaxPrep touches a single real student. These are not optional maturity items. They are baseline obligations: data protection compliance under the NDPA 2023, basic idempotency to prevent duplicate responses, backup so student learning history is not permanently lost, and minimum security hardening to prevent the most common attacks. These must happen at or before first deployment.

The second bucket contains things that should be architecturally understood now but built incrementally as WaxPrep accumulates real production data. AI response evaluation and hallucination detection belong here. You cannot evaluate what does not exist yet, and the evaluation framework becomes more valuable as WaxPrep has more real interactions to analyze.

The third bucket contains things that can wait. No detailed cost tracking or usage analytics are needed before first deployment. The NDPA has no fine for not tracking your own API costs on day one.

The most important decisions you must lock now — before writing any code — are architectural decisions about data isolation, deletion rights, and idempotency patterns. Getting these wrong creates technical debt that compounds over the entire lifetime of the system. Getting them right costs almost nothing extra.

---

# BEGINNER EXPLANATIONS

Before diving into the research, here is what each topic actually means, explained plainly.

**Privacy and Data Protection:** When WaxPrep interacts with a Nigerian student, it stores data about them — their learning history, what they struggled with, what they understood. This data belongs to the student (or their parent, since most students are minors). Nigerian law (the NDPA 2023) gives students the right to know what data is stored, to get a copy of it, and to have it deleted. If WaxPrep ignores these rights, it is breaking the law. The question is not whether to comply, but how.

**AI Response Evaluation:** WaxPrep's AI gives students answers. Some answers will be wrong or unhelpful. How do you find out which ones, and how do you fix them over time? That is what evaluation frameworks do — they measure the quality of AI outputs systematically so you can improve intentionally rather than by guesswork.

**Hallucination Detection:** AI models sometimes generate confident-sounding information that is factually incorrect. In a tutoring context, a hallucinated biology fact can harm a student preparing for WAEC. Hallucination detection is the problem of catching these errors before or after they reach a student.

**Idempotency:** Imagine a student sends a WhatsApp message. Due to a network error, the same message arrives at WaxPrep's server twice. Without idempotency, WaxPrep processes it twice and the student receives two identical AI responses. With idempotency, WaxPrep recognizes it has already seen this message and produces exactly one response. This is not about being fancy — it is about basic reliability.

**Backup and Disaster Recovery:** Right now, all of WaxPrep's data lives in one database on Railway. If that database is corrupted, accidentally deleted, or the provider has a catastrophic failure, all of a student's learning history is gone permanently. Backup means copying that data somewhere safe. Disaster recovery means knowing step-by-step how to get back to normal if something goes catastrophically wrong.

**Security Hardening:** By default, software is not secure. Security hardening is the process of actively addressing known vulnerability classes — making sure passwords are not in logs, making sure the database cannot be queried directly by the internet, making sure the application does not reveal internal error details to users. OWASP (Open Web Application Security Project) maintains a list of the ten most common and dangerous vulnerability patterns. Checking WaxPrep against this list is what security hardening means.

---

# DEEP RESEARCH: STAGE 47 — PRIVACY, CONSENT AND DATA ISOLATION

## The Law: NDPA 2023 (Not NDPR 2019)

The Nigeria Data Protection Act 2023 is Nigeria's first comprehensive data protection statute, enacted June 12, 2023, replacing the NDPR 2019 entirely. Every data protection decision in WaxPrep must be made under this law. The key provisions that directly affect WaxPrep:

**Data Subject Rights under NDPA 2023 (Section 24-30):**

The right of access: students can request a copy of all data WaxPrep holds about them, in a commonly used electronic format.

The right to rectification: students can request correction of inaccurate or incomplete data.

The right to erasure: students can demand deletion of their data when it is no longer needed for the original purpose, when consent is withdrawn, or when there is no longer a lawful basis for processing. The word the NDPA uses is "erasure without undue delay" — not "soft deletion with the data still present."

The right to data portability: students can receive their data in a machine-readable format and, where technically feasible, have it transferred directly to another service.

**The Critical Finding on Minors (Section 31):** Under the NDPA 2023, WaxPrep's students are minors (under 18). The Act explicitly requires that consent for processing children's data must be obtained from parents or legal guardians — not from the children themselves. Section 31(1) states that data controllers must obtain the explicit consent of parents or guardians. The Act requires that data controllers adopt consent verification mechanisms.

This is a direct collision with the proposed WhatsApp consent flow. Sending a consent message to the student's WhatsApp and having them type "YES" is not legally sufficient consent for a minor under the NDPA 2023. WaxPrep is collecting consent from the child, not the guardian.

**What this means practically:** WaxPrep cannot be fully NDPA-compliant with a student-only WhatsApp consent flow. The practical approach for a startup in this position is: acknowledge the limitation, document the intention to achieve compliance as the product matures, and build the consent infrastructure in a way that can be upgraded to include parental consent mechanisms later. Do not pretend the student-only flow is legally complete — it is not.

**The Erasure Problem — Soft Delete vs. Actual Deletion:**

The proposed Stage 47 spec says: "Soft-delete all data (change status, don't actually remove for NDPR audit trail)."

This is wrong in two ways.

First, the law cited (NDPR) has been replaced by the NDPA.

Second, the NDPA's right to erasure means actual deletion, not just status flagging. Setting `status='deleted'` while keeping all of the student's messages, memories, and learning history in the database does not constitute erasure. The data is still there. A database administrator can still read it. A compliance audit would find it.

The correct approach: when a student (or their guardian) requests deletion, actually delete or cryptographically destroy the data. The approach of keeping content with `content='[DELETED]'` placeholders satisfies audit trail requirements (WaxPrep knows something was deleted at a certain time) while removing the actual personal information. However, keeping `phone_hash='[DELETED]'` may also not be correct — if no data associated with a WaxID remains, the WaxID record itself may need to be removed or permanently anonymized.

There is a legitimate need to retain certain non-personal records for internal analytics (session counts, aggregate learning statistics). This is acceptable under data minimization principles as long as these records genuinely cannot be linked back to an individual. A row containing only `{ session_duration_minutes: 42, subject: 'physics', date: '2026-09' }` with no WaxID or any identifier is genuinely anonymized and can be retained.

**What the Consent Flow Should Actually Look Like:**

The proposed flow uses hardcoded keyword detection. The student types "YES" or "NO" and the system branches based on string matching. This violates AI-first in exactly the way the voice memo described.

The AI-first approach: the consent context is part of the AI's system prompt for new student interactions. The AI is informed that new students must provide consent before data collection begins. The AI naturally explains what WaxPrep collects and why. The student's response — whether they say "yes," "okay," "sure," "I agree," or "absolutely, let's go" — is understood by the AI as consent. The AI makes the determination. The infrastructure records the determination.

The infrastructure still records a consent event — this is not optional, it is a legal requirement. But the trigger for recording that event comes from the AI's judgment about what the student said, not from a keyword match. The consent record in the database is created when the AI indicates consent has been given, not when the string "YES" is detected.

Per the voice memo: the scripted consent flow (type YES/NO) is deferred. The data isolation infrastructure, deletion capability, and data export capability are still needed. The consent flow itself is left for a later stage where it can be implemented in an AI-first way and potentially upgraded to include parental consent mechanisms.

**On Message Content Encryption:**

The spec proposes encrypting `messages.content` at the application layer using `pgcrypto`. This requires careful analysis before implementing.

Application-level encryption of message content means: every time WaxPrep wants to retrieve a message to build context for an AI call, it must decrypt it first. This adds decryption overhead to every single tutoring interaction. It also means the `content` column cannot be indexed, searched, or used in database queries (you can only retrieve it, not filter by it). This is a significant operational tradeoff.

The primary threat encryption addresses is: someone gaining access to the database dump without access to the encryption key cannot read message content. This is a meaningful protection against database theft.

However, at-rest encryption at the database level (Railway likely provides this by default for managed PostgreSQL) and TLS encryption in transit already address many of the same threats without the operational overhead.

The decision: implement application-level encryption of `messages.content` only if there is a clear threat model that requires it beyond what TLS and at-rest encryption provide. For a startup, the operational cost may outweigh the security benefit. This is a decision to make after consulting the threat model, not a default to apply.

## What WAXPREP Needs for Privacy — Summary

The absolute baseline before any student touches WaxPrep:

1. The legal foundation is NDPA 2023, not NDPR 2019. Document this explicitly.
2. A `consents` table must exist to record when and how consent was given.
3. A data deletion capability must exist that actually removes or cryptographically destroys personal data when a student requests it, not merely flags it as deleted.
4. A data export capability must exist so a student can receive all data WaxPrep holds about them.
5. The AI handles the consent flow, understands deletion and export requests, and triggers the infrastructure that executes them.
6. Every database query that touches student data must include a WaxID filter. This must be audited.

What can wait: full NDPA compliance including parental consent verification, cross-border data transfer controls, formal Data Protection Officer appointment, and NDPC registration (though this should be planned for as WaxPrep grows).

---

# DEEP RESEARCH: STAGE 48 — AI RESPONSE EVALUATION FRAMEWORK

## What Evaluation Actually Is and Why It Matters

Imagine WaxPrep has been running for three months. The AI has responded to 50,000 student messages. How do you know if those responses were good? How do you know if a change to the system prompt improved quality or made it worse? How do you catch the cases where the AI confidently stated something wrong?

Without evaluation infrastructure, the answer to all of these questions is "we don't know." Evaluation infrastructure is what turns WaxPrep from a system you deploy and hope works well into a system where quality is measured, tracked, and improved over time.

## The LLM-as-Judge Architecture

The foundational research here is G-Eval (Liu et al., 2023, OpenAI), which established the pattern of using a stronger or equal-capability LLM to evaluate the outputs of another LLM. The judge receives the student message, the AI tutor's response, and a rubric describing what a good response looks like. It returns a score and a justification.

The research findings from 2025-2026 are nuanced:

LLM judges achieve good agreement with human raters when the rubric is clear and the criteria are objective (VERA-MH shows 0.81 alignment between LLM judges and licensed clinicians for safety criteria). LLM judges fail when the evaluation requires deep domain expertise or when detecting subtle forms of hallucination. For educational factual accuracy in Nigerian secondary curriculum, the LLM judge may not reliably detect errors in specialized topics (the judge hallucinates about the subject being evaluated). Using a judge model from a different family than the tutor model (e.g., evaluating Claude Sonnet's output using GPT-4o as judge) reduces self-serving bias.

## What the Proposed Stage 48 Gets Wrong

Several of the "deterministic checks" in the proposed evaluator are scripted and violate AI-first:

`student_name_used: does response use student's name if known?` — checking for name presence by string search is a keyword check, not an evaluation. The AI might refer to the student by context without using their name. This check is not meaningful.

`memory_referenced: does response reference injected memories? (check for key terms)` — checking for key term presence is a keyword filter. The AI might use the information from a memory without repeating the exact words in the memory.

These "deterministic checks" should be removed or replaced with checks that are genuinely deterministic and useful: is the response non-empty? Is it within expected length bounds? Does it contain obvious structural problems (repeated characters, null bytes, truncated markdown)? These check structure, not semantic quality.

The semantic quality evaluation — factual accuracy, pedagogical quality, tone appropriateness, context utilization — belongs to the AI judge, not to pattern matching.

## When Evaluation Should Run

The spec implies running evaluation on every production response. This is expensive and adds latency if done synchronously. The production-grade approach is:

**Offline evaluation:** runs asynchronously after messages are delivered, against a random sample of production traffic. Does not affect tutoring latency. Produces aggregate quality metrics over time. This is the right default.

**Pre-deployment regression testing:** before every system change (prompt update, model change, tool addition), run a curated evaluation suite against the proposed change. This is what catches regressions before they reach students.

**Targeted live evaluation:** for specific high-stakes flows (the first 10 messages in a new student's experience, any session that triggered a crisis signal), run evaluation as a post-processing step with higher priority.

## The Hallucination Problem Specifically

For WaxPrep, hallucination is when the AI tutors state something factually incorrect about Nigerian secondary curriculum. This is educationally harmful.

The research findings: LLM judges are surprisingly poor at detecting factual hallucinations in their own domain. A judge LLM may confidently evaluate a wrong answer as correct if it shares the original model's knowledge gap.

The more reliable approaches for factual accuracy:

Consistency sampling: generate the same response multiple times with higher temperature and measure disagreement. High disagreement suggests the model is uncertain, which correlates with hallucination. This is expensive but does not require ground truth.

Ground truth comparison: maintain a small curated dataset of key factual claims with verified correct answers (WAEC past question solutions, fundamental science facts). Evaluate model responses against this ground truth using the judge. This is the most reliable approach and requires ongoing curation.

Post-hoc web search validation: for specific factual claims in responses, use web search to verify the claim against authoritative sources. Expensive at scale, but very effective for high-stakes responses.

## The Evaluation Dataset

The spec mentions "a curated set of test cases with expected behaviors." This is correct and important. What it does not emphasize enough: this dataset is WaxPrep's most valuable engineering asset over time. Every time the AI makes a significant error on a real student interaction, that interaction (anonymized) should become a test case. Every time a change to the system prompt is made, the test suite should prove it improved quality rather than just feeling better.

The dataset must be built from day one, even if it starts with only 20 manually authored examples. Growing to 200, then 2000, with a mix of:

- Standard curriculum questions with verified correct answers
- Edge cases where the AI previously made errors
- Safety-adjacent educational topics (reproduction in Biology, etc.) where the AI must respond educationally
- Scenarios designed to probe for the specific failure modes WaxPrep has encountered

## Classification

🟡 PREPARE NOW — IMPLEMENT INCREMENTALLY

The evaluation schema and tooling should be built before the first 1,000 messages, not before the first 100. The curated test dataset should be started immediately. Full automated evaluation runs against production traffic should begin when WaxPrep has meaningful traffic to sample from.

---

# DEEP RESEARCH: STAGE 54 — IDEMPOTENCY AND AT-LEAST-ONCE PROCESSING

## The Correct Mental Model

The Two Generals Problem (1975, Gray) proves that across any unreliable network, it is impossible to guarantee that a message is delivered and acted upon exactly once without any chance of duplication or loss. This is not a solvable engineering problem. It is a mathematical impossibility.

Therefore: "exactly-once processing" is not the right goal. The right goal is "idempotent at-least-once processing." This means:

1. Accept that the same message may be processed more than once.
2. Design every operation so that processing it a second time produces the same result as processing it once.
3. If the result is already stored, detect that and skip re-processing.

The terminology "effectively exactly-once" is sometimes used to describe this pattern when it works correctly: from the outside, it appears as if each operation happened once, even though the underlying system may have processed it multiple times.

## Where Idempotency Already Exists in WaxPrep

The spec describes Stage 10 as already having deduplication. Looking at the existing architecture:

WaxID resolution uses upsert with `ON CONFLICT` — this is idempotent.

BullMQ job deduplication via `jobId` — BullMQ's built-in deduplication using the job ID is exactly the right mechanism. When the same WhatsApp message ID is used as the job ID, BullMQ silently ignores the second enqueue attempt. This is the most important single idempotency protection in the system.

The WhatsApp webhook idempotency from Stage 8/9 — the existing unique constraint on `whatsapp_message_id` in the messages table (the `ON CONFLICT DO NOTHING` pattern) handles duplicate webhook deliveries at the database level.

## What Is Missing

AI call idempotency: the spec proposes using a Redis key `"ai_called:{messageId}"` to detect whether an AI call has already been made. The problem: Redis persistence. If Redis restarts or crashes and `appendonly` or RDB snapshots are not configured correctly, the Redis key disappears. The worker restarts, does not find the key, and makes the AI call again. The student gets a second response.

The more durable approach: use the `ai_requests` table (Stage 16) as the idempotency store. Before making an AI call, query `SELECT id FROM ai_requests WHERE triggering_message_id = $1 AND status = 'success'`. If a record exists, retrieve the stored response rather than calling the AI again. PostgreSQL with ACID guarantees is the correct store for idempotency records, not Redis.

Outbound message idempotency: the spec proposes a Redis key `"sent:{waxId}:{triggerMessageId}"`. Same problem as above — Redis is not durable without proper configuration, making this unreliable as an idempotency store. Use the outbound messages table in PostgreSQL instead. Before sending a chunk, check if a record with this `outbound_chunk_id` and `processing_status = 'sent'` already exists.

Evidence record idempotency: adding a unique constraint `UNIQUE (wax_id, message_id, concept_tag)` on `learning_observations` and using `INSERT ... ON CONFLICT DO NOTHING` is exactly correct. This is the right approach.

Memory write idempotency: using `message_id` as an idempotency guard is correct in concept. Store this guard in PostgreSQL (in the `learning_observations` table or a dedicated `processed_events` table), not in Redis.

## The Redis Durability Warning

Redis by default is configured for performance, not durability. Data in Redis can be lost on crash. For idempotency guards that prevent duplicate AI calls (which cost money) and duplicate messages (which harm student experience), Redis is not a reliable store. Use PostgreSQL.

Redis is correctly used for: debounce delays (Stage 6), per-student locks (Stage 6/Stage 12), typing indicator management, and session caching where brief loss is acceptable. Not for idempotency records.

## Classification

🟢 BUILD NOW (partially already done)

The BullMQ jobId deduplication and PostgreSQL `ON CONFLICT DO NOTHING` patterns should be verified to exist correctly in the current codebase. PostgreSQL-based idempotency guards for AI calls and outbound messages should be added before first production deployment.

---

# DEEP RESEARCH: STAGE 55 — BACKUP AND DISASTER RECOVERY

## What Railway Actually Provides

Railway's backup capabilities are plan-dependent. As of 2026, Railway provides automated daily snapshots for managed PostgreSQL databases, but the retention period and reliability depends on your plan. Railway's documentation says backup frequency and retention are "managed by provider plan" — you must check the Railway dashboard to confirm exactly what protection you have.

The research finding that should alarm you: 73% of backups fail when tested for restore in production (per the railway-postgres-backups project documentation). An untested backup is not a backup. It is a false sense of security.

## The Correct Backup Architecture for WaxPrep at Startup Scale

Three layers:

Layer 1: Railway's built-in automated snapshots. This is your fastest path to recovery after a major incident because Railway can restore from a snapshot within their infrastructure. Verify this is enabled for your plan. Understand the retention period.

Layer 2: Off-site backups using a deployed backup service. Railway's marketplace has ready-made PostgreSQL backup services (postgres-s3-backup, Postgres Daily Backups) that run as Railway services, automatically run `pg_dump`, compress the output, encrypt with AES-256, and upload to any S3-compatible storage (Backblaze B2 is the cheapest at startup scale — approximately $0.006/GB/month). These services also include automated restore verification drills. Deploy one of these services.

Layer 3: A documented recovery runbook that has been tested. Write the steps down. Then actually follow them against a test database. Time the recovery. Document the result.

Recommended off-site storage for cost-conscious startup: Backblaze B2 (cheapest), Cloudflare R2 (free egress, very competitive), or Supabase Storage free tier. Avoid AWS S3 as your first choice because the egress costs add up.

## RPO and RTO for WaxPrep

RPO (Recovery Point Objective) — how much data loss is acceptable: 24 hours is acceptable for a startup. This means daily backups are sufficient. If WaxPrep grows to a platform where losing 24 hours of student learning history is unacceptable, increase backup frequency.

RTO (Recovery Time Objective) — how quickly service must be restored: 4 hours is a reasonable target. This means having a documented and tested recovery runbook, not just believing you could figure it out if something went wrong.

## The Backup Encryption Issue

The spec recommends GPG encryption for backups. GPG with symmetric encryption is reasonable but has a practical problem: the decryption passphrase must be available when you need to restore — typically during a stressful incident. Document exactly where the passphrase is stored (a secure password manager, not another service in the same infrastructure that might also be down during the disaster). The pre-built Railway backup services (postgres-s3-backup) use AES-256-CBC encryption, which is equally strong and operationally simpler to work with.

## Redis Backup

The spec does not mention backing up Redis. For WaxPrep's current architecture, Redis holds: BullMQ job state, debounce timers, session locks, rate limiting counters. Most of this is ephemeral and recoverable — jobs can be re-enqueued from PostgreSQL records if needed. However, any idempotency guards stored in Redis are lost on Redis failure (another reason to store idempotency records in PostgreSQL instead). Redis does not need a separate backup strategy if the data it holds is genuinely ephemeral.

## Classification

🟢 BUILD NOW — LAYER 1 AND 2

Verify Railway's automated backups are enabled before first production deployment. Deploy a backup service (postgres-s3-backup or equivalent) to Backblaze B2. Write the DISASTER_RECOVERY.md and do a single test restoration before going live with real students.

---

# DEEP RESEARCH: STAGE 53 — RATE LIMITING AND ABUSE PREVENTION

## Two Distinct Problems

Rate limiting and abuse prevention are related but distinct problems that require different solutions.

Rate limiting is a structural protection: prevent any single entity from consuming more than their fair share of system resources. It protects against accidental overuse, bugs that cause message loops, and deliberate denial-of-service attempts. Rate limiting is appropriate to implement as deterministic infrastructure — there is no ambiguity about whether 11 messages in one minute exceeds a limit of 10.

Abuse detection is a behavioral problem: identify when usage patterns suggest harmful intent rather than legitimate learning. A student sending 50 messages per minute might be testing the system, running a script, or genuinely in a frenzied study session. Which is it? This requires contextual judgment — the AI is better positioned to assess it.

## The Scripted Abuse Detection Problem

The spec proposes: "3 identical messages in a row triggers the abuse detection response." This is keyword/pattern matching applied to behavior. It is scripted. A student who sends three identical messages might be: experiencing technical difficulty (the message didn't seem to send), frustrated and seeking reassurance, or testing the system. The appropriate response differs.

The AI-first approach: the rate limiter handles the infrastructure enforcement (how many messages per minute, globally and per student). When a student exceeds the rate limit, the AI is informed (through a system context injection) that unusual message patterns have been detected, and the AI decides how to respond — whether to ask what is happening, whether to gently note the unusual frequency, or whether to simply continue helping.

## Rate Limiting Architecture

WhatsApp-level rate limiting: a per-student limit (e.g., 10 messages per minute, 200 per day) enforced at the webhook handler before any message is enqueued or processed. This is deterministic infrastructure and appropriate to implement deterministically. Exceeding this limit results in the webhook returning 200 OK (always return 200 to Meta or they retry) but not processing the message.

The per-student limit must account for the debounce architecture: a burst of 5 messages within 2 seconds is one conversational turn, not 5 separate interactions. The rate limit should be designed at the conversation-turn level, not the raw message level, where possible.

Global webhook rate limiting: protection against someone attempting to send large volumes of messages from many different phone numbers simultaneously. This is infrastructure-level DDoS protection and should be handled at the infrastructure layer (Railway or a reverse proxy), not in application code.

## BullMQ Queue Protection

A flooding attack that bypasses rate limiting at the webhook level (or a bug in WaxPrep's own code) could fill the BullMQ queue with millions of jobs. The queue must have:

Per-student job deduplication (the debounce jobId pattern from Stage 6) — this prevents a single student from creating more than one queued job at a time.

Queue depth monitoring: if the queue depth exceeds a threshold, alert. Do not blindly accept new jobs into an already-overwhelmed queue.

## Classification

🟢 BUILD NOW — THE BASICS (rate limiting per student, global webhook protection)

🟡 UNDERSTAND NOW — IMPLEMENT WHEN NEEDED (sophisticated abuse detection)

The hard numerical limits (N messages per minute) are infrastructure decisions that belong in configuration. The behavioral response when those limits are triggered belongs to the AI.

---

# DEEP RESEARCH: STAGE 56 — SECURITY HARDENING AND AUDITING

## What Security Hardening Means

Security hardening is the practice of proactively reducing a system's attack surface by removing unnecessary features, applying known defenses, and auditing for known vulnerability patterns. OWASP's Top 10 list (updated annually) is the definitive starting point.

The OWASP Top 10 for 2025 in order of relevance to WaxPrep:

**1. Broken Access Control:** Can Student A access Student B's data? WaxPrep's WaxID isolation architecture directly addresses this. The audit is: verify every database query includes appropriate WaxID filters.

**2. Cryptographic Failures:** Are secrets stored securely? Are they excluded from logs? Is the database connection using TLS? Are API keys stored in environment variables and never in code? WaxPrep already handles most of this through the Stage 2 configuration system.

**3. Injection:** The most common form for WaxPrep is SQL injection. Using parameterized queries (`$1, $2` placeholders in `pg` library calls) prevents SQL injection completely. This should already be the case in all WaxPrep database code.

**4. Insecure Design:** Architecture-level security decisions made early in development. For WaxPrep, this means ensuring the WaxID isolation is not an afterthought but a structural guarantee.

**5. Security Misconfiguration:** Running Node.js as root, missing HTTP security headers, debug mode enabled in production, default error messages revealing stack traces to users. Easy to fix with Helmet.js (HTTP headers) and proper environment configuration.

**6. Vulnerable and Outdated Components:** `npm audit` in CI pipeline. Regular dependency updates. Prioritize security patches.

**7. Identification and Authentication Failures:** WaxPrep's "authentication" is WhatsApp — Meta validates the sender's phone number. But HMAC verification of webhook payloads (Stage 9) is critical here. Ensure no bypass exists.

**8. Software and Data Integrity Failures:** Supply chain attacks through compromised npm packages. `npm audit --audit-level=high` in CI. Pinned dependency versions via lockfile.

**9. Security Logging and Monitoring Failures:** WaxPrep needs comprehensive audit logs of security-relevant events: data deletion requests and completions, unusual usage patterns, failed authentication/authorization attempts, safety events.

**10. Server-Side Request Forgery (SSRF):** If WaxPrep fetches external URLs (web search tool, document fetch), ensure the fetched URLs cannot be internal infrastructure addresses. Validate and sanitize URL parameters.

## What Should Be Built Immediately

Helmet.js installation (one npm package, one middleware line) adds 14 security headers to every HTTP response. This is a five-minute change that addresses Content Security Policy, X-Frame-Options, and other browser-level protections. This should have been in Stage 1.

PostgreSQL least-privilege roles: the application database user should not be a superuser. Create a dedicated application role with only `SELECT, INSERT, UPDATE, DELETE` on the relevant tables. Reserve DDL (CREATE TABLE, DROP TABLE, ALTER TABLE) for a separate migration role. This prevents a SQL injection vulnerability from being able to drop tables or create new database roles.

No debug mode in production: `NODE_ENV=production` must be set (it is, per Stage 2 configuration). Verify that Express does not return stack traces in production error responses. The global error handler must send a generic error message to clients, not the internal error details.

`npm audit` in CI: before every deployment, run `npm audit --audit-level=high`. Fail the build if high-severity vulnerabilities exist in dependencies.

Audit log implementation: a separate `audit_log` table or append-only log of security-relevant events. Not the same as application logs (which can be deleted). This is the record of what happened for investigation and NDPA compliance purposes.

## The Audit Log Specifically

The audit log is the forensic record. It must be:

Append-only: nothing can be deleted from the audit log. Not even by the application. Implement this using a PostgreSQL trigger that prevents UPDATE and DELETE on the audit_log table. Alternatively, use a separate logging service where records cannot be modified.

Comprehensive for security-relevant events: every data deletion request and its completion, every data export request and delivery, every consent grant and withdrawal, every safety event (Stage 46 crisis protocol activations), every admin action.

Separate from application logs: application logs rotate and are deleted. The audit log is permanent (or retained for a defined period required by law — the NDPA does not specify a minimum retention period for audit logs, but 3-5 years is standard practice).

## Classification

🟢 BUILD NOW: Helmet.js, PostgreSQL least-privilege roles, npm audit in CI, NODE_ENV=production enforcement, audit_log table.

🟡 UNDERSTAND NOW — IMPLEMENT WHEN NEEDED: Full OWASP penetration testing, formal security review, comprehensive intrusion detection.

---

# THE NOW vs LATER CLASSIFICATION MAP

## 🟢 BUILD NOW (Before First Real Student)

**NDPA 2023 compliance foundation:**
- `consents` table in the database (to record consent events)
- `audit_log` table (append-only, cannot be updated or deleted)
- Data deletion function that actually removes personal data content (not just flags it)
- Data export function that produces a student-readable summary
- AI-driven consent, deletion, and export detection (the AI understands the student's intent, triggers infrastructure)
- Review and document the correct law: NDPA 2023, not NDPR 2019

**Idempotency:**
- BullMQ jobId deduplication (verify it is configured correctly with `messageId` as the jobId)
- PostgreSQL `ON CONFLICT DO NOTHING` on inbound message inserts (verify it exists)
- PostgreSQL-based idempotency guard for AI calls (check `ai_requests` table before calling the AI)
- PostgreSQL `UNIQUE (wax_id, message_id, concept_tag)` on learning observations
- Remove any Redis-based idempotency guards and replace with PostgreSQL

**Backup:**
- Verify Railway automated backups are enabled
- Deploy a PostgreSQL backup service (postgres-s3-backup or equivalent) to Backblaze B2 or Cloudflare R2
- Write and test DISASTER_RECOVERY.md

**Security — minimum baseline:**
- Install Helmet.js
- Create PostgreSQL least-privilege application database role (not superuser)
- Ensure `NODE_ENV=production` is configured and Express does not return stack traces
- Add `npm audit --audit-level=high` to deployment pipeline
- Implement audit_log table

**Rate limiting — structural:**
- Per-student message rate limit in webhook handler (10 messages/minute default, configurable)
- AI decides how to respond when a rate-limit context is injected

**Data isolation audit:**
- Review every database query for mandatory WaxID filter
- Document in DATA_ISOLATION_AUDIT.md

## 🟡 PREPARE/UNDERSTAND NOW — IMPLEMENT LATER

**AI Response Evaluation:**
- Understand the LLM-as-judge pattern
- Start building the curated evaluation dataset from day one (even 20 examples)
- Implement the evaluation schema tables
- Run evaluations manually at first, not automatically on every response
- Automate when WaxPrep has meaningful traffic volume (after first 10,000 messages)

**Hallucination detection:**
- Understand the approach: consistency sampling, ground truth comparison
- Start the ground truth dataset (correct answers to key curriculum questions)
- Implement automated detection when budget allows (requires additional AI calls)

**Tutoring quality metrics:**
- Define what "quality" means for WaxPrep before measuring it
- This requires real student interactions to have meaningful signal
- Implement measurement infrastructure after first 3 months of production usage

**Continuity/regression testing:**
- Build the golden test suite (curated examples with expected behavior)
- Run it manually on every significant system change
- Automate in CI after the test suite has at least 50 examples

**Full NDPA compliance:**
- Parental consent verification mechanism (requires understanding how to reach parents in the WhatsApp ecosystem)
- NDPC registration (required when WaxPrep processes data of more than 200 data subjects in 6 months or reaches other thresholds)
- Data Protection Officer appointment (check NDPA thresholds — likely required when WaxPrep reaches meaningful scale)
- Data Protection Impact Assessment for the student AI tutoring use case

**Advanced abuse detection:**
- Sophisticated behavioral pattern analysis
- Multi-student attack pattern detection
- Build after WaxPrep has real abuse data to learn from

## 🔴 DEFER COMPLETELY

**Cost tracking and budget controls:** Per the voice memo, this is explicitly deferred. Note: cost tracking helps you avoid surprise bills. At minimum, set a spending alert in your AI provider dashboard (Anthropic, OpenAI) before going live so you know if usage spikes unexpectedly.

**Context flow / consent flow (scripted version):** Per the voice memo, the scripted "Type YES/NO" consent flow is deferred. The AI-first consent mechanism (AI understands consent, triggers infrastructure recording) is included in 🟢 BUILD NOW.

**Multivariate testing / A/B testing infrastructure:** Not needed before first deployment, not needed before first 10,000 users.

**Multi-region active-active failover:** Single-region deployment is appropriate for startup. Revisit when WaxPrep has significant revenue and a meaningful user base.

**Point-in-time recovery (PITR):** Daily backups with 24-hour RPO are sufficient at startup. PITR (the ability to restore to any specific minute in time) requires WAL archiving and is operationally complex. Defer until RPO requirements tighten.

---

# ROADMAP CORRECTIONS

The following are specific corrections to the proposed stage specifications.

**Stage 47 — Law citation error (MUST FIX):** Every reference to "NDPR 2019" must be corrected to "NDPA 2023." The NDPR 2019 is no longer the governing law. The NDPC (not NITDA) is the regulatory body.

**Stage 47 — Soft deletion is not erasure (MUST FIX):** The data deletion approach must actually remove or cryptographically destroy personal data content, not merely set `content='[DELETED]'` and `status='deleted'` while leaving the data in place. The proposed approach is not NDPA-compliant.

**Stage 47 — Minor consent is legally incomplete (MUST ACKNOWLEDGE):** The WhatsApp "Type YES" consent flow from the student alone is not legally sufficient for minors under NDPA 2023 Section 31. This must be documented as a known compliance gap to be addressed as the product matures.

**Stage 47 — Command detection is scripted (MUST FIX):** "DELETE MY DATA", "SEND MY DATA", "WITHDRAW CONSENT" command detection via string matching must be replaced with AI-driven intent detection. The AI understands the student's request; infrastructure executes it.

**Stage 48 — Deterministic checks are keyword matching (MUST FIX):** Remove `student_name_used` and `memory_referenced` from "deterministic checks." These are semantic quality checks, not structural ones. Replace with genuinely deterministic checks: non-empty, within expected length range, no structural corruption.

**Stage 48 — Synchronous evaluation blocks delivery (MUST FIX):** Running evaluation synchronously before or during message delivery adds latency to every student interaction. All evaluation should be asynchronous (post-delivery).

**Stage 54 — "Exactly-once" is incorrect framing (MUST FIX):** Replace "exactly-once processing" with "idempotent at-least-once processing" throughout. Stage 54 should be renamed accordingly.

**Stage 54 — Redis-based idempotency guards are unreliable (MUST FIX):** Replace Redis keys for idempotency (`"ai_called:{messageId}"`, `"sent:{waxId}:{triggerMessageId}"`) with PostgreSQL-based records. Redis is not an appropriate store for idempotency guards because it can lose data without proper durability configuration.

**Stage 55 — Manual backup script alone is insufficient:** The spec proposes a manually maintained Node.js backup script. Deploy a pre-built, tested backup service instead (postgres-s3-backup on Railway). Manual scripts get forgotten, fail silently, and are not tested for restore reliability. 73% of untested backup approaches fail when restoration is actually needed.

**Stage 53 — Identical message detection is scripted (MUST FIX):** "3 identical messages in a row triggers the abuse detection response" is a deterministic rule that replaces AI judgment with pattern matching. Remove it. The rate limiter enforces numerical limits. The AI handles all behavioral interpretation.

---

# DECISIONS THAT MUST BE LOCKED NOW

These architectural decisions become much more expensive to change after the first real student data exists.

**The WaxID is the absolute boundary.** Every database query touching student data must include a WaxID filter. This is not a convention — it is a hard structural requirement. Every new query added to the system in the future must be reviewed for WaxID filter presence before merging.

**PostgreSQL is the source of truth for all durable state.** Redis is ephemeral cache and queue coordination. It is not the place to store idempotency records, consent records, or audit logs. This boundary must be maintained as the system grows.

**The audit_log is append-only and permanent.** Implement this as a database trigger or a separate service. Never allow the application to UPDATE or DELETE audit log records.

**Deletion must be actual deletion.** When a student's data is deleted, the personal content must be actually removed (not flagged). Aggregate non-personal statistics (session counts, learning trends without identifiers) may be retained. This distinction must be implemented correctly in the first version of the deletion function.

**The NDPA 2023 governs WaxPrep.** All legal compliance decisions are made under this law. When in doubt, consult a Nigerian data protection lawyer. The fines (₦766.2 million against Multichoice, $220 million against Meta) demonstrate that the NDPC enforces the law.

---

# DECISIONS THAT SHOULD DELIBERATELY REMAIN OPEN

**The exact parental consent mechanism.** How to reach parents in a WhatsApp ecosystem, how to verify parental identity, and how to handle students who do not have a parent with a WhatsApp account — these are product design questions that require user research with Nigerian families, not engineering decisions made in a vacuum. Leave this open.

**The specific evaluation quality thresholds.** What constitutes a "good" pedagogical response? What score should trigger review? These can only be calibrated against real student outcomes. Do not set these in advance.

**When to implement synchronous hallucination detection.** Depends on how often harmful hallucinations actually occur in production, which you cannot know before deployment. Monitor, learn, then decide.

**The minimum sample size for evaluation runs.** Depends on what WaxPrep's actual traffic looks like. Cannot be specified in advance.

---

# RISKS OF IMPLEMENTING THINGS TOO EARLY

**Implementing application-level encryption of messages before establishing it is needed:** If you encrypt `messages.content` before understanding the threat model, you create significant operational complexity (every AI context assembly requires decryption) for protection you may already have (TLS + Railway at-rest encryption). Measure the threat before adding the defense.

**Implementing sophisticated abuse detection before having real abuse data:** Building elaborate behavioral pattern detection without data to calibrate against creates either false positives (legitimate students blocked) or false negatives (actual abuse detected too late). Observe first.

**Implementing the parental consent flow before understanding how Nigerian parents actually use technology:** A consent flow designed in isolation may fail to reach parents in the actual Nigerian context. This requires user research, not engineering first.

**Implementing evaluation metrics before having any responses to evaluate:** The evaluation framework is most valuable when you can compare before-and-after states. Building it before there is any meaningful "before" state produces vanity metrics, not actionable insights.

---

# DEPENDENCY MAP

The correct order based on architectural dependencies:

Foundation (must exist first): Stage 3 (database), Stage 2 (configuration), Stage 4 (logging), Stage 5 (error handling).

Before first real student:
1. Data isolation audit (reviews existing code, no new dependencies)
2. audit_log table (depends on database)
3. consents table (depends on database, Stage 12 WaxID)
4. Data deletion function (depends on all student data tables)
5. Data export function (depends on all student data tables)
6. Security hardening (Helmet.js, PostgreSQL roles) (depends on Stage 1 infrastructure)
7. Idempotency patterns (BullMQ jobId, PostgreSQL ON CONFLICT) (depends on Stage 6, Stage 3)
8. Backup deployment (depends on database)
9. Rate limiting (depends on Stage 6 Redis, Stage 8 webhook)

After first cohort of real students:
10. Evaluation dataset building (depends on real interactions existing)
11. Manual evaluation runs (depends on evaluation dataset)
12. Automated evaluation (depends on meaningful traffic volume)

Later:
13. Hallucination detection automation (depends on evaluation infrastructure + budget)
14. Sophisticated abuse detection (depends on real abuse data)
15. Full NDPA compliance (parental consent, NDPC registration) (depends on user scale)

---

# HANDOFF SECTION FOR FUTURE CODING AGENT

This section tells the coding agent exactly what to build, in what order, and what principles must not be violated.

**What to inspect before writing any code:**

Inspect all existing database migrations in sequence. Understand the current schema completely. Specifically look for: whether `ON CONFLICT DO NOTHING` exists on the inbound messages insert, whether BullMQ job IDs use the WhatsApp message ID, whether any Redis keys are being used for idempotency purposes (if so, these need to be moved to PostgreSQL).

Inspect the existing AI worker to understand how AI calls are currently triggered. Specifically: is there any check before calling the AI to see if this message has already been processed?

Inspect the existing outbound message system to understand how chunks are tracked and whether duplicate sending is currently prevented.

**What to create (in dependency order):**

Migration 1: Create `audit_log` table with a trigger preventing UPDATE and DELETE. The table records: event_type, wax_id, event_data (JSONB), created_at. The trigger is a PostgreSQL trigger function that raises an exception if UPDATE or DELETE is attempted.

Migration 2: Create `consents` table with fields: id, wax_id, consent_type, status, consent_text_version, collected_at, ip_context (null for WhatsApp). Add foreign key to students table.

Modify the data deletion function: ensure it deletes (or cryptographically overwrites with random bytes) the actual content of: messages.content, memories.content. It should retain empty shell records (the row structure without PII content) for referential integrity.

Add PostgreSQL application database role: `CREATE ROLE waxprep_app WITH LOGIN PASSWORD '...'`. Grant only `SELECT, INSERT, UPDATE, DELETE` on the tables the application needs. No `CREATE, DROP, ALTER` permissions. Update the DATABASE_URL configuration to use this role.

Install and configure Helmet.js in `src/server.js`. Place it as the first middleware, before any route handlers.

Add `npm audit --audit-level=high` to the deployment pipeline. This is a configuration change, not a code change.

Verify BullMQ configuration uses WhatsApp message ID as jobId. If not, update the queue producer to set `{ jobId: messageId }` when enqueuing.

Verify PostgreSQL idempotency for AI calls: add a check in the AI service that queries `ai_requests WHERE triggering_message_id = $messageId AND status = 'success'` before calling the AI provider. If a successful result exists, use that result rather than calling the provider again.

Add the `triggering_message_id` column to the `ai_requests` table if it does not exist.

Deploy postgres-s3-backup or equivalent to Railway, configured to upload to Backblaze B2 or Cloudflare R2. Test the restore procedure before going live.

Write DISASTER_RECOVERY.md documenting: where the backup is, how to decrypt it, how to restore it, how long restoration should take, how to verify the restoration succeeded.

**What must remain AI-driven:**

The AI determines whether a student's message is a request to delete their data, export their data, or withdraw consent. Infrastructure records the consent event when the AI signals that consent has been given or withdrawn. Infrastructure executes the deletion or export when the AI signals the student has requested it.

The AI determines how to respond when a rate limit context is injected. Infrastructure enforces the numerical limit. The AI handles the conversation.

The AI evaluates response quality (LLM-as-judge). Infrastructure records the evaluation result and the scores.

**What must remain deterministic infrastructure:**

The rate limit enforcement (10 messages per minute per student — configurable). Exceeding this limit means the message is not enqueued, not processed. The WaxID filter in every database query. The idempotency checks (has this AI call already been made? has this chunk already been sent?). The audit log writes (append-only, immutable). The data deletion and export mechanics (once triggered, they execute completely and atomically). The backup schedule and off-site upload.

**What must never be hardcoded:**

Rate limit thresholds (in configuration). Message content in any form (it is student data). Error messages that reveal system internals. Database connection strings (in environment variables). Backup encryption keys (in environment variables). The specific crisis response text (in configuration). Any specific words or phrases that trigger any behavior (AI-first: the AI understands intent, not keyword patterns).

**What must never be scripted as fake intelligence:**

Keyword detection for data commands ("DELETE MY DATA", "YES", "NO") — use AI intent detection. Identical message detection as abuse — use rate limits plus AI contextual judgment. Deterministic evaluation checks on semantic content (checking if a student's name was used, checking if a memory was referenced by keyword search) — use AI evaluation.

---

# SOURCES AND REFERENCES

Nigeria Data Protection Act 2023 (NDPA): kpmg.com/ng and fpf.org/blog/nigerias-new-data-protection-act-explained

NDPA vs NDPR comparison: hoganlovells.com (Key changes brought by the Nigerian Data Protection Act 2023) and centraleyes.com/nigerian-data-protection-act

NDPC enforcement (Multichoice fine): secureprivacy.ai/blog/nigeria-data-protection-law

LLM evaluation and G-Eval: braintrust.dev/articles/ai-hallucination-evaluations-metrics-methods-2026 and galileo.ai/blog/best-hallucination-detection-tools-llm

VERA-MH clinical alignment benchmark: arxiv.org/html/2604.23445v1 (AI Safety Training Can be Clinically Harmful)

Idempotency and at-least-once delivery: digitalapplied.com/blog/event-driven-architecture-message-queues-2026-engineering-reference and khimananda.com/blog/exactly-once-vs-at-least-once-delivery

BullMQ job deduplication: oneuptime.com/blog/post/2026-01-21-bullmq-job-deduplication

Railway backup infrastructure: railway.com/deploy/postgres-daily-backups and github.com/Kjudeh/railway-postgres-backups

OWASP Node.js Security: cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html and dev.to/axiom_agent/nodejs-security-hardening-in-production-owasp-top-10-implementation-guide

PostgreSQL least privilege: Official PostgreSQL documentation on roles and privileges.

Redis durability warning: redis.io/docs/latest/develop/data-types/streams/idempotency and BullMQ official documentation on Redis configuration.

Two Generals Problem: Gray, J. (1978). Notes on Data Base Operating Systems. Research Report.

---

*This research document is complete. No code was written or modified. The findings here are architectural analysis only. Handoff to the coding agent when ready to implement, following the dependency order and classification map above.*
