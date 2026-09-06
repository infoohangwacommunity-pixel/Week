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




I have the full brief. Let me do targeted research on the most critical technical areas before writing.

I have everything I need. This will be the most important document in the WaxPrep project. Writing it now in full.







Huge brief. Let me do rigorous research on the most critical technical and educational science questions before writing.

I have deep research from the academic literature. Now writing the complete document.

---

# WAXPREP — PHASE F: LEARNING INTELLIGENCE INFRASTRUCTURE
## STAGES 27–34: COMPLETE TECHNICAL AND EDUCATIONAL SPECIFICATION
### Research-Backed Architecture for AI-First Conversational Tutoring
### September 2026

---

# EXECUTIVE SUMMARY

This document is the complete specification for WaxPrep's Learning Intelligence Infrastructure, covering Stages 27 through 34. It answers the fundamental question the brief requires: is the proposed architecture actually correct for an AI-first conversational tutor serving Nigerian secondary students in 2026?

The short answer is: the direction is correct but the implementation details require significant modification. The core philosophical position — infrastructure produces evidence, AI interprets evidence — is strongly validated by recent research (Scarlatos, Baker & Lan, LAK 2025; Sonkar & Baraniuk, 2023). However, several specific design choices in the proposed stages are either insufficient, over-engineered for the current stage, or based on assumptions that do not hold for a conversational WhatsApp-based tutor with sparse data.

The critical finding is this: classical Bayesian Knowledge Tracing is not the best starting point for WaxPrep in 2026, for reasons specific to the WhatsApp conversational context. What WaxPrep actually needs is a lightweight, interpretable evidence accumulation model that the AI uses as input evidence, not a predictive accuracy model designed for structured problem sets. The document specifies exactly what that means and how to build it.

Five structural modifications to the proposed stages are recommended:

First, the evidence collection pipeline (Stage 28) should be built before the knowledge state schema (Stage 27), because the schema must be designed around the actual evidence you can reliably collect, not around an idealized model. The order should be Stage 28 first, then Stage 27.

Second, Bayesian Knowledge Tracing with four parameters should not be implemented. A simpler recency-weighted mastery accumulator with temporal decay is more appropriate for WaxPrep's data characteristics and produces results that are more interpretable by the AI.

Third, misconception detection (Stage 31) must be LLM-assisted, not rule-based. The infrastructure only stores the output of LLM analysis. The LLM does the analysis. This is architecturally consistent with the philosophy but requires a specific implementation pattern.

Fourth, formative assessment (Stage 32) should not attempt to create a separate assessment module. Assessment is already embedded in tutoring conversation. The assessment pipeline extracts evidence from what already happens.

Fifth, the student model context interface (Stage 34) is the most important stage. Everything else builds toward it. It should be designed first (as a specification) so all earlier stages know what they are building toward.

---

# PART ONE: EDUCATIONAL SCIENCE FOUNDATIONS

## 1. The Research Basis for This Architecture

### 1.1 The Four-Component Architecture of Intelligent Tutoring Systems

The academic literature on Intelligent Tutoring Systems converges on a four-component architecture (Anderson et al., 1995; VanLehn, 2011): the Domain Model, the Student Model, the Tutor Model, and the User Interface. WaxPrep's architecture maps cleanly to these:

The Domain Model is the AI's knowledge, augmented by any knowledge retrieval tools added in later stages. WaxPrep does not maintain a separate programmatic domain model — the AI model contains the domain knowledge, which is correct for an LLM-based tutor. This is a deliberate departure from classical ITS design that is appropriate and well-supported.

The Student Model is what Stages 27–34 build. It is a computational representation of what the student has demonstrated, attempted, and struggled with. The academic literature is unambiguous: the student model should track knowledge state over time (Corbett & Anderson, 1994), misconceptions (Brown & VanLehn, 1980; Ross & Andreas, 2024), and engagement signals (VanLehn, 2011).

The Tutor Model, in WaxPrep's case, is the AI's own reasoning capability. The system prompt, memory context, and student model evidence all inform the AI, which then reasons about how to teach. This is the correct architecture for an LLM-based system.

The User Interface is WhatsApp.

### 1.2 Knowledge Tracing — The Research Landscape

Knowledge Tracing is the problem of estimating what a student knows at any point in time, based on their observable interactions. The field has evolved through three generations.

**First Generation: Bayesian Knowledge Tracing (BKT)**

Corbett & Anderson (1994) introduced the original BKT model. The model treats each Knowledge Component (KC) as a binary latent variable — either the student knows it or does not. Four parameters define the model:

- P(L₀): probability the student already knows the KC before instruction.
- P(T): probability of learning the KC on each practice opportunity (transition probability).
- P(G): probability of a correct response given the student does NOT know the KC (the "guess" parameter).
- P(S): probability of an incorrect response given the student DOES know the KC (the "slip" parameter).

After each observation (correct or incorrect response), Bayes' rule updates the probability that the student knows the KC. The update equations are:

After a correct response: P(Lₙ|correct) = [P(Lₙ₋₁) × (1-P(S))] / [P(Lₙ₋₁) × (1-P(S)) + (1-P(Lₙ₋₁)) × P(G)]

After an incorrect response: P(Lₙ|incorrect) = [P(Lₙ₋₁) × P(S)] / [P(Lₙ₋₁) × P(S) + (1-P(Lₙ₋₁)) × (1-P(G))]

Mastery is typically declared at P(L) ≥ 0.95.

BKT's fundamental assumptions are critically important to understand:
- Knowledge is binary (learned or not) — reality is more continuous.
- Forgetting is impossible — once learned, always learned (known to be false from Ebbinghaus onwards).
- KCs are independent of each other — ignores concept relationships.
- Parameters are fixed per KC — ignores individual student differences.
- Only binary outcomes are modeled — correct or incorrect.

These assumptions are significant. However, research also shows that augmented versions of BKT — incorporating forgetting, student-specific parameters, and partial credit — close most of the predictive gap with deep learning methods (Khajah et al., 2016; Sun, 2025). The interpretability of BKT is a major practical advantage.

**Second Generation: Deep Knowledge Tracing and Variants**

Piech et al. (2015) introduced Deep Knowledge Tracing (DKT), using an LSTM to model student knowledge sequences. DKT consistently achieves higher AUC than classical BKT on standard benchmark datasets (ASSISTments, Cognitive Tutor). This led to a proliferation of deep learning approaches: DKVMN (Zhang et al., 2017), SAKT (Pandey & Karypis, 2019), AKT (Ghosh, Heffernan & Lan, 2020), and many others.

The critical research finding for WaxPrep: research in 2018 (Lin & Chi, JEDM) showed that BKT outperforms LSTM on predicting post-test scores (the most educationally valid outcome), while LSTM achieves higher accuracy on predicting the next item response. This distinction is fundamental. DKT is optimized for next-item prediction, which is not WaxPrep's goal. BKT is better calibrated for actual learning outcomes.

More critically for WaxPrep: DKT requires training on large datasets of student-item interaction sequences. A single student's data in a conversational tutor is far too sparse and unstructured for DKT to produce meaningful results per student. DKT works across a population of students; it cannot meaningfully be applied to produce an individual student estimate from 30 observations.

**Third Generation: LLM-Based Knowledge Tracing**

Scarlatos, Baker & Lan (LAK 2025) introduced LLMKT, which directly applies LLMs to knowledge tracing in tutor-student dialogues. This is the most directly relevant research for WaxPrep. Their key findings:

LLMKT significantly outperforms existing KT methods in predicting student response correctness in dialogue settings. The reason: standard KT methods assume discrete, assessable items with binary outcomes. Conversational tutoring produces neither — turns are heterogeneous (some are questions, some are explanations, some are clarifications), outcomes are continuous and ambiguous, and KCs are often implicit rather than explicit.

Turn-level annotation using LLMs achieves over 93% accuracy for correctness labels and above 0.4 Krippendorff's alpha on KC relevance with human raters — making LLM-based evidence extraction a production-viable approach.

Combining LMs with knowledge tracing leads to better estimates of student knowledge states than KT-only methods in dialogue settings (Scarlatos et al., 2025). This validates WaxPrep's hybrid approach: use a structured mastery model as infrastructure, use LLM reasoning to interpret and contextualize it.

**What This Means for WaxPrep**

WaxPrep is not a structured problem set platform. It is a conversational WhatsApp tutor. The research is clear:

Classical BKT was designed for structured practice systems where students respond to discrete, well-defined items with binary outcomes. A student answering "what is F=ma?" with "force equals mass times acceleration" produces a clean data point. A student discussing force for five minutes in a WhatsApp conversation produces something much harder to classify.

DKT requires population-level training data and produces predictions optimized for next-item accuracy, not for learning outcomes.

LLMKT, or an LLM-assisted hybrid model, is the research-backed approach for conversational tutoring in 2026.

**RECOMMENDATION: Do not implement classical four-parameter BKT.** Implement instead a Recency-Weighted Evidence Accumulator (RWEA) — a lightweight mastery model that stores structured evidence extracted by the AI, applies temporal decay, and presents a probability estimate that the AI uses as evidence input. This is described fully in Section 5.

### 1.3 Performance Factor Analysis and Its Relevance

Performance Factor Analysis (PFA, Pavlik, Cen & Koedinger, 2009) improves on BKT by incorporating both successes and failures as separate predictors, and by modeling the learning curve (each practice attempt reduces the probability of failure). PFA: logit(P(correct)) = β × KC + γ × successes + ρ × failures.

PFA is more principled than BKT for multi-attempt sequences and easier to extend to continuous outcomes. However, it shares BKT's structured-practice assumption. For WaxPrep's conversational setting, the challenge is the same: extracting structured successes and failures from conversation.

PFA concepts inform the RWEA model recommended below — specifically, tracking successes and failures separately, which carries more information than binary mastery.

### 1.4 Item Response Theory and Its Role

Item Response Theory (IRT; Lord, 1980) models the probability of a correct response as a function of student ability and item difficulty. The 2-parameter logistic model: P(correct|θ) = c + (1-c) × 1/(1+e^{-a(θ-b)}), where θ is student ability, a is item discrimination, b is item difficulty, and c is a guessing parameter.

IRT is a cross-sectional measurement model — it describes ability at a point in time, not how it changes. BKT is a longitudinal model — it tracks change over time. These are complementary, not competing.

For WaxPrep, IRT would be valuable for: calibrating question difficulty, detecting when a question is too hard (the student fails consistently regardless of mastery), and providing richer evidence for the AI. However, IRT requires items (questions) with known difficulty parameters, which requires calibration data across students. This makes IRT premature for Stage 27–34 but important to prepare for architecturally.

**RECOMMENDATION: Design the evidence schema to store difficulty estimates alongside outcomes. Leave the IRT column nullable for now. Populate it in a later stage when cross-student data is available.**

### 1.5 Misconception Theory

Brown & VanLehn (1980) introduced Repair Theory, modeling procedural errors as applications of "buggy" procedures — systematic incorrect rules that students consistently apply. This is the theoretical basis for misconception detection.

Repair Theory established that student errors are often not random but systematic. A student who consistently says "the larger object exerts more force on the smaller one" is not guessing randomly — they have a stable, incorrect mental model. Detecting this requires recognizing the pattern across multiple instances.

The research challenge for conversational tutoring: misconception detection traditionally uses structured error analysis (the student produced wrong output X for well-defined input Y). In conversation, recognizing whether a student's statement reflects a genuine misconception or an off-the-cuff slip requires semantic understanding. This is exactly where LLMs excel and classical rule-based methods fail.

Scarlatos et al. (2025) find that combining LMs with knowledge tracing leads to better estimates of student knowledge states including misconceptions. Crucially, Sonkar et al. (2024) find that LLMs are significantly worse at identifying incorrect reasoning containing misconceptions than at identifying correct reasoning — meaning misconception detection is a hard task even for LLMs and requires careful evidence accumulation, not a single-shot inference.

**RECOMMENDATION: Misconceptions must be detected over multiple observations, never from a single instance. Infrastructure stores each observation. The AI extracts the misconception hypothesis from a single observation. Confidence grows through accumulation.**

### 1.6 Help-Seeking Behavior and the Hint Dependency Signal

Beck et al. (2008) and subsequent research in the ASSISTments environment established that hint-seeking behavior is a significant negative predictor of learning outcomes. A student who takes more hints scores lower on post-tests — the correlation is consistent and significant (Feng et al., 2009).

However, help-seeking is not simply bad. Aleven & Koedinger (2000) distinguish productive from unproductive help-seeking. A student who requests hints strategically (when genuinely stuck, then works through the explanation) differs meaningfully from a student who uses hints to avoid thinking. The direction of the correlation with outcomes differs.

Chaudhry et al. (2022) showed that a multi-task model jointly predicting hint-taking and knowledge tracing significantly outperformed models ignoring hint usage (12% improvement in prediction quality).

**IMPLICATION FOR WAXPREP:** The hint dependency metric is educationally meaningful evidence. Infrastructure must track whether a student response came after no hint, one hint, or multiple hints, and how hint usage trends over time within and across sessions. An increasing hint dependency trend on a concept is a warning signal worth reporting to the AI.

### 1.7 The Forgetting Problem

Ebbinghaus (1885) established the forgetting curve: approximately 50–80% of newly learned information is lost within days without review. Modern memory research (Carpenter et al., 2008; Bjork, 1994) has refined this understanding: forgetting follows a power function rather than a pure exponential, is strongly influenced by spacing and retrieval practice, and can be offset by well-timed review.

Classical BKT does not model forgetting. Extended BKT versions with forgetting parameters (Nagatani et al., 2019; Im et al., 2023) show that incorporating forgetting significantly improves prediction accuracy, particularly for longer time horizons.

For WaxPrep, the educational implication is clear. A student who demonstrated mastery of quadratic equations two months ago but has not touched the topic since is not reliably at mastery level. The infrastructure must track recency and apply temporal decay to mastery estimates.

**RECOMMENDATION: Implement a time-since-last-evidence decay factor in the RWEA model. The mastery estimate reported to the AI should reflect not just what was observed but when it was last observed. A high mastery estimate that is six weeks old should be presented differently from a high mastery estimate from yesterday.**

### 1.8 The Critical Research Principle — Evidence vs. Decision

The brief's core philosophical position — infrastructure produces evidence, AI interprets evidence — is deeply consistent with the research literature on Socratic tutoring, formative assessment, and collaborative learning.

Black & Wiliam (1998), in the seminal formative assessment review "Inside the Black Box," established that formative assessment works by producing evidence of learning that is acted upon by teachers, students, or peers. The infrastructure that collects this evidence does not itself decide what to do with it — the intelligent agent (teacher or AI) does.

VanLehn (2006) identified that the granularity of feedback matters crucially. Step-level feedback (responding to each step in a problem) is far more effective than problem-level feedback (responding only to final answers). This is relevant for WaxPrep: evidence should be collected at the interaction level, not just at the session level.

Graesser et al. (2001) established that conversational dialogue in tutoring produces significantly more learning than didactic instruction, with effect sizes around 2 sigma above classroom instruction. This validates the WhatsApp conversational format — it is not a limitation but a potentially powerful learning environment.

---

# PART TWO: THE KNOWLEDGE TRACING MODEL COMPARISON

## 2. Detailed Comparison of Knowledge Tracing Approaches for WaxPrep

The following evaluates all major KT approaches against WaxPrep's specific context.

### 2.1 Classical BKT (Corbett & Anderson, 1994)

Strengths: Interpretable. Works with sparse data. Per-student parameter estimation. Provides probability estimates (not just binary classifications). Widely used, well-understood failure modes.

Weaknesses: Assumes no forgetting. Binary outcome only. Fixed parameters per KC (no student individualization in the base model). Independent KC assumption. Requires structured discrete practice items.

Cold-start behavior: Works from first observation with reasonable priors. Updates monotonically toward certainty.

Data requirements: Minimum ~5–10 observations per KC per student for meaningful estimates. Functional with very sparse data.

Computational cost: Trivial. Four multiplications and an addition per update.

Explainability: Excellent. "Based on 6 practice attempts, 4 correct, 2 incorrect, the estimated probability of mastery is 0.71."

Suitability for WhatsApp conversational tutoring: Poor without modification. Requires discrete item responses. Conversation does not naturally produce these.

Suitability for sparse student data: Good. BKT is designed for sparse data.

Suitability for Nigerian secondary education: Neutral. The model is domain-agnostic.

**Verdict: Not suitable as-is. Suitable as conceptual inspiration for the update mechanism.**

### 2.2 Deep Knowledge Tracing (Piech et al., 2015)

Strengths: Better next-item prediction accuracy than BKT. Handles concept dependencies implicitly. Captures complex sequential patterns.

Weaknesses: Black box — completely uninterpretable. Requires large training datasets (thousands of student-item sequences). Cannot be meaningfully applied per student at inference time — requires full retraining for each new student. Optimized for next-item prediction, not learning outcomes (BKT outperforms DKT on post-test prediction, per Lin & Chi, 2018). Computationally expensive to train.

Cold-start behavior: Poor. Requires population data before producing meaningful per-student estimates.

Data requirements: Minimum tens of thousands of interaction records across the student population. WaxPrep will not have this at launch.

Suitability for WaxPrep: Effectively zero. Wrong architecture for conversational tutoring with sparse, individual student data.

**Verdict: Do not implement. Will never be appropriate for per-student inference in WaxPrep's context.**

### 2.3 Attention-Based KT (SAKT, AKT, etc.)

Strengths: Better prediction than DKT on many benchmarks. Attention allows some interpretability of which past interactions influenced current prediction.

Weaknesses: Requires even more data than DKT. Same cold-start problem. Even heavier computational requirements. More recent models show marginal improvements over DKT that rarely justify the complexity for a production application.

**Verdict: Do not implement. Same problems as DKT, amplified.**

### 2.4 Performance Factor Analysis (Pavlik et al., 2009)

Strengths: More interpretable than DKT. Tracks successes and failures separately. Incorporates learning curve theory. Works with sparse data. Simpler than BKT in implementation.

Weaknesses: Same structured-practice assumption as BKT. Fixed parameters require calibration data. Does not model forgetting in the base model.

Suitability for WaxPrep: Better than classical BKT conceptually, but shares the same structured-practice assumption problem.

**Verdict: PFA concepts should inform the RWEA model, particularly the separate tracking of successes and failures. Do not implement PFA as a formal model.**

### 2.5 LLMKT (Scarlatos, Baker & Lan, 2025)

Strengths: Directly designed for tutor-student dialogue. Significantly outperforms classical KT in conversational settings. LLM handles the ambiguity inherent in conversational responses. Achieves >93% accuracy for LLM-generated correctness labels.

Weaknesses: Expensive (requires LLM call for KC relevance assessment per turn). Requires carefully designed prompts. The LLM is reasoning over the conversation, not over a structured data model — this produces richer but less reproducible estimates.

Suitability for WaxPrep: Excellent for evidence extraction. The LLM can extract KC relevance and correctness from each conversational turn with high accuracy. However, full LLMKT (where the LLM also maintains the knowledge state) is expensive and less transparent than a hybrid approach.

**Verdict: Use LLM-based evidence extraction. Maintain the knowledge state in a structured database (not in the LLM). Feed the structured evidence to the AI at context-assembly time.**

### 2.6 Cognitive Diagnosis Models (DINA, DINO, G-DINA)

Strengths: Explicitly models skill conjunctions (a concept requires mastery of multiple sub-skills). Provides diagnostic information about which specific sub-skills are missing.

Weaknesses: Requires a Q-matrix (mapping of items to required skills) — significant expert knowledge requirement. Designed for assessment settings, not continuous conversational tutoring. Cannot handle the open-ended nature of conversation.

**Verdict: Architecturally interesting for later stages. Completely premature for Stages 27–34.**

### 2.7 The Recommended Approach: Recency-Weighted Evidence Accumulator (RWEA)

Based on the research above, WaxPrep should implement a novel but simple hybrid model that respects the conversational, sparse-data context while maintaining interpretability.

The RWEA model works as follows:

For each (student, concept) pair, maintain:
- `success_count_weighted`: Sum of weighted correctness scores from LLM evaluation (0.0–1.0 per observation), with more recent observations weighted more heavily.
- `failure_count_weighted`: Sum of weighted failure contributions from LLM evaluation.
- `hint_dependency_score`: Weighted average of hint dependency across observations (0 = no hints, 1 = maximum hint dependence).
- `mastery_estimate`: A derived value computed from the above, with time-decay applied.
- `evidence_count`: Number of underlying observations.
- `last_evidence_at`: Timestamp of the most recent observation.

The mastery estimate is computed as:

```
decay_factor = e^{-λ × days_since_last_evidence}  
# λ is configurable (default: 0.015, giving ~half-life of 46 days)
# This is Ebbinghaus-inspired decay, not arbitrary

mastery_estimate = decay_factor × tanh(
    (success_count_weighted - failure_count_weighted) / 
    max(evidence_count, 1)
) 
# tanh maps the net success-failure signal to (−1, +1)
# Apply a shift to get (0, 1): mastery = (tanh_value + 1) / 2
# Clamp to [0.05, 0.95] — never true certainty in either direction
```

This model:
- Respects the evidence-based philosophy: it is a summary of observed evidence, not a pedagogy.
- Incorporates forgetting: mastery estimates decay over time without new evidence.
- Works with sparse data: meaningful from the first observation.
- Is interpretable: "mastery_estimate: 0.71 (7 observations, last 3 days ago, 2 hints used in most recent attempt)."
- Does not require training on population data.
- Does not make automated decisions.
- Provides the AI with a genuine calibrated signal.

This is deliberately NOT classical BKT. It does not have BKT's four parameters or its Bayesian update rule. It is a simpler, more appropriate model for the conversational context. It is also clearly more appropriate than DKT. It is inspired by PFA (separate success/failure tracking) and augmented BKT (with forgetting) but implemented as a fresh, simple model designed specifically for WaxPrep.

---

# PART THREE: THE CORE PHILOSOPHY — VALIDATION AND CRITIQUE

## 3. Research Validation of the Evidence-Over-Decisions Principle

The brief's central principle — "Infrastructure produces evidence. AI interprets evidence and decides how to teach." — is strongly supported by the research literature, with one important qualification.

**Validation from formative assessment research:** Black & Wiliam (1998) established that formative assessment works precisely because it separates evidence collection (the infrastructure) from pedagogical action (the teacher). The evidence is what is measured; the action is what the teacher decides. Automating the action removes the intelligence that makes formative assessment work.

**Validation from ITS research:** The best-performing ITS systems maintain interpretable student models that human teachers can override or interpret (Koedinger & Corbett, 2006). Systems that automate all pedagogical decisions are less effective than systems that provide evidence for expert judgment.

**Validation from LLM tutoring research:** Scarlatos et al. (2025) find that LLM-based knowledge tracing is more effective than classical KT precisely because the LLM can interpret ambiguous evidence with contextual reasoning. Separating evidence infrastructure from AI reasoning is what makes this work.

**The Important Qualification**

Some behaviors should be deterministic infrastructure, not AI choices. These are not "pedagogical decisions" — they are operational safeguards:

Safety filtering (if a student message involves self-harm, that requires a deterministic response, not AI pedagogical reasoning) is deterministic infrastructure. Account status enforcement (blocked students do not get tutored) is deterministic. Evidence persistence (every interaction is recorded) is deterministic. These are not covered by the "AI decides" principle.

However, within the tutoring domain, the principle holds fully. Whether to explain, whether to assess, whether to scaffold, whether to give a hint — all of these are pedagogical decisions that belong to the AI.

**The Modified Principle**

The principle should be stated more precisely:

"Deterministic infrastructure provides reliable, uncertainty-quantified, auditable evidence about what the student has experienced, demonstrated, struggled with, and potentially learned. The AI uses this evidence, its domain knowledge, and its pedagogical reasoning to decide how to teach. Infrastructure never overrides AI pedagogical judgment within the tutoring domain."

---

# PART FOUR: THE REVISED IMPLEMENTATION SEQUENCE

## 4. Why the Order Must Change

The original proposed order (27 → 28 → 29 → 30 → 31 → 32 → 33 → 34) has a structural problem: it tries to define the data schema (Stage 27) before establishing what data can actually be collected from the real WaxPrep conversational context (Stage 28). Schema designed without knowledge of the real data will be redesigned after evidence collection is built. This is backward.

The correct order, with justification:

**Phase F.1 — Design (no code yet):**
34 (Student Model Context Interface — specification only): Design the AI-facing output first. Every other stage builds toward this specification. Build the interface contract before building the implementation.

**Phase F.2 — Evidence Foundation:**
28 (Evidence Collection Pipeline): Build the evidence taxonomy and evidence schema first. What evidence can WaxPrep actually collect from WhatsApp conversation?
27 (Student Model Schema): Now that you know what evidence is available, design the knowledge state schema to summarize it correctly.

**Phase F.3 — State Management:**
29 (Mastery Estimation — RWEA): Build the update function that transforms evidence into mastery estimates.
30 (Misconception Detection): Build the LLM-assisted misconception evidence pipeline.

**Phase F.4 — Signal Enrichment:**
31 (Learning Signals and Behavioral Analytics): Build hint dependency tracking, response pattern analysis, temporal signals.
32 (Formative Assessment Architecture): Refine the assessment evidence extraction pipeline.

**Phase F.5 — Integration:**
33 (Student Model Versioning and Integrity): Build integrity, versioning, and audit infrastructure.
34 (Student Model Context Interface — implementation): Complete the implementation of the AI-facing interface.

**Revised implementation order: 34(spec) → 28 → 27 → 29 → 30 → 31 → 32 → 33 → 34(impl)**

---

# PART FIVE: THE DATABASE ARCHITECTURE

## 5. Complete Revised Database Schema

The proposed schema in the brief has the right intentions but several deficiencies. This section provides a complete, production-ready schema that replaces and extends the original proposal.

### 5.1 The Fundamental Design Decision: Append-Only Evidence

**RECOMMENDATION: The evidence tables (observations) must be append-only. The state tables (mastery estimates) must be materialized from evidence.**

This is not full event sourcing (which would be over-engineering). It is a simpler pattern: immutable event log + derived materialized state.

Every observable interaction is written to an append-only `learning_observations` table. Observations are never deleted except under legal deletion requests, and even then only soft-deleted with a deletion record.

The `knowledge_states` table is a materialized summary of the evidence — it is recomputed whenever new evidence arrives. It is not append-only but it is always derivable from the observations.

This pattern provides:
- Complete audit trail (every state change is traceable to observations).
- Correction ability (if an evidence record is found to be erroneous, it is soft-deleted and states are recomputed).
- Reproducibility (given the same observations, the same state must be produced).
- Privacy compliance (deletion of a student's data means soft-deleting observations and recomputing states).

### 5.2 The Concept Registry

The concept_tags in the original proposal are bare strings. This creates a significant problem: the same concept can be referred to as "quadratic_equations," "quadratic equations," "quadratic formula," or "solving quadratics" — all referring to the same KC. Without a canonical registry, the student model fragments across different string representations of the same concept.

```sql
-- Migration: 006_learning_intelligence_foundation.sql

-- ============================================================
-- CONCEPT REGISTRY
-- Flexible, non-curriculum-prescriptive concept definitions.
-- Concepts are not a fixed list. They emerge from instruction.
-- ============================================================
CREATE TABLE concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Canonical identifier (slug format, no spaces)
  -- Examples: quadratic_equations, newton_second_law, photosynthesis
  canonical_tag TEXT NOT NULL UNIQUE,
  
  -- Human-readable name
  display_name TEXT NOT NULL,
  
  -- Classification metadata (all optional — do not require upfront)
  subject TEXT,              -- 'mathematics', 'physics', 'chemistry', etc.
  granularity TEXT,          -- 'micro', 'meso', 'macro' — how atomic is this concept?
  
  -- Exam relevance metadata (optional array for flexibility)
  exam_references JSONB DEFAULT '[]',
  -- Example: [{"exam":"WAEC","year":2026},{"exam":"JAMB"}]
  
  -- Curriculum context (optional — do not enforce any specific curriculum)
  curriculum_notes TEXT,
  -- Free-text: "This concept appears in SS2 Physics curriculum" 
  -- NOT a structured foreign key to any curriculum database
  
  -- Aliases (other ways this concept might be referred to)
  aliases JSONB DEFAULT '[]',
  -- Example: ["quadratic formula", "solving quadratics", "ax2+bx+c"]
  
  -- Concept relationships (lightweight, optional)
  -- Stored as text arrays of canonical_tags — no foreign key enforcement
  -- The AI uses these as hints, not as hard rules
  related_concepts JSONB DEFAULT '[]',
  -- Example: {"has_prerequisites": ["linear_equations"], "related_to": ["cubic_equations"]}
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',  -- 'system', 'ai_extraction', 'admin'
  
  -- Soft deletion (concepts are never hard-deleted)
  archived_at TIMESTAMPTZ,
  archive_reason TEXT
);

-- Critical index: tag lookup must be fast (used on every evidence record)
CREATE UNIQUE INDEX idx_concepts_tag ON concepts(canonical_tag);
CREATE INDEX idx_concepts_subject ON concepts(subject) WHERE subject IS NOT NULL;
```

**Key architectural decision:** The concept registry is NOT a hardcoded curriculum. Concepts are created lazily — when the AI identifies a concept in conversation that is not in the registry, a new registry entry is created. The schema supports this with `created_by = 'ai_extraction'`. Operators can also add concepts manually. But nothing in the WaxPrep application depends on a fixed list of allowed concepts.

The `related_concepts` JSONB field provides lightweight concept relationships without creating a rigid prerequisite dependency graph. The AI reads these relationships as hints. Infrastructure does not enforce prerequisite ordering.

### 5.3 Learning Observations (The Immutable Evidence Log)

```sql
-- ============================================================
-- LEARNING OBSERVATIONS — APPEND-ONLY EVIDENCE LOG
-- Every piece of learning-relevant evidence WaxPrep collects.
-- This is the ground truth. States are derived from this.
-- ============================================================
CREATE TABLE learning_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership (mandatory, absolute isolation)
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES sessions(id),
  
  -- Source
  message_id UUID REFERENCES messages(id),     -- The specific message this came from
  ai_request_id UUID REFERENCES ai_requests(id), -- The AI call that produced this evidence
  
  -- Concept identification
  concept_tag TEXT NOT NULL,                   -- References concepts.canonical_tag
  -- NOTE: NOT a foreign key — concept may not be registered yet at write time
  -- The evidence pipeline resolves/creates the registry entry separately
  
  -- Evidence type taxonomy (complete taxonomy defined in Section 12)
  evidence_type TEXT NOT NULL,
  -- 'direct_response'    — student directly answered a question
  -- 'explanation_attempt' — student tried to explain a concept
  -- 'correction_response' — student responded to a correction
  -- 'hint_request'       — student asked for help
  -- 'self_reported'      — student stated their own confidence level
  -- 'error_commission'   — student made an identifiable error
  -- 'concept_mention'    — student mentioned the concept (without assessment)
  
  -- Outcome (for assessable evidence types) 
  -- Null for non-assessable types (concept_mention, hint_request)
  correctness NUMERIC(4,3),            -- 0.000 = completely wrong, 1.000 = completely correct
  -- Not a boolean. Partial credit is real.
  correctness_confidence NUMERIC(4,3), -- How confident is the evaluator in this correctness score?
  
  -- Partial correctness breakdown (optional, for richer evidence)
  correctness_breakdown JSONB,
  -- Example: {"conceptual_understanding": 0.8, "procedural_accuracy": 0.5}
  
  -- Help behavior
  hint_level INTEGER DEFAULT 0,        -- 0 = no hints, 1+ = number of hints received
  -- IMPORTANT: A correct response with hint_level=2 is weaker evidence than
  -- a correct response with hint_level=0
  
  -- Response timing
  response_time_ms INTEGER,            -- NULL if not measurable in WhatsApp context
  -- WhatsApp does not reliably expose typing speed, but we can track
  -- time between message receipt and response message
  
  -- Evidence quality metadata
  extraction_method TEXT NOT NULL,     -- 'llm_evaluation', 'ai_inline', 'self_report'
  extraction_confidence NUMERIC(4,3),  -- How confident is the extraction itself?
  evaluator_model TEXT,                -- Which AI model produced this evidence
  evaluator_prompt_version TEXT,       -- Which evaluation prompt version
  
  -- Student response content reference (for audit)
  -- We do NOT store the actual content here (privacy) — only reference to message
  -- The message record contains the content and is separately privacy-controlled
  
  -- Misconception flag (preliminary — detailed misconception table is separate)
  possible_misconception BOOLEAN DEFAULT FALSE,
  misconception_tag TEXT,              -- If a known misconception category
  
  -- Temporal
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Immutability enforcement
  -- Once written, observations are never modified.
  -- If an observation is erroneous: soft-delete it and recompute states.
  deleted_at TIMESTAMPTZ,             -- NULL = valid evidence
  deletion_reason TEXT,
  deletion_authorized_by TEXT,        -- Who authorized the deletion
  
  CONSTRAINT check_correctness_range 
    CHECK (correctness IS NULL OR (correctness >= 0 AND correctness <= 1)),
  CONSTRAINT check_confidence_range
    CHECK (extraction_confidence IS NULL OR 
           (extraction_confidence >= 0 AND extraction_confidence <= 1))
);

-- Performance indexes (evidence is queried heavily per student per concept)
CREATE INDEX idx_observations_wax_concept 
  ON learning_observations(wax_id, concept_tag, observed_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_observations_wax_session 
  ON learning_observations(wax_id, session_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_observations_concept_type
  ON learning_observations(concept_tag, evidence_type)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_observations_wax_recent
  ON learning_observations(wax_id, observed_at DESC)
  WHERE deleted_at IS NULL;

-- Partial index for misconception screening
CREATE INDEX idx_observations_misconceptions
  ON learning_observations(wax_id, concept_tag, observed_at DESC)
  WHERE possible_misconception = TRUE AND deleted_at IS NULL;
```

### 5.4 Knowledge States (Materialized Mastery Estimates)

```sql
-- ============================================================
-- KNOWLEDGE STATES — MATERIALIZED MASTERY ESTIMATES
-- Derived from learning_observations. Always recomputable.
-- This is the infrastructure's answer to "what does the student know?"
-- ============================================================
CREATE TABLE knowledge_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  concept_tag TEXT NOT NULL,
  
  -- RWEA Model parameters (see Section 2.7)
  mastery_estimate NUMERIC(4,3) NOT NULL DEFAULT 0.100,
  -- 0.000–1.000. This is NOT P(mastery) in the BKT sense.
  -- It is the RWEA output: a calibrated signal for the AI.
  -- Never exactly 0 or 1 — always [0.05, 0.95]
  
  -- Component signals (the AI can use these individually)
  success_signal NUMERIC(5,3) NOT NULL DEFAULT 0.000,  -- Accumulated weighted successes
  failure_signal NUMERIC(5,3) NOT NULL DEFAULT 0.000,  -- Accumulated weighted failures
  
  -- Trend signals
  recent_trend TEXT,        -- 'improving', 'stable', 'declining', 'insufficient_data'
  -- Computed by comparing recent 3 observations vs previous 3
  
  -- Help dependency
  hint_dependency NUMERIC(4,3) DEFAULT NULL, -- NULL = no data. 0-1 scale.
  hint_dependency_trend TEXT,                -- 'increasing', 'decreasing', 'stable', NULL
  
  -- Evidence metadata
  evidence_count INTEGER NOT NULL DEFAULT 0,
  direct_response_count INTEGER NOT NULL DEFAULT 0,   -- Only the highest-quality evidence type
  last_evidence_at TIMESTAMPTZ,
  first_evidence_at TIMESTAMPTZ,
  
  -- Temporal decay
  decay_factor_applied NUMERIC(5,4),   -- The decay factor applied at last update
  -- Allows the AI to see how stale the estimate is
  
  -- State validity
  state_version INTEGER NOT NULL DEFAULT 1,  -- Increments on every recomputation
  last_computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- A single active state per (wax_id, concept_tag)
  UNIQUE (wax_id, concept_tag),
  
  CONSTRAINT check_mastery_range 
    CHECK (mastery_estimate >= 0 AND mastery_estimate <= 1)
);

-- Performance indexes
CREATE INDEX idx_knowledge_states_wax 
  ON knowledge_states(wax_id, mastery_estimate DESC);

CREATE INDEX idx_knowledge_states_wax_recent
  ON knowledge_states(wax_id, last_evidence_at DESC NULLS LAST);

CREATE INDEX idx_knowledge_states_concept
  ON knowledge_states(concept_tag, mastery_estimate DESC);
```

### 5.5 Misconception Records

```sql
-- ============================================================
-- MISCONCEPTIONS
-- Structured records of identified systematic errors.
-- Each misconception record is supported by evidence observations.
-- ============================================================
CREATE TABLE misconceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  
  -- What and where
  concept_tag TEXT NOT NULL,
  
  -- Misconception description (AI-extracted, free text)
  description TEXT NOT NULL,
  -- Example: "Student believes force is required to maintain constant velocity 
  -- (Newton's First Law violation, Aristotelian physics misconception)"
  
  -- Evidence support
  observation_ids UUID[] NOT NULL DEFAULT '{}',
  -- Array of learning_observations.id values that support this misconception
  evidence_count INTEGER NOT NULL DEFAULT 1,
  
  -- Confidence
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  -- How confident are we that this is a stable misconception vs a one-time slip?
  
  -- Status lifecycle
  status TEXT NOT NULL DEFAULT 'suspected'
    CHECK (status IN ('suspected', 'confirmed', 'resolved', 'archived')),
  -- suspected: 1-2 observations
  -- confirmed: 3+ observations
  -- resolved: student has demonstrated correct understanding since
  -- archived: no longer active
  
  resolved_at TIMESTAMPTZ,
  resolution_evidence_id UUID REFERENCES learning_observations(id),
  
  -- Extraction metadata
  detected_by TEXT NOT NULL,  -- 'llm_inline', 'session_summarizer', 'manual'
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_confirmed_at TIMESTAMPTZ,
  
  -- Soft deletion
  deleted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_misconceptions_wax_active
  ON misconceptions(wax_id, concept_tag, status)
  WHERE status IN ('suspected', 'confirmed') AND deleted_at IS NULL;

CREATE INDEX idx_misconceptions_wax_recent
  ON misconceptions(wax_id, first_detected_at DESC)
  WHERE deleted_at IS NULL;
```

### 5.6 Learning Signals (Behavioral Aggregates)

```sql
-- ============================================================
-- LEARNING SIGNALS
-- Session-level and cross-session behavioral aggregates.
-- These are NOT mastery estimates. They are behavioral signals
-- that give the AI information about HOW the student is learning.
-- ============================================================
CREATE TABLE learning_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  session_id UUID REFERENCES sessions(id),  -- NULL = cross-session signal
  concept_tag TEXT,                          -- NULL = session-wide signal
  
  -- Signal type
  signal_type TEXT NOT NULL,
  -- 'session_engagement': overall session engagement level
  -- 'hint_dependency_session': hint dependency for this session
  -- 'response_latency_trend': is the student taking longer to respond?
  -- 'concept_revisit': student asked about same concept in multiple sessions
  -- 'self_efficacy': student expressed confidence or lack thereof
  -- 'frustration_signal': behavioral indicators of frustration
  
  -- Signal value
  signal_value NUMERIC(6,3),    -- Numeric value where applicable
  signal_text TEXT,              -- Text signal where more meaningful
  signal_metadata JSONB,         -- Additional structured context
  
  -- Confidence in this signal
  signal_confidence NUMERIC(4,3) DEFAULT 0.700,
  
  -- Extraction
  extracted_by TEXT NOT NULL,   -- 'llm_session_analyzer', 'rule_engine', 'system'
  
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_signals_wax_type
  ON learning_signals(wax_id, signal_type, observed_at DESC);

CREATE INDEX idx_signals_wax_session
  ON learning_signals(wax_id, session_id)
  WHERE session_id IS NOT NULL;
```

### 5.7 Student Model Snapshots (Context Injection Cache)

```sql
-- ============================================================
-- STUDENT MODEL SNAPSHOTS
-- Pre-assembled student model context for efficient AI injection.
-- Generated at the end of each session (background job) or
-- lazily at context assembly time if stale.
-- ============================================================
CREATE TABLE student_model_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wax_id UUID NOT NULL REFERENCES students(id),
  
  -- Snapshot content
  snapshot_text TEXT NOT NULL,    -- Pre-formatted text for AI context injection
  snapshot_json JSONB NOT NULL,   -- Structured data for programmatic access
  
  -- Freshness tracking
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  covers_through TIMESTAMPTZ NOT NULL,  -- What timestamp range does this cover
  
  -- Validity
  is_stale BOOLEAN NOT NULL DEFAULT FALSE,
  -- Mark stale when new observations arrive that post-date covers_through
  
  -- Metadata
  knowledge_state_count INTEGER NOT NULL DEFAULT 0,
  active_misconception_count INTEGER NOT NULL DEFAULT 0,
  concept_count INTEGER NOT NULL DEFAULT 0,
  
  -- Token estimation (for context budget management)
  estimated_tokens INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_snapshots_wax_fresh
  ON student_model_snapshots(wax_id, generated_at DESC)
  WHERE is_stale = FALSE;
```

---

# PART SIX: STAGE-BY-STAGE SPECIFICATIONS

## STAGE 27 — STUDENT MODEL SCHEMA

### 1. Purpose

Define the complete data structures that represent a student's learning state across concepts. This schema is the foundation upon which all learning intelligence is built. It must be flexible enough to represent concepts that were never anticipated when it was designed, precise enough to be computationally useful, and privacy-conscious enough to contain only educational behavioral data rather than personal profiles.

### 2. Educational Rationale

The student model is the mechanism through which WaxPrep's AI gains awareness of who the student is as a learner — separate from who they are as a person (which is Stage 23's core memory). The learning model asks: what has this student demonstrated? What do they struggle with? What signals suggest their current knowledge state? Corbett & Anderson (1994) established that a functioning student model dramatically improves tutoring effectiveness by allowing instruction to be calibrated to the student's current level.

### 3. Research Evidence

The literature consistently shows that student models tracking KC-level mastery outperform session-level or subject-level models (Koedinger & Corbett, 2006). Fine-grained KC tracking enables targeted remediation. However, the research also shows that over-granular KCs (too many small skills) lead to model fragmentation and degraded performance — a balance must be struck.

### 4. Technical Architecture

As specified in Section 5: `concepts`, `knowledge_states`, `learning_observations`, `misconceptions`, `learning_signals`, `student_model_snapshots`. The schema is append-only for evidence (observations), materialized for state (knowledge_states), and generated for context (snapshots).

### 5. Data Model

Complete schema as specified in Section 5.

### 6. API/Interface Design

```
// Conceptual API — integrate with existing data access patterns
StudentLearningAccess(waxId) {
  getKnowledgeStates(options?) → KnowledgeState[]
  getKnowledgeState(conceptTag) → KnowledgeState | null
  getActiveMisconceptions() → Misconception[]
  getMisconception(id) → Misconception | null
  getLearningSignals(sessionId?) → LearningSignal[]
  getStudentModelSnapshot() → StudentModelSnapshot | null
  
  // Evidence writes (called by evidence pipeline, not directly by tutoring)
  writeObservation(observation) → LearningObservation
  updateKnowledgeState(conceptTag) → KnowledgeState
  writeMisconception(misconception) → Misconception
  writeSignal(signal) → LearningSignal
}
```

### 7. Input/Output Examples

```
Input: Evidence observation for concept "quadratic_equations"
{
  waxId: "uuid-abc",
  sessionId: "sess-xyz",
  conceptTag: "quadratic_equations",
  evidenceType: "direct_response",
  correctness: 0.80,   // Mostly correct, minor error
  extractionConfidence: 0.90,
  hintLevel: 0,
  responseTimeMs: 45000
}

Output: Updated KnowledgeState
{
  waxId: "uuid-abc",
  conceptTag: "quadratic_equations",
  masteryEstimate: 0.64,
  successSignal: 3.2,
  failureSignal: 1.1,
  recentTrend: "improving",
  hintDependency: 0.10,
  evidenceCount: 5,
  lastEvidenceAt: "2026-09-05T14:30:00Z",
  decayFactorApplied: 0.982  // Very recent — minimal decay
}
```

### 8. Dependencies

Depends on: Stage 22 schema (memory foundation), Stage 3 (database), Stage 12 (WaxID). Must be built before Stage 29 (mastery estimation) can compute values into it.

### 9. Failure Modes

Schema migration fails (incomplete migration applied). Concept tag not found in registry at evidence write time (create a new registry entry — do not block evidence persistence). Foreign key constraint violation if WaxID is invalid (student isolation maintained).

### 10. Edge Cases

A single conversation turn may involve multiple concepts. The evidence record must support multiple concept tags per turn — implement this by creating one observation record per concept per turn (not one record with an array of concepts). This keeps queries simple and prevents ambiguous evidence attribution.

A concept mentioned but not assessed (student asks about it without being asked to demonstrate knowledge) should produce an observation with `evidence_type = 'concept_mention'` and `correctness = null`. This is valid evidence (it tells the AI the student is engaging with the concept) even without an assessable outcome.

A student provides a partially correct answer. Correctness is a decimal, not a boolean. `correctness: 0.60` is the correct representation, not a binary mapping. Do not round to 0 or 1 unless the answer is completely correct or completely wrong.

### 11. Privacy Implications

The learning observations log contains behavioral data about academic performance — which concepts the student struggles with, patterns of help-seeking, error patterns. This is sensitive educational data under the NDPA.

Critical privacy design: observations are linked to WaxID (pseudonymous), not to raw phone numbers. Observation records do not contain the text of student responses — only structured metadata derived from evaluation. The actual response text is in the messages table, governed by existing privacy rules.

Retention: observations must be deletable under NDPA right to erasure. Soft deletion of observations triggers recomputation of knowledge states. The mechanism is: mark observations deleted → recompute all affected knowledge states → the student's learning model reflects only non-deleted evidence.

Separation: learning data (this schema) and personal profile data (Stage 23 memory) must be stored in separate tables with separate access controls. Never JOIN them in a single query unless explicitly authorized.

### 12. Data Quality Concerns

The MUST HAVE check: every knowledge state must be derivable from its observations. Run a periodic reconciliation job that recomputes knowledge states from observations and alerts if the materialized state deviates from the derived state.

The extraction confidence field is critical: low-confidence evidence (confidence < 0.50) should be weighted less in mastery computation. Infrastructure stores the confidence; the RWEA model applies it.

### 13. What Can Be Automated

MUST HAVE: Concept registry creation when AI identifies a new concept. Knowledge state update after every new observation. Stale snapshot detection when new observations arrive.

SHOULD HAVE SOON: Periodic knowledge state recomputation from observations (reconciliation).

FUTURE: Automatic concept merging when aliases are detected. Concept hierarchy inference from relationship data.

### 14. What Should Remain AI-Controlled

Which concept is relevant to a given conversation turn. What the quality of a student's response means pedagogically. Whether a partial answer reflects genuine partial understanding or procedural confusion.

### 15. What Should Remain Deterministic

Which observations belong to which student (WaxID isolation — never AI-determined). Whether an observation is valid (format validation — not content judgment). The RWEA computation (given inputs, output is deterministic). Timestamp recording. Evidence count increment.

### 16. What Should NOT Be Implemented

A prerequisite enforcement graph that blocks the AI from teaching certain concepts. A "mastery threshold triggers action" rule (mastery > 0.9 → mark complete). A concept difficulty database that prescribes what a concept should score. Any hardcoded mapping from mastery estimate to pedagogical action.

### 17. Testing Strategy

Unit test: RWEA computation given known inputs produces correct output. Unit test: Time decay reduces mastery estimate correctly. Property test: mastery_estimate always in [0.05, 0.95]. Property test: evidence from one student never affects another student's knowledge state. Integration test: write observation → knowledge state updated. Data quality test: knowledge state matches recomputed value from observations.

### 18. Completion Criteria

Complete SQL migrations applied. StudentLearningAccess class implemented with all specified methods. All indexes created. RWEA computation function tested with known values. Cross-student isolation verified via test.

### 19. Recommended Improvements

The original schema was missing: correctness as a decimal (not binary), extraction confidence, hint level, response time, temporal decay, misconception records, learning signals, and model snapshots. All added in the revised schema.

### 20. Stage Order

This stage should be implemented after Stage 28 (evidence pipeline), as the schema must be designed around the evidence that can actually be collected.

### 21. Split/Combine Recommendation

Split: The concept registry belongs in a separate stage or at minimum a separate migration. It has different operational characteristics (rare writes, frequent reads) from the evidence tables (very frequent writes).

**Classification: MUST HAVE NOW for schema. The concept registry can start minimal (just canonical_tag and display_name) and grow.**

---

## STAGE 28 — EVIDENCE COLLECTION PIPELINE

### 1. Purpose

Build the pipeline that transforms raw conversational interactions into structured, typed, confidence-annotated learning evidence. This is the input layer to the entire student model system. Without reliable evidence collection, everything that depends on it is garbage.

### 2. Educational Rationale

Formative assessment evidence should be collected continuously, not only during formal test moments (Black & Wiliam, 1998). Every tutoring exchange contains evidence: a correct explanation is evidence of understanding; a hesitant response is evidence of uncertainty; a direct question is evidence of active engagement; a mistake is evidence of a gap. The pipeline extracts this evidence systematically.

The research baseline: turn-level annotation using LLMs achieves >93% accuracy for correctness labels and >0.4 Krippendorff's alpha on KC relevance with human raters (Scarlatos et al., LAK 2025). This makes LLM-based evidence extraction production-viable.

### 3. Research Evidence

Evidence taxonomy in the literature includes (VanLehn, 2006; Chi, Siler & Jeong, 2004):
- Assessment responses (highest quality evidence)
- Explanation attempts (high quality — metacognition)
- Self-explanation (metacognitive evidence)
- Error commission (diagnostic evidence)
- Help-seeking (behavioral evidence — correlates negatively with performance)
- Self-reported confidence (metacognitive, but unreliable without calibration)
- Concept engagement (participation evidence)

The research also establishes that hint-penalized responses (correct answers given after hints) should be treated differently from unprompted correct responses. Feng et al. (2009) found significant negative correlation between hint use and test scores.

### 4. Technical Architecture

The evidence pipeline has three layers:

**Layer 1 — Inline extraction (during tutoring):** After each AI tutoring turn, the AI's response includes an optional structured evidence block. When the AI evaluates the student's response as part of tutoring, it can emit a machine-readable evidence record alongside the tutoring response. This is optional — the AI should tutor naturally and include the evidence block only when a clean evaluation is appropriate.

**Layer 2 — Session-end extraction (background job):** After session closure, the consolidation worker (Stage 24's background job) analyzes the full session transcript. It extracts evidence for all concepts discussed, with higher-quality evaluation possible because the full session context is available.

**Layer 3 — Dedicated evaluation calls:** For ambiguous or high-value interactions, a separate AI call is made specifically to evaluate the student's understanding. This is more expensive but produces higher-quality evidence. Use sparingly — not on every turn.

### 5. Data Model

The `learning_observations` table (Section 5.3) is the output of this pipeline. No additional tables needed for the pipeline itself.

### 6. API/Interface Design

```
// Evidence pipeline components

EvidenceExtractor {
  extractFromTurn(turn: ConversationTurn) → LearningObservation[]
  // Called inline after each tutoring turn when the AI produced an inline evidence block
  
  extractFromSession(sessionId: string) → LearningObservation[]
  // Called by background job at session end
  
  validateObservation(obs: LearningObservation) → ValidationResult
  // Validates format, range, cross-student isolation
}

EvidenceWriter {
  write(observation: LearningObservation) → { id, conceptCreated: boolean }
  // Writes observation, creates concept registry entry if needed,
  // marks knowledge state as stale
  
  batchWrite(observations: LearningObservation[]) → BatchResult
  // For session-end extraction (may be multiple observations per session)
}
```

### 7. Complete Evidence Type Taxonomy

**direct_response:** Student directly responded to a question or prompt. Highest quality. The AI evaluated the response for correctness and concept relevance.
- correctness: 0.0–1.0
- hintLevel: how many hints preceded the response

**explanation_attempt:** Student tried to explain a concept in their own words. High quality for assessing conceptual understanding (not just procedural recall).
- correctness: 0.0–1.0 (quality of explanation)
- correctnessBreakdown: { conceptual_accuracy, completeness, clarity }

**correction_response:** Student responded to being told they were wrong. Did they demonstrate understanding of the correction?
- correctness: 0.0–1.0

**hint_request:** Student asked for a hint or additional help. Not assessable, but important behavioral evidence.
- correctness: null
- signalValue: hint_level requested

**self_reported_confidence:** Student stated how confident they feel. Metacognitive evidence — correlates with actual performance but is often miscalibrated (Dunning-Kruger effects are real in secondary education).
- correctness: null
- signalValue: 0.0–1.0 (student's stated confidence, mapped from natural language)

**error_commission:** Student made an identifiable error that was captured even without being formally assessed. Includes spontaneous mistakes, wrong assumptions, incorrect formulas used.
- correctness: 0.0 (by definition this evidence type indicates incorrect understanding)
- misconceptionTag: if a known error pattern is identified

**concept_mention:** Student mentioned a concept in a non-assessable way. Engagement evidence.
- correctness: null
- signalValue: engagement depth (1 = passing mention, 2 = active engagement, 3 = demonstrates familiarity)

**self_explanation:** Student spontaneously explained a concept or their reasoning without being asked. High-quality metacognitive evidence.
- correctness: 0.0–1.0

### 8. The AI Evidence Emission Pattern

The AI tutor is instructed (via system prompt or structured output tooling) to optionally emit a structured evidence block at the end of certain responses. This block is parsed by the evidence pipeline.

The key constraint: the AI should never interrupt its tutoring to "fill in an evidence form." Evidence emission must be natural and optional. If the AI cannot confidently extract structured evidence without disrupting the tutoring, it emits nothing and the session-end extraction handles it.

Example evidence block (embedded in AI response, stripped before delivery to student):

```json
// Appended to AI response, never sent to student
{
  "_waxprep_evidence": {
    "observations": [
      {
        "conceptTag": "newton_second_law",
        "evidenceType": "direct_response",
        "correctness": 0.85,
        "confidence": 0.90,
        "hintLevel": 0,
        "notes": "Student correctly stated F=ma and applied it to find acceleration. 
                  Minor error: forgot to specify units."
      }
    ]
  }
}
```

This block is parsed in the AI response processing pipeline and stripped before the response is sent to the student. If the block is absent, no evidence is extracted from that turn.

### 9. Dependencies

Depends on: Stage 27 (schema — writing observations), Stage 15/16 (AI provider — evaluation calls).

### 10. Failure Modes

AI evaluation call fails: Log the failure, skip evidence extraction for this turn, do not interrupt tutoring. Evidence extraction failure must never break the tutoring experience.

Concept tag not found in registry: Create a new registry entry with `created_by = 'ai_extraction'`. Proceed with evidence write. A human review queue should surface new AI-created concepts for curation.

Malformed evidence block from AI: Validate before parsing. If validation fails, log warning, skip evidence for this turn.

Duplicate evidence: An idempotency check on `(wax_id, message_id, concept_tag, evidence_type)` prevents duplicate observations from retried jobs.

### 11. Edge Cases

Multiple concepts in one turn: Emit one observation per concept. A student who correctly discusses both force and acceleration in one turn should produce two observations — one for each concept.

Ambiguous correctness: If the AI cannot confidently score correctness, it should emit `correctness: null` with `evidenceType: "concept_mention"` rather than guess. No evidence is better than bad evidence.

WhatsApp response timing: The `response_time_ms` field is computed from the timestamp difference between the WaxPrep AI response delivery time and the student's reply message timestamp. WhatsApp message timestamps (set by the student's device) are used, not delivery timestamps, to avoid network latency artifacts.

### 12. Privacy Implications

The observation records contain metadata about student performance (correctness scores, hint usage) but NOT the actual content of student responses. Privacy is maintained by linking to message IDs rather than copying content. This design is consistent with data minimization principles.

### 13. What Can Be Automated

MUST HAVE: Inline evidence parsing and writing. Concept registry creation for new tags.

SHOULD HAVE SOON: Session-end batch extraction. Evidence deduplication.

FUTURE: Confidence calibration (comparing AI-estimated correctness against later performance). Extraction accuracy monitoring (sampling-based human review of AI evaluations).

### 14. What Should Remain AI-Controlled

Which concept is relevant. What the correctness score should be. Whether a response reflects genuine understanding or procedural recall. Whether a misconception is implied.

### 15. What Should Remain Deterministic

Observation persistence. Timestamp recording. WaxID isolation. Evidence format validation.

### 16. What Should NOT Be Implemented

A rule-based parser that attempts to classify student responses as correct/incorrect using regex or keyword matching. This will produce garbage. All content evaluation must go through AI evaluation.

An "evidence score threshold" that triggers automatic pedagogical actions. Evidence is for the AI to use, not for infrastructure to act on.

### 17. Testing Strategy

Unit test: Evidence block parser correctly extracts and structures each evidence type. Unit test: Invalid evidence blocks are detected and rejected. Integration test: End-to-end flow from AI response with evidence block → parsed observation → knowledge state updated. Property test: Evidence from session A never contaminates knowledge states of a different student. Accuracy test (manual): Sample 50 AI-generated correctness evaluations and verify against human ratings.

### 18. Completion Criteria

Evidence block format defined and documented. Parser implemented and tested. Evidence writer with concept registry auto-creation operational. Integration with AI worker: evidence blocks are emitted and parsed. Session-end extraction job operational. All tests passing.

**Classification: MUST HAVE NOW. The entire student model depends on evidence collection.**

---

## STAGE 29 — MASTERY ESTIMATION (RWEA IMPLEMENTATION)

### 1. Purpose

Implement the Recency-Weighted Evidence Accumulator (RWEA) that transforms raw learning observations into calibrated mastery estimates for each (student, concept) pair. This is the computational heart of the student model.

### 2. Educational Rationale

A mastery estimate provides the AI with a calibrated signal about what a student has demonstrated across time. Without temporal integration, each interaction appears in isolation. The RWEA integrates evidence over time while applying forgetting decay — matching what cognitive science tells us about how knowledge consolidates and fades.

### 3. Research Evidence

The RWEA is inspired by and extends several research traditions:
- BKT's Bayesian update mechanism (Corbett & Anderson, 1994) — the principle that each observation updates a belief about mastery.
- PFA's separate success/failure tracking (Pavlik et al., 2009) — successes and failures carry different information.
- Ebbinghaus-inspired forgetting decay (Murre & Dros, 2015) — knowledge fades without review.
- Hint-penalized interpretation (Beck et al., 2008; Feng et al., 2009) — help-assisted responses are weaker evidence than unaided ones.

### 4. Technical Architecture

The RWEA computation function runs in two situations: immediately after a new observation is written (if real-time update is required), and in a background job that periodically recomputes states applying time decay even when no new observations have arrived.

**The RWEA Computation Algorithm:**

```
function computeMastery(observations: LearningObservation[], conceptTag: string, now: Date):
  
  // Step 1: Filter to valid observations
  validObs = observations.filter(
    o => o.conceptTag == conceptTag 
    && o.correctness != null  // Skip non-assessable types
    && o.deletedAt == null
  )
  
  if (validObs.length == 0):
    return DEFAULT_STATE  // No assessable evidence yet
  
  // Step 2: Compute observation weights
  // Weight = recency_weight × hint_penalty × extraction_confidence_weight
  for each obs in validObs:
    ageDays = (now - obs.observedAt) / (1000 * 86400)
    
    // Recency weight: more recent observations matter more
    // Half-life configurable: MASTERY_RECENCY_HALFLIFE_DAYS (default: 30)
    recencyWeight = exp(-0.693 / RECENCY_HALFLIFE * ageDays)
    
    // Hint penalty: responses after hints are weaker evidence
    hintPenalty = 1.0 / (1.0 + (obs.hintLevel * HINT_PENALTY_COEFFICIENT))
    // HINT_PENALTY_COEFFICIENT default: 0.3
    // hintLevel=0: penalty=1.0 (no penalty)
    // hintLevel=1: penalty=0.77 (slight reduction)
    // hintLevel=2: penalty=0.63
    // hintLevel=3: penalty=0.53
    
    // Extraction confidence: lower confidence evidence matters less
    confidenceWeight = obs.extractionConfidence ?? 0.70  // Default if not recorded
    
    obs.weight = recencyWeight × hintPenalty × confidenceWeight
  
  // Step 3: Compute success and failure signals
  successSignal = sum(obs.weight × obs.correctness for obs in validObs)
  failureSignal = sum(obs.weight × (1 - obs.correctness) for obs in validObs)
  
  // Step 4: Compute net mastery via tanh transform
  netSignal = (successSignal - failureSignal) / max(validObs.length, 1)
  rawMastery = (tanh(netSignal × SENSITIVITY) + 1) / 2
  // SENSITIVITY default: 2.0 — controls how sharply mastery responds to evidence
  
  // Step 5: Apply time-since-last-evidence decay to overall estimate
  mostRecentObs = max(validObs, by: observedAt)
  daysSinceLastEvidence = (now - mostRecentObs.observedAt) / (1000 * 86400)
  temporalDecayFactor = exp(-DECAY_LAMBDA × daysSinceLastEvidence)
  // DECAY_LAMBDA default: 0.015 → half-life ≈ 46 days
  // This is the Ebbinghaus-inspired forgetting component
  
  // Apply decay toward the baseline (not toward zero)
  MASTERY_BASELINE = 0.10  // Everyone starts with some base exposure to concepts
  decayedMastery = MASTERY_BASELINE + (rawMastery - MASTERY_BASELINE) × temporalDecayFactor
  
  // Step 6: Clamp to [0.05, 0.95]
  masteryEstimate = max(0.05, min(0.95, decayedMastery))
  
  // Step 7: Compute trend (compare recent 3 vs previous 3 assessable observations)
  recent3 = validObs[-3:]
  previous3 = validObs[-6:-3]
  if (recent3.length >= 2 and previous3.length >= 2):
    recentAvg = avg(o.correctness for o in recent3)
    previousAvg = avg(o.correctness for o in previous3)
    trend = if (recentAvg - previousAvg > 0.10): "improving"
            elif (recentAvg - previousAvg < -0.10): "declining"
            else: "stable"
  else:
    trend = "insufficient_data"
  
  // Step 8: Compute hint dependency
  assessableWithHints = validObs.filter(o => o.hintLevel > 0)
  hintDependency = assessableWithHints.length / max(validObs.length, 1)
  
  return {
    masteryEstimate,
    successSignal,
    failureSignal,
    recentTrend: trend,
    hintDependency,
    evidenceCount: validObs.length,
    decayFactorApplied: temporalDecayFactor,
    lastEvidenceAt: mostRecentObs.observedAt
  }
```

All parameters (RECENCY_HALFLIFE, HINT_PENALTY_COEFFICIENT, SENSITIVITY, DECAY_LAMBDA, MASTERY_BASELINE) are environment configuration values, not hardcoded constants. They should be validated in the Stage 2 configuration schema and default to well-researched values.

### 5. Data Model

Reads from `learning_observations`. Writes to `knowledge_states`. No new tables.

### 6. API/Interface Design

```
MasteryEngine {
  computeState(waxId, conceptTag) → KnowledgeState
  // Reads all valid observations, runs RWEA, returns computed state
  
  updateState(waxId, conceptTag) → KnowledgeState
  // computeState + writes result to knowledge_states table
  
  scheduleDecayRecomputation(waxId) → void
  // Queues a background job to recompute all states for this student
  // with current time-decay (even without new observations)
}
```

### 7. Background Decay Job

A weekly background job (added to the consolidation worker) recomputes mastery estimates for all students with evidence older than 3 days. This propagates time decay even when students are inactive. Without this job, a student who studied intensely a month ago would retain their pre-decay mastery estimate indefinitely. With it, the AI sees the natural forgetting that occurs over time.

### 8. Dependencies

Depends on Stage 28 (evidence is available to compute from) and Stage 27 (schema for storing results).

### 9. Failure Modes

Computation failure: Log the failure. The previous knowledge state remains unchanged. A failed computation does not corrupt existing data because we never delete states before successfully computing new ones.

Observation data integrity: If observations are deleted (privacy request) between computation runs, the next computation naturally produces a lower mastery estimate. This is correct behavior.

Configuration drift: If RWEA parameters change, recompute all states to ensure consistency. Store the configuration parameters used in each computation alongside the result (in the knowledge_states record or a separate computation audit table).

### 10. Failure Mode — The Ceiling Problem

A student who consistently performs well (mastery_estimate near 0.90) will not see further improvement from new correct responses. This is correct — a very high mastery estimate is evidence of mastery. But the time decay will gradually pull this down even if the student continues performing well. The AI should understand that a stable 0.85 mastery estimate maintained over 6 weeks represents genuine durable mastery, while a declining 0.75 estimate represents forgetting.

**This is why the snapshot text (Section 5.7) includes `decayFactorApplied`** — so the AI can reason about how recently the evidence was acquired.

### 11. Privacy Implications

Mastery estimates are derived data — they contain no direct personal information beyond what is in the observations. However, they should be treated as sensitive educational behavioral data and subject to the same deletion and access rights as the underlying observations.

**Classification: MUST HAVE NOW. This is the computational core of the student model.**

---

## STAGE 30 — MISCONCEPTION DETECTION

### 1. Purpose

Build the pipeline that identifies, records, and tracks systematic errors in student understanding — distinguishing stable misconceptions from random slips.

### 2. Educational Rationale

Repair Theory (Brown & VanLehn, 1980) established that student errors are often not random but systematic. A student with a Newton's Third Law misconception ("heavier objects push harder") will consistently produce errors in a predictable pattern. Identifying this pattern allows the AI to address the root cause rather than just correcting surface errors repeatedly.

The evidence is clear: correcting misconceptions improves learning (Gusukuma et al., 2018; Kennedy et al., 2020). But infrastructures that try to detect misconceptions too early, from insufficient evidence, produce false positives that cause the AI to address problems the student doesn't actually have. The threshold for recording a confirmed misconception must be high enough to be meaningful.

### 3. Research Evidence

Sonkar et al. (2024) found that LLMs are significantly worse at identifying incorrect reasoning containing misconceptions than identifying correct reasoning. This means misconception detection is genuinely difficult, even for frontier models. A single LLM evaluation claiming "this looks like a misconception" should be treated with considerable skepticism.

Ross & Andreas (2024) showed that adapting examples to students' misconceptions significantly improved tutoring effectiveness — validating that detecting misconceptions is worth the effort even if technically challenging.

The appropriate architecture: infrastructure accumulates evidence of possible misconceptions across multiple observations. After sufficient evidence, a misconception record is created with `status = 'suspected'`. After further corroboration, it is promoted to `status = 'confirmed'`. The AI uses this evidence in its reasoning.

### 4. Technical Architecture

**Layer 1 — Inline flagging:** When the AI evaluates a student response and suspects a misconception, it flags `possible_misconception = true` in the evidence block and optionally provides a `misconception_tag` (e.g., "aristotelian_motion" or "light_travels_instantly").

**Layer 2 — Pattern detection (background):** The session-end consolidation job analyzes all observations for a session. If two or more observations in the same concept area have `possible_misconception = true` with the same or similar misconception tag, a misconception record is created or updated.

**Layer 3 — Confirmation:** After three or more sessions in which the same misconception pattern appears, the misconception is promoted to `confirmed`.

**Layer 4 — Resolution detection:** When a student demonstrates clear correct understanding in a concept area where a misconception was previously confirmed, the misconception is marked `resolved` and the resolving observation ID is recorded.

### 5. The Misconception Taxonomy Approach

WaxPrep does NOT maintain a hardcoded list of allowed misconceptions. Misconceptions emerge from student behavior. The `misconception_tag` field is a free-text AI-generated label. However, a soft disambiguation mechanism exists: when a new misconception record is created, the session consolidation AI is asked to check whether the identified misconception matches any existing misconception records for this student (by reading existing misconception descriptions). If so, the new evidence supports the existing record rather than creating a new one.

### 6. API/Interface Design

```
MisconceptionTracker {
  recordPossibleMisconception(observation, tag, description) → void
  // Called when an observation flags possible_misconception = true
  
  consolidateMisconceptions(waxId, sessionId) → MisconceptionUpdate[]
  // Called by session-end job. Analyzes patterns, creates/updates records.
  
  confirmMisconception(misconceptionId) → Misconception
  // Called when evidence crosses confirmation threshold
  
  resolveIfDemonstrated(waxId, conceptTag, correctObservation) → void
  // Checks if an observation demonstrates resolution of a confirmed misconception
  
  getActiveMisconceptions(waxId) → Misconception[]
  // Returns suspected + confirmed misconceptions, ordered by confidence
}
```

### 7. Misconception Resolution — A Critical Design Decision

A confirmed misconception is NOT automatically resolved by a single correct response. A student who has consistently shown a Newton's Third Law misconception might guess correctly once without having resolved the underlying error.

**The resolution rule:** A misconception is marked `resolved` when the student demonstrates correct understanding in a clean assessment (no hints, high AI confidence, correct score ≥ 0.90) on a question that specifically targeted the misconception. The AI identifies when this has occurred as part of its inline evidence emission.

This is a high bar. Correct behavior. A resolved misconception record remains in the database — it is not deleted. It informs the AI that this concept area was previously difficult and may warrant periodic revisiting to ensure the resolution is durable.

### 8. Edge Cases

Misconception has been resolved but partially resurfaces: evidence shows renewed confusion in the same area. This does not reopen the resolved misconception record. Instead, a new `suspected` record is created. The AI sees both the historical resolved misconception and the new suspected one — rich evidence for tailored instruction.

Two different misconceptions in the same concept area: The student may have multiple misconceptions simultaneously. The schema supports multiple misconception records per `(wax_id, concept_tag)` combination. Each is a separate record. The AI receives all active misconceptions for a concept, not just one.

**Classification: MUST HAVE architecture. SHOULD HAVE SOON for inline detection. FUTURE for full automated confirmation cycle.**

---

## STAGE 31 — LEARNING SIGNALS AND BEHAVIORAL ANALYTICS

### 1. Purpose

Collect and expose behavioral signals beyond mastery estimates — engagement patterns, hint dependency trends, response latency patterns, and self-efficacy signals — that give the AI richer evidence about how the student is learning, not just what they know.

### 2. Educational Rationale

Knowledge state alone is insufficient for intelligent tutoring. Self-determination theory (Deci & Ryan, 1985) establishes that motivation, autonomy, and engagement are as important as cognitive state. An AI tutor that knows a student has mastered a concept but is disengaged will produce different, better instruction than one that only knows about mastery.

VanLehn (2011) identified that the best ITS systems model affect as well as cognition. Frustration, boredom, and confusion states produce different learning outcomes and require different instructional responses.

### 3. Key Learning Signals for WaxPrep

**Hint Dependency Signal:** As described in Section 1.6, hint dependency correlates negatively with learning outcomes. Track: hint use rate per concept per session, trend in hint use (increasing/decreasing), and whether correct responses consistently require hints.

**Response Engagement Signal:** In WhatsApp, response length and response time give indirect engagement signals. Short responses that arrive immediately may indicate less cognitive effort. Long, thoughtful responses may indicate deeper engagement. These are weak signals individually but meaningful in aggregate.

**Concept Revisit Signal:** When a student voluntarily returns to a previously covered concept, this signals either genuine curiosity (positive) or persistent confusion (context-dependent). The signal carries different meaning depending on the student's mastery estimate for the concept.

**Self-Efficacy Signal:** Students occasionally express confidence or lack thereof directly ("I don't understand this at all" vs "OK I think I get it now"). Natural language captures these signals. The AI can emit them as evidence in the inline evidence block.

**Session Completion Signal:** Did the student engage for the full session or abruptly stop responding? Repeated short sessions with abrupt ends may indicate frustration. The session record's `message_count` and `session_duration_minutes` contribute here.

### 4. Technical Architecture

Learning signals are written to the `learning_signals` table by:
- The inline evidence block (AI emits signals alongside observations).
- The session-end consolidation job.
- A weekly background analytics job (for cross-session patterns).

### 5. The Frustration Signal — Handling with Care

Some signals (frustration, disengagement) are potentially sensitive. WaxPrep should report these to the AI as educational signals: "Student engagement signal: low over last 3 sessions. This may reflect difficulty, disengagement, or external factors." The AI should use this signal to be sensitive and supportive — asking how the student is doing, offering encouragement. Infrastructure should NEVER interpret frustration as grounds for reducing support or simplifying content without AI judgment.

### 6. Privacy Implications

Behavioral signals are inferred from interaction patterns. They are weaker evidence than direct assessment. They must be clearly labeled as inferred signals with confidence levels. The AI must be informed that these are signals, not facts.

The self-efficacy signal is particularly sensitive — it reflects the student's emotional state. It should be stored briefly (as a session signal) and should not accumulate into a persistent "emotional profile." Long-term emotional state profiles are inappropriate for minors.

**Classification: SHOULD HAVE SOON for core signals (hint dependency, session engagement). FUTURE for cross-session behavioral analytics. DO NOT BUILD YET for emotional state profiling.**

---

## STAGE 32 — FORMATIVE ASSESSMENT ARCHITECTURE

### 1. Purpose

Establish the framework for treating WaxPrep's conversational exchanges as continuous formative assessment — extracting structured learning evidence from what already happens in tutoring, rather than inserting artificial test moments.

### 2. The Critical Misunderstanding to Avoid

The original brief implies that Stage 32 builds "an assessment module" — something separate from tutoring. This is conceptually wrong and educationally counterproductive.

Black & Wiliam (1998) established that formative assessment is most effective when it is integrated into instruction, not segregated from it. An AI tutor that stops and says "now it is time for an assessment" creates artificial breaks in the learning flow. Instead, every tutoring interaction IS a form of assessment. The AI naturally asks questions, evaluates responses, and calibrates its instruction. Stage 32's job is to make this implicit assessment explicit and recorded.

**The Correct Understanding:** Stage 32 is not "add an assessment module." It is "ensure that the AI's natural tutoring interactions produce structured evidence that is captured by the evidence pipeline."

### 3. Assessment Evidence Quality Hierarchy

Different types of interactions produce different quality of evidence:

**Tier 1 (Highest Quality):** The AI explicitly asks the student to solve a problem or answer a question. The student responds. The AI evaluates. This is the cleanest evidence — the question's relevance to the concept is clear, the expected response is defined, and the evaluation is directed.

**Tier 2 (High Quality):** The AI asks the student to explain something in their own words. Self-explanation is one of the most reliable indicators of genuine understanding (Chi et al., 1989).

**Tier 3 (Moderate Quality):** The AI corrects the student and the student demonstrates understanding of the correction.

**Tier 4 (Lower Quality):** The AI observes an error the student made spontaneously. The error is evidence of a gap but the concept relevance may be ambiguous.

**Tier 5 (Lowest Quality):** The student mentions a concept without being assessed on it.

### 4. Assessment Without Assessment Anxiety

A secondary consideration: Nigerian secondary students are under significant exam pressure (WAEC, JAMB, NECO). Assessment-like interactions that feel like tests may increase anxiety. WaxPrep's conversational approach naturally reduces this — the AI asks questions conversationally, not in formal test format. The infrastructure should never create interactions that feel like formal assessment unless the student explicitly wants exam practice.

**The AI decides when to probe understanding. Infrastructure never triggers assessment moments.**

### 5. Technical Architecture

Stage 32's primary contribution is in the evidence type taxonomy (defined in Stage 28), the evidence quality weight table (used in the RWEA computation), and the system prompt guidance for evidence emission.

**One new component:** A question generation guidance section in the system prompt (Stage 17 extension) that encourages the AI to periodically ask clarifying or probing questions — not as formal tests, but as natural conversational checks. The frequency and style of these questions remain entirely within the AI's judgment.

### 6. What Stage 32 Does NOT Build

It does not build a question bank. It does not build an item selection algorithm. It does not build a mastery masking threshold. It does not build an adaptive testing module. These are either inappropriate (hardcoded logic) or premature (require large amounts of calibration data that WaxPrep won't have at launch).

**Classification: MUST HAVE conceptually (understanding what assessment means in WaxPrep's context). The technical implementation is mostly Stage 28's evidence taxonomy. No major new code required specifically for Stage 32.**

---

## STAGE 33 — STUDENT MODEL VERSIONING AND INTEGRITY

### 1. Purpose

Ensure the student model remains accurate, auditable, and recoverable under all failure conditions — including AI evaluation errors, duplicate events, out-of-order arrivals, and student data deletion requests.

### 2. Technical Architecture

**Model versioning:** Each knowledge state record has a `state_version` integer. Every recomputation increments the version. This provides a lightweight optimistic concurrency control mechanism: if two processes try to update the same knowledge state simultaneously, the one with the stale version loses and must retry.

**Observation integrity:** The observation table is append-only. Each observation has a UUID that is the idempotency key. If the same message_id arrives twice (WhatsApp webhook retry), the second write produces an idempotency conflict. The constraint: `UNIQUE(wax_id, message_id, concept_tag, evidence_type)` prevents double-counting.

**Recomputation audit:** Every recomputation of a knowledge state records: which observations were included, which configuration parameters were used, and the timestamp. This enables reproducibility — given the same inputs, the same output must be produced.

**Cross-session consistency:** A student's knowledge state for a concept should be monotonically non-decreasing except for: explicit observation deletion (privacy request), time decay, or new contradicting evidence (lower correctness observations). If knowledge state unexpectedly drops without these causes, it is a bug. A consistency check job detects this.

### 3. Handling AI Evaluation Errors

The AI evaluates student responses to produce correctness scores. AI evaluations are probabilistic and sometimes wrong. A student who correctly explained Newton's Second Law might receive a low correctness score because the AI misunderstood the response.

**The correct response: do not build an automated correction mechanism.** The AI's tutor function provides natural error correction — if the AI gives the wrong feedback, the student will push back and the conversation will correct it. The infrastructure faithfully records the AI's evaluation, including wrong ones. The `extraction_confidence` field captures uncertainty.

**Future provision:** A human review queue for low-confidence evaluations where the mastery impact was large. This is a FUTURE stage — not now.

**Practical mitigation at Stage 33:** Any observation with `extraction_confidence < 0.50` contributes to mastery computation with a weight proportional to its confidence. A very uncertain evaluation barely moves the mastery estimate. This naturally limits the damage from wrong AI evaluations.

### 4. Student Data Deletion Protocol

When a student or guardian exercises NDPA deletion rights:

1. Mark all `learning_observations` as soft-deleted (`deleted_at = NOW()`).
2. Mark all `misconceptions` as soft-deleted.
3. Delete (or soft-delete) all `learning_signals`.
4. Recompute all `knowledge_states` from the now-empty observation set (they all reset to defaults).
5. Mark the student model snapshot as stale and regenerate it (the new snapshot reflects zero knowledge state data).
6. Record the deletion event in the `compliance_deletions` table (audit trail).

**The deletion must be complete within 72 hours** of the request to comply with reasonable NDPA interpretation. The background job processes the deletion and sends a confirmation when complete.

### 5. Model Version Changes

When the RWEA algorithm parameters change (SENSITIVITY, DECAY_LAMBDA, RECENCY_HALFLIFE), existing knowledge states become inconsistent with the new computation. Resolution options:

**Option A:** Flag all states as stale and recompute lazily (on next access). This is the simplest approach and is correct for small parameter changes.

**Option B:** Run a migration that recomputes all states with the new parameters. For large parameter changes, this is necessary for consistency.

**Option C:** Store the algorithm version alongside each knowledge state. Support both old and new computation for a transition period. This is over-engineering for Stage 33.

**RECOMMENDATION: Option A for Stage 33. Document when major parameter changes require Option B.**

**Classification: MUST HAVE for integrity basics (idempotency, version tracking). SHOULD HAVE SOON for full deletion protocol and recomputation audit.**

---

## STAGE 34 — STUDENT MODEL TO AI INTERFACE

### 1. Purpose

Design and implement the interface that translates the student model (structured data in PostgreSQL) into readable, interpretable, token-budget-aware context that the AI receives before each tutoring turn.

### 2. Why This Is the Most Important Stage

The student model is useless if the AI cannot read it. The context interface is the moment when engineering meets pedagogy — the moment where years of designed infrastructure becomes something an AI can actually use to teach better.

This stage has two sub-tasks: first, specify what the interface should look like (this should be done before any other stage to guide what is built); second, implement it (this is the final integration).

### 3. The Context Interface Design Principles

**Principle 1: Evidence, not decisions.** The context must communicate raw evidence and statistics, not recommendations. "mastery_estimate: 0.63, trend: declining" is correct. "Student needs remediation" is wrong infrastructure.

**Principle 2: Uncertainty is information.** When evidence is sparse or confidence is low, the context must communicate this explicitly. "3 observations (2 correct), confidence: low" is more useful than "mastery: 0.67" without context.

**Principle 3: Recency is information.** The age of evidence matters enormously given forgetting curves. "Last evidence: 47 days ago" changes the meaning of "mastery: 0.80" significantly.

**Principle 4: Token budgeted.** The student model context must respect the token budget slot established in Stage 25. Default slot: 500 tokens. This is enough for meaningful information about 5–8 concepts with misconceptions and signals.

**Principle 5: Prioritized.** Not all concepts should be presented. Only concepts with evidence above a minimum threshold. Only the most recently active concepts. Active misconceptions always shown.

### 4. The Complete Context Format

```
[Student Learning Model — use as evidence for teaching, not as prescriptions]

Concept Knowledge (based on {N} observations over {period}):
• newton_second_law: mastery 0.71 | improving | 8 observations | 2 days ago | hint dependency: low
• quadratic_equations: mastery 0.52 | declining | 5 observations | 12 days ago | hint dependency: moderate
• chemical_balancing: mastery 0.30 | insufficient data | 2 observations | 3 days ago
• photosynthesis: mastery 0.83 | stable | 14 observations | 3 weeks ago [stale — decay applied]

Active Misconceptions:
• newton_second_law: [CONFIRMED — 4 sessions] "Student believes F=ma means force IS 
  the product, not that it EQUALS the product. Consistently omits identifying direction."
• quadratic_equations: [SUSPECTED — 2 sessions] "Possible confusion about discriminant 
  interpretation — conflates sign with solution count."

Session Behavioral Signals:
• Current session: 6 interactions, 2 hint requests, engagement: active
• Cross-session hint dependency: stable-low (good sign)

Evidence Quality Note:
• Most knowledge estimates based on 2–8 observations. Treat as preliminary signals.
  Do not treat mastery estimates as definitive. Use your judgment.
```

This format is:
- Unambiguous about what the numbers mean.
- Honest about uncertainty.
- Clear that these are signals for AI reasoning, not instructions.
- Token-efficient (approximately 200 tokens for this example).
- Prioritized (most relevant concepts surfaced).

### 5. Concept Selection Algorithm

Which concepts appear in the context:

Priority 1: All concepts with active misconceptions (regardless of recency).
Priority 2: Concepts that appeared in the most recent session.
Priority 3: Concepts with highest evidence count (most studied).
Priority 4: Concepts with most recent evidence (active engagement).

Token budget enforcement: include concepts in priority order until the token budget is filled. Never exceed the budget by adding a concept that doesn't fit.

**Important:** Do not include concepts with zero observations for this student. Absence of evidence should not clutter the context. The AI can request information about any concept by asking "does this student have any evidence for concept X?" through a future tool call — not by having all concepts listed.

### 6. The Snapshot System

Because computing the full student model context from scratch on every AI request would be expensive (reading and aggregating all observations, misconceptions, and signals), a snapshot system pre-computes and caches the context.

The snapshot is regenerated:
- At session end (background job) — so the next session starts with an up-to-date snapshot.
- When new observations arrive that significantly change a concept's mastery estimate (change > 0.10).
- On demand, if the snapshot is older than `STUDENT_MODEL_SNAPSHOT_MAX_AGE_HOURS` (configurable, default: 6 hours).

The snapshot is a pre-formatted string stored in `student_model_snapshots.snapshot_text` plus the structured `snapshot_json` for programmatic access. The context assembly system reads the snapshot and injects it into the AI request's memory slot.

### 7. The get_student_model API

The primary programmatic interface to the student model:

```
get_student_model(waxId, options?):
  options: {
    conceptTags?: string[]    // Only these concepts (for targeted queries)
    tokenBudget?: number      // Max tokens to use (default: STUDENT_MODEL_TOKEN_BUDGET)
    includeMisconceptions?: boolean  // Default: true
    includeSignals?: boolean  // Default: true
    freshness?: 'cached' | 'fresh'  // Default: 'cached' (use snapshot if available)
  }
→ StudentModelContext {
    formattedText: string      // Ready for AI context injection
    conceptStates: KnowledgeState[]
    activeMisconceptions: Misconception[]
    signals: LearningSignal[]
    metadata: {
      totalTokensEstimated: number
      conceptsIncluded: number
      conceptsOmitted: number  // How many were left out due to token budget
      snapshotAge: string      // "2 hours ago" or "fresh"
      evidenceQualityNote: string
    }
  }
```

### 8. Dependencies

Depends on all preceding stages: 27 (schema), 28 (evidence), 29 (mastery computation), 30 (misconceptions), 31 (signals), 33 (integrity). This stage is the integration point.

### 9. Cold Start — The New Student Problem

A new student (zero observations) produces an empty student model. The context injection must handle this gracefully: inject nothing in the student model slot (do not inject "mastery unknown for all concepts" — that wastes tokens with no information). The AI already knows how to handle a new student through its system prompt.

After the first session, the snapshot is generated with the first observations. From the second session onwards, the AI sees the student model.

### 10. Completion Criteria

`get_student_model()` returns formatted context within 20ms (using cached snapshot). Snapshot generation job runs correctly at session end. Context includes evidence quality notes and uncertainty markers. Token budget respected. Cross-student isolation verified. Active misconceptions always included when present. Cold-start (new student) handled gracefully without errors.

**Classification: The specification (what the interface should look like) is MUST HAVE NOW. The implementation is the final integration task.**

---

# PART SEVEN: THE AI vs DETERMINISTIC RESPONSIBILITY MATRIX

## 6. Complete Responsibility Matrix

| Task | Infrastructure | AI | Hybrid |
|---|---|---|---|
| Recording an observation | ✓ | | |
| Assigning a timestamp | ✓ | | |
| WaxID isolation enforcement | ✓ | | |
| Evidence format validation | ✓ | | |
| RWEA mastery computation | ✓ | | |
| Temporal decay application | ✓ | | |
| Evidence deduplication | ✓ | | |
| Concept registry lookup | ✓ | | |
| Snapshot generation trigger | ✓ | | |
| Token budget enforcement | ✓ | | |
| Database transaction management | ✓ | | |
| Deletion authorization | ✓ | | |
| Audit trail maintenance | ✓ | | |
| Evaluating student response correctness | | | ✓ |
| Identifying concept relevance in turn | | | ✓ |
| Detecting possible misconceptions | | | ✓ |
| Computing extraction confidence | | | ✓ |
| Emitting evidence block | | ✓ | |
| Promoting suspected to confirmed misconception | | | ✓ |
| Deciding whether to explain or assess | | ✓ | |
| Deciding when to ask a probing question | | ✓ | |
| Deciding how to respond to a misconception | | ✓ | |
| Deciding whether to revisit a previous topic | | ✓ | |
| Deciding when a student has mastered a concept | | ✓ | |
| Calibrating instruction to mastery level | | ✓ | |
| Interpreting hint dependency signal | | ✓ | |
| Interpreting engagement signals | | ✓ | |
| Choosing examples based on student profile | | ✓ | |
| Deciding to give encouragement | | ✓ | |
| Detecting a student is struggling emotionally | | ✓ | |
| Choosing to revisit a resolved misconception | | ✓ | |

**Hybrid tasks explained:**

Evidence extraction (correctness, concept identification, misconception flagging) is hybrid because the AI produces the evaluation, but infrastructure validates, persists, and structures it. The AI is the intelligence; infrastructure is the recording and computation layer.

Misconception confirmation is hybrid because infrastructure counts the corroborating evidence across sessions and applies the threshold rule, but the initial identification of each misconception instance is AI-driven.

---

# PART EIGHT: THE EVENT/EVIDENCE MODEL

## 7. Why Not Full Event Sourcing

Full event sourcing — where every state change is represented as an immutable event and current state is derived by replaying events — would look like this:

```
StudentAnswerSubmitted → EvidenceExtracted → ConceptIdentified → 
MasteryComputed → MisconceptionFlagged → SnapshotUpdated
```

This approach provides complete auditability and the ability to replay history with different algorithms. However, it adds significant operational complexity: event store management, replay infrastructure, event schema versioning, eventual consistency management.

For WaxPrep at Stages 27–34, full event sourcing is over-engineering. The simpler append-only evidence model provides most of the benefits (auditability, recomputation from ground truth) with a fraction of the complexity.

**The adopted approach: append-only evidence log + derived materialized state.** Observations are immutable. States are always derivable from observations. This is the core event-sourcing insight applied minimally.

What this buys: if the RWEA algorithm changes, all knowledge states can be recomputed from the observation log. If an observation is found erroneous, soft-delete it and recompute. If a student requests deletion, soft-delete their observations and recompute. The audit trail is complete. The complexity is manageable.

---

# PART NINE: THE PRIVACY AND SECURITY MODEL

## 8. Complete Privacy Architecture

### 8.1 Data Classification

| Data Type | Privacy Level | Retention | Deletion |
|---|---|---|---|
| Learning observations | Sensitive educational data | 24 months active | Soft delete + recompute |
| Knowledge states | Derived sensitive | Derived from observations | Recompute from deleted observations |
| Misconceptions | Sensitive educational data | 24 months | Soft delete |
| Learning signals | Transient behavioral | 12 months | Delete |
| Concept registry | Non-personal | Permanent | Archive only |
| Student model snapshots | Derived, cached | 7 days (auto-expire) | Invalidate |

### 8.2 Separation of Concerns — Identity vs Learning Data

A critical privacy principle: identity data (WaxID, phone hash, profile facts from Stage 23) must never be JOINed with learning data (observations, misconceptions, knowledge states) in the same query for display to the AI unless the join is explicitly authorized for a specific purpose.

The AI context assembly pipeline receives two separate slots: the memory context (identity, profile, episodes) and the student model context (learning data). These are constructed from separate queries and injected separately. Never merge them at the database level.

### 8.3 The Separation of Behavioral Data from Personal Profiles

The NDPA and general privacy-by-design principles require that behavioral educational data be treated separately from personal identity data. WaxPrep's architecture supports this by design: the student model tables reference only WaxID (pseudonymous), never raw phone numbers or personal names. The learning model does not know the student's name, only their WaxID.

### 8.4 NDPA Compliance Checklist

- Lawful basis for processing learning data: legitimate interest (providing educational service); consent from student (and parent for minors).
- Data minimization: observations contain correctness metadata, not verbatim student responses.
- Purpose limitation: learning data used only for tutoring, never for marketing or institutional reporting without additional consent.
- Retention periods: defined and enforced by automatic deletion jobs.
- Right to access: `get_student_model()` with a student-facing report format can satisfy data subject access requests.
- Right to erasure: complete soft-delete protocol implemented (Stage 33).
- Automated decision-making: knowledge states inform AI reasoning, but no automated decision with legal or significant effect is made solely on this basis. The AI makes pedagogical decisions; infrastructure does not make decisions that affect the student's rights.

---

# PART TEN: FAILURE HANDLING

## 9. Complete Failure and Corruption Scenarios

### 9.1 AI Evaluation Is Wrong

Detection: low `extraction_confidence` on the observation. Student pushback in the conversation (the AI misunderstood, the student corrects it). Later correctly answered questions contradicting a previous incorrect assessment.

Response: Wrong evaluations are a normal part of the system. They do not corrupt the model catastrophically because the RWEA weights by confidence and accumulates many observations. A single wrong evaluation has minimal impact on a mastery estimate based on 10 observations. Log wrong evaluations (those with confidence < 0.50) for future quality review.

Recovery: If a systematic evaluation error is discovered (a prompt bug caused all evaluations in a period to score too low), identify the affected observations by their `evaluator_prompt_version`, soft-delete them, and recompute affected knowledge states.

### 9.2 Duplicate Events Arrive

Detection: Idempotency constraint `UNIQUE(wax_id, message_id, concept_tag, evidence_type)` triggers a conflict.

Response: Log the duplicate. Ignore the second write. Return the existing observation ID. Do not count the duplicate in evidence_count.

### 9.3 Messages Arrive Out of Order

Response: Evidence is processed in order of `observed_at` timestamp (using the WhatsApp message timestamp, not the processing timestamp). If an observation arrives late (network delay), it is inserted with its correct `observed_at` timestamp. The knowledge state recomputation processes all observations sorted by timestamp, so out-of-order arrivals are automatically handled correctly.

### 9.4 Database Write Fails

Response: The BullMQ job fails and is retried (Stage 5 infrastructure). The retry will attempt to write the observation again. The idempotency constraint ensures the second write does not duplicate the first if the first actually succeeded but the confirmation was lost (network failure after write but before response).

### 9.5 BKT/RWEA Calculation Fails

Response: Log the failure. The previous knowledge state remains unchanged. The observation is persisted regardless of computation failure — evidence is never lost due to computation errors. The computation is retried as a background job.

### 9.6 Evidence Is Malformed

Response: The evidence validator rejects the malformed observation before it reaches the database. Log the rejection. The tutoring continues uninterrupted. A malformed evidence record should be surfaced to the monitoring system for investigation.

### 9.7 Concept Tags Are Invalid

Response: If the concept tag is not in the registry, create a new registry entry automatically (`created_by = 'ai_extraction'`). Do not reject the observation. New concepts are expected and welcome. A concept registry review queue surfaces AI-created concepts for human curation.

### 9.8 AI Returns Contradictory Evidence

Response: Contradictory evidence (two observations in the same turn with different correctness scores for the same concept) is a data quality problem. The validator checks for this and rejects the duplicate. Only one observation per `(wax_id, message_id, concept_tag, evidence_type)` tuple is accepted.

### 9.9 Assessment Is Deleted

Response: Soft-delete the observation. Mark the associated knowledge state as stale. Queue a recomputation. The knowledge state adjusts automatically to reflect the removed evidence.

### 9.10 Student Requests Deletion

Response: Complete soft-delete protocol (Stage 33). Knowledge states recomputed from empty observation set. Snapshots invalidated. All within 72 hours.

### 9.11 Student Changes Identity/Account

Response: If a student's WaxID changes (phone number change), the new WaxID has zero learning history. The old WaxID's learning history remains but is no longer accessible through the new phone number. There is no automatic transfer of learning history between WaxIDs — this would require authentication that WaxPrep doesn't implement. This is a known limitation of a phone-number-based identity system.

### 9.12 Model Version Changes

Response: Described in Stage 33. Parameter changes trigger a background recomputation of all affected states.

---

# PART ELEVEN: THE TESTING STRATEGY

## 10. Complete Testing Specification

### 10.1 Unit Tests — Mathematical/Model Calculations

- RWEA computation: given a fixed set of observations, output is deterministic and equals hand-computed values.
- RWEA temporal decay: mastery estimate decreases as days_since_last_evidence increases. After 46 days (one half-life), mastery has decayed by approximately 50% toward baseline.
- RWEA with hint penalty: correct response with hint_level=2 contributes less than correct response with hint_level=0.
- RWEA with extraction confidence: low-confidence observation contributes less than high-confidence observation.
- RWEA trend detection: three improving observations followed by three declining observations produces `trend = 'declining'`.
- RWEA clamping: mastery never goes below 0.05 or above 0.95.
- RWEA with zero observations: returns default state without errors.
- Misconception confidence increase: additional corroborating observations increase misconception confidence.

### 10.2 Integration Tests — Evidence to State Updates

- Write observation → knowledge state is recomputed automatically.
- Write three observations for same concept → evidence_count is 3, not 1.
- Write observation → snapshot is marked stale.
- Delete observation → knowledge state recomputed without that observation.
- Write misconception-flagged observation × 2 → misconception record created at `status = 'suspected'`.
- Write misconception-flagged observation × 4 across 3 sessions → misconception promoted to `status = 'confirmed'`.

### 10.3 Property-Based Tests

- Probabilities remain in [0.05, 0.95] for any valid input.
- Evidence cannot belong to another student (WaxID isolation is absolute).
- Duplicate events do not double-count (idempotency).
- Soft-deleting all observations for a student produces default knowledge states.
- Knowledge states are always derivable (reproducible) from observations with the same algorithm parameters.

### 10.4 Regression Tests

- Existing student states must not change unexpectedly after a deployment. Run state consistency checks before and after each deployment: store checksums of all knowledge states before, verify checksums match after (unless a recomputation was intentional).

### 10.5 AI Evaluation Reliability Tests

- Sample 50 AI-generated correctness evaluations per quarter.
- Two human raters independently score the same student responses.
- Compute inter-rater reliability (Krippendorff's alpha). Target: >0.4.
- Compute AI-human agreement. Target: >85% within ±0.2 of human average.
- Alert if agreement drops below threshold (prompt regression may have occurred).

### 10.6 Data Quality Tests

- No knowledge state has `evidence_count = 0` with `mastery_estimate > 0.10`.
- No observation has `correctness < 0` or `correctness > 1`.
- No observation has a future `observed_at` timestamp.
- All observations reference a valid WaxID.
- All observations reference a valid `session_id`.

### 10.7 Security/Isolation Tests

- `StudentLearningAccess("student-A").getKnowledgeStates()` never returns data with `wax_id = "student-B"`.
- An observation write with `wax_id = "student-B"` attempted through a `StudentLearningAccess("student-A")` instance is rejected.
- Knowledge state query with no WaxID parameter fails (not returns all students' data).

### 10.8 Educational Validity Tests (FUTURE)

When sufficient data is available, verify that the RWEA mastery estimate correlates with actual student outcomes (performance on later questions, session performance trajectories, self-reported exam preparation confidence). This is a statistical analysis, not a unit test. It requires at least 100 students with meaningful history.

---

# PART TWELVE: OBSERVABILITY

## 11. Complete Monitoring Strategy

### 11.1 Engineering Observability (Operational Metrics)

Log these as Pino structured log entries:
- `evidence.written` — count per evidence_type
- `evidence.rejected` — count per rejection reason
- `evidence.duplicate` — count (idempotency conflicts)
- `knowledge_state.updated` — count per update trigger (inline vs session-end vs decay)
- `knowledge_state.computed_latency_ms` — time to compute one state
- `misconception.created` — count per status
- `misconception.promoted` — count (suspected → confirmed)
- `misconception.resolved` — count
- `snapshot.generated` — count
- `snapshot.cache_hit_rate` — what fraction of context assembly uses cached snapshot
- `student_model.query_latency_ms` — time to assemble student model context
- `student_model.tokens_estimated` — token budget usage

### 11.2 Data Quality Metrics

Weekly automated job computes and logs:
- `evidence.extraction_confidence_p25`, `p50`, `p75` — confidence distribution
- `evidence.average_per_student` — how many observations per student
- `knowledge_state.mastery_distribution` — histogram of mastery estimates across all active students
- `misconception.active_per_student` — average active misconceptions per student
- `knowledge_state.stale_rate` — what fraction of states haven't been updated in 30+ days

### 11.3 Educational Validity Metrics (Distinguish from Engineering)

These are NOT engineering metrics. They require educational analysis, not just dashboards:
- Do students with higher mastery estimates perform better in subsequent sessions?
- Does the RWEA's trend prediction correlate with actual performance change?
- Are misconception records accurate (do the described errors match what the AI reports when the student makes mistakes)?

These questions require human review and statistical analysis. They cannot be automated. They should be reviewed quarterly once sufficient data exists.

### 11.4 Alerting Thresholds

Alert at ERROR level:
- Evidence extraction failure rate > 10% in any hour.
- Knowledge state computation failure rate > 1% in any hour.
- Cross-student isolation violation detected (any occurrence).
- RWEA computation producing values outside [0.05, 0.95].

Alert at WARN level:
- Evidence extraction confidence p25 drops below 0.60 (prompt quality issue).
- Average evidence count per student < 2 after 3 sessions (evidence is not being collected).
- Snapshot cache hit rate < 70% (snapshot generation may be too slow).

---

# PART THIRTEEN: THE REVISED DATABASE MODEL — FINAL SPECIFICATION

## 12. Complete Migration Specification

**Migration 006_learning_intelligence_foundation.sql:**
Creates `concepts`, `learning_observations`, `knowledge_states`, `misconceptions`, `learning_signals`, `student_model_snapshots` tables with all specified indexes, constraints, and foreign keys.

**Migration 007_learning_signals_indexes.sql:**
Additional performance indexes added after load testing reveals query patterns.

**Migration 008_misconception_timeline.sql:**
Adds `confirmed_at` and `resolution_timeline` tracking to `misconceptions` table once the confirmation cycle is implemented.

**Rule: Never alter an existing migration file. Add new migrations for schema changes.**

---

# PART FOURTEEN: THE DEVELOPER-READY SPECIFICATION

## 13. Instructions for the Coding Agent

**READ THIS SECTION BEFORE WRITING ANY CODE.**

### 13.1 Repository Pre-Inspection Required

Before implementing any code in this specification:

1. Inspect the complete repository structure. Understand which directories exist, which modules are already implemented, and how the existing codebase is organized.
2. Read all project documentation including README, CONTRIBUTING, and any architecture documents.
3. Read all existing database migrations in order. Understand the current schema completely before writing any new migrations.
4. Identify the existing `StudentMemoryAccess` class (from Stage 22) and the `ContextAssembler` (from Stages 18/25). All new learning intelligence access must follow the same patterns.
5. Identify the existing BullMQ worker architecture (from Stage 6). The consolidation worker (from Stage 24) must be extended, not duplicated.
6. Identify the existing configuration system (from Stage 2). All new configuration parameters must be added to the existing Zod schema, not a new configuration system.
7. Do not create duplicate systems. Do not create a second database access layer. Do not create a second logger. Do not create a second queue.

### 13.2 What to Build

**Files/Modules Required:**

```
src/learning/
├── ConceptRegistry.js         — Concept lookup, creation, alias resolution
├── EvidenceExtractor.js       — Parses AI evidence blocks from tutor responses
├── EvidenceValidator.js       — Validates evidence format before writing
├── EvidenceWriter.js          — Writes validated observations to database
├── MasteryEngine.js           — RWEA computation function
├── MasteryUpdater.js          — Orchestrates observation write → state update
├── MisconceptionTracker.js    — Creates/updates/resolves misconception records
├── SignalCollector.js         — Writes behavioral signals
├── StudentModelAssembler.js   — Assembles AI context from knowledge states
├── StudentModelSnapshot.js    — Snapshot generation and caching
└── StudentLearningAccess.js   — Primary access class (requires waxId at construction)

infra/migrations/
├── 006_learning_intelligence_foundation.sql  — Complete schema as specified

src/workers/
└── consolidationWorker.js     — EXTEND (do not duplicate) to add:
    - Session-end evidence extraction job
    - Evidence decay recomputation job (weekly)
    - Misconception consolidation job

src/ai/context/
└── ContextAssembler.js        — EXTEND to add student model context slot
```

### 13.3 Database Structures Required

Apply migration `006_learning_intelligence_foundation.sql` which creates:
- `concepts` table with `canonical_tag` unique index
- `learning_observations` table with append-only behavior and all specified indexes
- `knowledge_states` table with `UNIQUE(wax_id, concept_tag)` constraint
- `misconceptions` table with lifecycle status tracking
- `learning_signals` table
- `student_model_snapshots` table

### 13.4 Configuration Parameters Required

Add to existing Zod configuration schema (inspect existing config/index.js):

```javascript
// Learning Intelligence Configuration
MASTERY_RECENCY_HALFLIFE_DAYS: z.coerce.number().min(7).max(180).default(30),
MASTERY_DECAY_LAMBDA: z.coerce.number().min(0.001).max(0.1).default(0.015),
MASTERY_HINT_PENALTY_COEFFICIENT: z.coerce.number().min(0).max(1).default(0.3),
MASTERY_SENSITIVITY: z.coerce.number().min(0.5).max(5).default(2.0),
MASTERY_BASELINE: z.coerce.number().min(0).max(0.3).default(0.10),
MISCONCEPTION_SUSPECTED_THRESHOLD: z.coerce.number().int().min(1).max(5).default(2),
MISCONCEPTION_CONFIRMED_THRESHOLD: z.coerce.number().int().min(2).max(10).default(4),
STUDENT_MODEL_TOKEN_BUDGET: z.coerce.number().int().min(100).max(1000).default(500),
STUDENT_MODEL_SNAPSHOT_MAX_AGE_HOURS: z.coerce.number().min(1).max(48).default(6),
STUDENT_MODEL_MIN_EVIDENCE_TO_INCLUDE: z.coerce.number().int().min(1).max(5).default(1),
EVIDENCE_MIN_EXTRACTION_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.50),
```

### 13.5 APIs Required

Primary access:
- `StudentLearningAccess(waxId)` — main access class, all learning intelligence reads and writes
- `get_student_model(waxId, options)` — AI context assembly (returns formatted text + structured data)
- `get_knowledge_state(waxId, conceptTag)` — single concept state
- `get_active_misconceptions(waxId)` — active misconception records
- `write_observation(observation)` — evidence write (called from evidence extraction pipeline)

### 13.6 Logic Required

- RWEA computation function (pure function, no database access, fully testable in isolation)
- Temporal decay function (pure function)
- Evidence block parser (parse AI-emitted JSON evidence from tutoring responses)
- Evidence validator (type checking, range checking, WaxID consistency)
- Concept registry lookup-or-create
- Misconception consolidation logic (pattern detection across session observations)
- Knowledge state snapshot generation
- AI context formatter (produces the formatted text shown in Section 4)

### 13.7 What Must NOT Be Built

Do not build:
- A mastery threshold that triggers any automatic pedagogical action.
- A hardcoded list of allowed concepts.
- A prerequisite enforcement system.
- A question bank or item database.
- An adaptive testing algorithm that selects questions.
- A DKT or other deep learning model.
- A separate analytics database.
- A full event sourcing system.
- Emotional state persistent profiling.
- Any rule that says "if mastery < X, do Y."

### 13.8 Tests That Must Pass Before Completion

The following tests must pass before Stage 27–34 is considered complete:

1. RWEA determinism test: Same inputs always produce same mastery output.
2. RWEA decay test: mastery_estimate decreases monotonically as days_since_last_evidence increases.
3. RWEA bounds test: Output always in [0.05, 0.95] for any input.
4. WaxID isolation test: Knowledge states from one student never appear in another student's query.
5. Evidence idempotency test: Writing the same observation twice produces one record, not two.
6. Observation immutability test: No UPDATE is allowed on `learning_observations` rows (only soft-delete).
7. Knowledge state derivability test: Deleting all observations and recomputing produces default state.
8. Student model context test: Formatted context is under STUDENT_MODEL_TOKEN_BUDGET tokens.
9. Cold start test: New student (zero observations) produces valid empty context without errors.
10. Misconception lifecycle test: Observation × 2 flagged → suspected; × 4 across 3 sessions → confirmed.
11. Deletion test: Soft-deleting all observations for a student and recomputing produces default knowledge states across all concepts.
12. Cross-student isolation security test: Accessing one student's learning data through another student's access class returns zero results.

### 13.9 Post-Implementation Audit Required

After implementation, the coding agent must:

1. Query: `SELECT COUNT(*) FROM learning_observations WHERE wax_id IS NULL` — must be 0.
2. Query: `SELECT COUNT(*) FROM knowledge_states WHERE mastery_estimate > 0.95 OR mastery_estimate < 0.05` — must be 0.
3. Run reconciliation: Recompute all knowledge states from observations and verify they match stored states.
4. Verify: The student model context for a test student with known observations matches hand-computed RWEA values.
5. Confirm: The context assembler includes the student model slot in AI requests and the token budget is respected.
6. Confirm: The consolidation worker has been extended with the new session-end evidence extraction job.
7. Confirm: All new configuration parameters appear in `.env.example` with default values and comments.

---

# PART FIFTEEN: RISKS AND UNRESOLVED QUESTIONS

## 14. Known Risks

**Risk 1: Evidence sparsity**
WaxPrep's conversational format does not produce structured item responses on every turn. Many turns will produce zero evidence observations (greetings, navigation, explanation-delivery turns without student response). With sparse evidence, mastery estimates will be based on very few observations for any given concept. The RWEA's explicit evidence_count field and the "treat as preliminary signals" language in the context format mitigate this — but the AI must be explicitly informed that low evidence_count means low reliability. RECOMMENDATION: In the context format, show confidence level (LOW/MEDIUM/HIGH) alongside mastery estimate, based on evidence_count thresholds (< 3 = LOW, 3–7 = MEDIUM, > 7 = HIGH).

**Risk 2: AI evaluation calibration**
The correctness scores assigned by the AI (0.0–1.0) may be systematically biased. If the tutoring AI tends to give high correctness scores to students who express themselves confidently but imprecisely, the mastery estimates will be inflated. Resolution requires the quarterly AI evaluation reliability review described in Section 10.5.

**Risk 3: Concept fragmentation**
The AI may refer to the same concept using different tags in different sessions: "newton_second_law" and "newtons_second_law" and "N2L" are all the same concept. Without disambiguation, the student model fragments. MITIGATION: The concept registry alias system is designed for this. The session-end consolidation AI should be explicitly prompted to check for alias matches before creating new concept registry entries.

**Risk 4: RWEA parameters require calibration**
The default parameters (SENSITIVITY=2.0, DECAY_LAMBDA=0.015, HINT_PENALTY_COEFFICIENT=0.3) are research-informed estimates but have not been calibrated against WaxPrep's specific student population. Different parameters may produce better-calibrated mastery estimates for Nigerian secondary students specifically. RECOMMENDATION: Log actual student performance on later questions alongside their mastery estimate at the time of the question. This enables retrospective calibration analysis after 3–6 months of production data.

**Risk 5: AI prompt leakage into evidence**
If the tutoring AI emits evidence blocks based on its general impressions rather than specific observations, the evidence will reflect the AI's prior beliefs rather than the student's actual demonstrated knowledge. This is a form of confirmation bias embedded in evidence collection. MITIGATION: The evidence emission prompt must explicitly require the AI to base evaluations on specific student statements or responses, not on general impressions.

## 15. Unresolved Questions

- What is the minimum observation count before the mastery estimate is reliable enough to include in AI context? (Research suggests 3–5. WaxPrep may need to tune this.)
- Should hint dependency be normalized across students (what is high for one student may be low for another) or reported as absolute? (Absolute is simpler; relative requires population data.)
- How frequently should the decay recomputation job run? (Daily is ideal for accuracy; weekly is sufficient for most use cases. Configurable.)
- What is the right misconception confirmation threshold for WaxPrep's specific student population? (2+2 = suspected+confirmed is conservative; 1+3 may be more appropriate for a conversational context with sparse data.)
- Should the student model context include concepts the student has NOT yet encountered? (Almost certainly not — absence of evidence is not informative for the AI. But the AI might benefit from knowing what concepts are commonly associated with the student's current topic. FUTURE question.)

---

# PART SIXTEEN: FINAL IMPLEMENTATION ORDER AND CLASSIFICATION

## 16. Definitive Implementation Sequence

```
STEP 1 (MUST HAVE NOW): Stage 34 specification
  — Write the AI context format specification
  — This defines what all subsequent stages are building toward
  — No code. Just a specification document and the API contract.

STEP 2 (MUST HAVE NOW): Stage 28 — Evidence Collection Pipeline
  — Evidence taxonomy definition
  — Evidence block format specification (AI emission format)
  — Evidence validator and writer
  — Concept registry with auto-creation
  — Evidence parser integrated into AI response processing
  
STEP 3 (MUST HAVE NOW): Stage 27 — Student Model Schema
  — Migration 006_learning_intelligence_foundation.sql
  — StudentLearningAccess class (basic read/write)
  — Configuration parameters added to Stage 2 schema
  
STEP 4 (MUST HAVE NOW): Stage 29 — Mastery Estimation
  — RWEA computation function (pure, fully tested)
  — MasteryUpdater (observation write → state update)
  — Background decay recomputation job (weekly)
  
STEP 5 (SHOULD HAVE SOON): Stage 30 — Misconception Detection
  — Inline misconception flagging (via evidence block)
  — Session-end consolidation for misconception pattern detection
  — Misconception lifecycle management
  
STEP 6 (SHOULD HAVE SOON): Stage 31 — Learning Signals
  — Hint dependency tracking
  — Session engagement signal
  — Cross-session behavioral signals (weekly consolidation)
  
STEP 7 (SHOULD HAVE SOON): Stage 32 — Formative Assessment Architecture
  — System prompt extension for natural probing questions
  — Evidence quality hierarchy implemented in RWEA weights
  — Assessment evidence classification in evidence taxonomy
  
STEP 8 (SHOULD HAVE SOON): Stage 33 — Integrity and Versioning
  — Knowledge state version tracking
  — Complete deletion protocol
  — Evidence idempotency enforcement
  — Recomputation audit logging
  
STEP 9 (MUST HAVE for launch): Stage 34 — Implementation
  — get_student_model() API
  — Snapshot generation and caching
  — ContextAssembler extended with student model slot
  — Complete integration with AI request pipeline
```

## 17. Complete Classification Table

| Feature | Classification |
|---|---|
| Concept registry (minimal: tag + name) | MUST HAVE NOW |
| Evidence taxonomy definition | MUST HAVE NOW |
| Learning observations table | MUST HAVE NOW |
| Knowledge states table | MUST HAVE NOW |
| RWEA computation function | MUST HAVE NOW |
| Evidence block parser | MUST HAVE NOW |
| StudentLearningAccess class | MUST HAVE NOW |
| Stage 34 context format specification | MUST HAVE NOW |
| Inline evidence extraction from AI responses | MUST HAVE NOW |
| Misconception flagging in evidence | MUST HAVE NOW |
| Session-end evidence extraction (background job) | SHOULD HAVE SOON |
| Misconception pattern detection and confirmation | SHOULD HAVE SOON |
| Learning signals (hint dependency, engagement) | SHOULD HAVE SOON |
| Temporal decay recomputation job | SHOULD HAVE SOON |
| Complete deletion protocol | SHOULD HAVE SOON |
| Student model snapshot system | SHOULD HAVE SOON |
| get_student_model() API full implementation | MUST HAVE for launch |
| Concept alias disambiguation system | SHOULD HAVE SOON |
| Evidence quality monitoring | SHOULD HAVE SOON |
| Knowledge state consistency checks | SHOULD HAVE SOON |
| Cross-session behavioral analytics | FUTURE |
| Concept relationship graph | FUTURE |
| IRT difficulty calibration | FUTURE |
| Evidence calibration analysis | FUTURE |
| Educational validity statistical analysis | FUTURE |
| Semantic concept similarity (embedding-based dedup) | FUTURE |
| Parent/teacher access to learning data | FUTURE |
| Item bank and adaptive testing | DO NOT BUILD YET |
| DKT or any deep learning KT model | DO NOT BUILD YET |
| Mastery threshold → automatic action rules | DO NOT BUILD YET |
| Hardcoded curriculum with prerequisite enforcement | DO NOT BUILD YET |
| Full event sourcing system | DO NOT BUILD YET |
| Emotional state persistent profiling | DO NOT BUILD YET |
| Population-level predictive analytics dashboard | DO NOT BUILD YET |

---

# COMPLETION CRITERIA — EVERY STAGE

**Stage 27 Complete:**
Migration 006 applied successfully. All six tables created. All indexes created. StudentLearningAccess reads and writes tested. WaxID isolation verified. Configuration parameters in Zod schema.

**Stage 28 Complete:**
Evidence taxonomy documented. Evidence block parser extracts all evidence types correctly. Evidence validator rejects malformed evidence without breaking tutoring. Concept registry auto-creation tested. Inline evidence extraction integrated into AI response processing pipeline. Idempotency test passing.

**Stage 29 Complete:**
RWEA function is pure and deterministic. All 8 RWEA unit tests pass. Decay behavior verified (half-life matches configuration). Mastery updates correctly after each observation write. Background decay job running weekly without errors.

**Stage 30 Complete:**
Misconception flagging in evidence blocks working. Session-end consolidation creates misconception records from flagged observations. Suspected → Confirmed promotion tested. Resolution detection working. Active misconceptions returnable via API.

**Stage 31 Complete:**
Hint dependency computed per session and per concept. Engagement signal computed at session end. Cross-session behavioral signals computed weekly. All signals stored in learning_signals with correct wax_id scoping.

**Stage 32 Complete:**
Evidence quality weight table implemented in RWEA. System prompt extended with natural probing question guidance. No new isolated "assessment module" — assessment is evidence extraction from tutoring.

**Stage 33 Complete:**
Knowledge state version tracking implemented. Idempotency constraint on observations enforced. Complete deletion protocol implemented and tested. Recomputation audit records created on every computation. All 12 specified tests pass.

**Stage 34 Complete:**
get_student_model() returns formatted context under token budget. Snapshot generation and caching working. Context assembler includes student model slot in AI requests. Cold start (zero observations) handled gracefully. Active misconceptions always included. Student model context visible in AI request logs. Educational context received by AI during tutoring is verified as meaningful and complete.

---

*This specification is the complete technical and educational foundation for WaxPrep's Learning Intelligence Infrastructure. Every architectural decision is grounded in peer-reviewed educational research or established production engineering practice. The specification is ready for implementation by a senior developer or capable AI coding agent following the repository pre-inspection instructions in Section 13.1.*