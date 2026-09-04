
---

# 2. `WAXPREP_PHILOSOPHY.md`

```md
# WAXPREP PHILOSOPHY
## Newborn AI — The Founding Architecture of WaxPrep

**Status:** FOUNDATIONAL  
**Authority:** Founder-controlled  
**Change policy:** This document must not be changed by a coding agent's own judgment. Changes require explicit founder authorization.

---

# 1. WHAT WAXPREP IS

WaxPrep is an AI tutor delivered primarily through WhatsApp.

It is intended to help Nigerian secondary-school students learn through natural conversation.

WaxPrep may eventually support students preparing for examinations such as:

- WAEC;
- NECO;
- JAMB;
- BECE;
- and other relevant educational goals.

However, WaxPrep is NOT fundamentally a curriculum database with an AI chatbot attached.

It is an AI tutor with infrastructure built around it.

That distinction is the foundation of the entire system.

---

# 2. THE CENTRAL PRINCIPLE

## The AI is the intelligence.

## The software is the infrastructure.

The software exists to make the AI:

- capable;
- informed;
- contextual;
- persistent;
- evidence-aware;
- tool-capable;
- safe;
- reliable;
- measurable;
- and useful.

The software should not unnecessarily replace the AI's judgment.

---

# 3. WHAT THE INFRASTRUCTURE DOES

WaxPrep's infrastructure may provide:

- communication;
- identity;
- authentication;
- authorization;
- student isolation;
- persistence;
- context;
- memory;
- retrieval;
- evidence;
- knowledge-state estimation;
- assessment verification;
- misconception representation;
- tools;
- web access;
- embeddings;
- queues;
- workers;
- retries;
- validation;
- safety mechanisms;
- privacy mechanisms;
- observability;
- configuration;
- deployment;
- testing.

These are capabilities.

They are not the tutor itself.

---

# 4. WHAT THE AI DOES

The AI should retain educational judgment.

The AI may determine:

- what the student needs right now;
- what topic is relevant;
- whether to answer directly;
- whether to ask a question;
- whether to give a hint;
- whether to explain;
- whether to provide an example;
- whether to provide a worked solution;
- whether to ask the student to attempt a problem;
- whether to revisit an earlier concept;
- whether to move forward;
- whether the student appears confused;
- how much scaffolding is appropriate;
- whether to reduce scaffolding;
- whether retrieval practice would help;
- whether another explanation is needed;
- how to adapt to the student's demonstrated understanding;
- how to communicate naturally.

The infrastructure should make the relevant evidence available.

The AI makes the judgment.

---

# 5. THE ONE-SENTENCE TEST

Every significant piece of WaxPrep code should be testable against this question:

> Does this code decide WHAT educational judgment is correct, or does it determine HOW information is stored, validated, retrieved, measured, protected, communicated, or exposed?

If it decides:

```text
HOW information/capabilities are handled  it is generally infrastructure.
If it decides:
WHAT educational action is correct
it risks violating the Newborn AI architecture.
6. WHY "NEWBORN AI"
The AI should not be born knowing WaxPrep's entire educational worldview as a giant collection of hardcoded lesson scripts.
Instead, the system gives the AI:
context;
evidence;
tools;
memory;
identity;
knowledge-state information;
retrieval;
conversation history;
verified information;
structured capabilities.
The AI then reasons over those resources.
This creates a system where the tutor can adapt rather than simply execute a predetermined tutoring program.
7. WHAT NEWBORN AI DOES NOT MEAN
Newborn AI does NOT mean:
no structure;
no architecture;
no validation;
no safety;
no databases;
no memory;
no learning science;
no constraints;
no evaluation;
no deterministic infrastructure.
It means the deterministic parts of the system should provide capabilities and boundaries without unnecessarily replacing the AI's educational reasoning.
8. WHAT MUST NOT BECOME HARD-CODED
WaxPrep must not hardcode:
curriculum;
lesson plans;
fixed lesson sequences;
fixed learning paths;
fixed explanations;
fixed educational answers;
rigid tutoring scripts;
predetermined pedagogical decisions;
fixed intervention strategies;
fixed teaching styles;
fixed learning styles;
mandatory tutoring methods;
rigid onboarding questions;
"if X then teach Y" educational trees;
arbitrary mastery-based lesson switching;
predetermined conversational personalities.
For example:
Not acceptable
IF mastery < 0.60
THEN teach Topic B.
Better architecture
Knowledge-state system
        ↓
Evidence
        ↓
AI context
        ↓
AI reasoning
        ↓
AI chooses educational action
The second architecture preserves the AI as the tutor.
9. ONBOARDING
Onboarding is also part of the tutor's natural conversation.
WaxPrep should not become:
1. Ask name.
2. Ask age.
3. Ask class.
4. Ask exam.
5. Ask subject.
6. Start tutoring.
That is a workflow.
WaxPrep should instead provide the AI with:
identity;
profile state;
known information;
missing useful information;
tools for recording relevant facts.
The AI decides what information is worth obtaining and when.
Infrastructure supports the conversation.
It does not script it.
10. LEARNING SCIENCE
WaxPrep may use learning-science research to design better infrastructure.
Relevant concepts may include:
retrieval practice;
spaced practice;
worked examples;
scaffolding;
mastery learning;
formative assessment;
knowledge tracing;
misconception detection;
feedback;
practice;
fading of support.
However, research findings must not automatically become rigid rules.
For example:
Learning science may establish that retrieval practice can be useful.
That does NOT mean:
Every student must receive retrieval practice every 3 messages.
Instead:
The system may expose evidence and tools that allow the AI
to reason about whether retrieval practice is appropriate.
11. BKT AND KNOWLEDGE STATE
Knowledge tracing is infrastructure for estimating what the system currently believes about a student's knowledge.
Bayesian Knowledge Tracing or another validated approach may calculate:
estimated mastery;
learning probability;
forgetting;
guess;
slip;
evidence history.
The calculation is deterministic infrastructure.
The interpretation and pedagogical response remain available to the AI.
The system should not automatically transform a mathematical estimate into a rigid lesson decision.
12. MEMORY
Memory exists to make the tutor more useful over time.
Memory should not mean storing everything.
The system may maintain different categories such as:
working context;
episodic memories;
durable profile facts;
student model;
knowledge state;
evidence;
summaries;
retrieved knowledge.
Each category must have a clear purpose.
Memory should help the AI understand the student.
Memory must not become uncontrolled surveillance or indiscriminate transcript storage.13. EVIDENCE OVER ASSUMPTION
WaxPrep should prefer evidence over unsupported assumptions.
Evidence may include:
demonstrated answers;
assessment results;
conversation observations;
verified profile information;
retrieved information;
tool results;
knowledge-state observations;
explicit student statements.
The system should preserve provenance and confidence where useful.
The goal is not to make the AI mechanically follow the evidence.
The goal is to give the AI better evidence from which to reason.
14. CONFIGURATION OVER CODE
WaxPrep follows a configuration-driven architecture.
Values that are operationally changeable should generally be externalized rather than embedded throughout source code.
The project should maintain a centralized runtime configuration registry.
The expected flow is:
Railway Environment Variables
            ↓
Configuration Registry
            ↓
Validation
            ↓
Runtime Configuration
            ↓
Application
Configuration may include:
providers;
models;
timeouts;
retries;
queue settings;
debounce windows;
rate limits;
feature flags;
operational thresholds;
external service configuration;
environment-specific behavior.
Secrets must never be committed to Git.
Configuration does not mean that fundamental architectural principles belong in environment variables.
Permanent design principles belong in documentation and code architecture.
Operationally changeable values belong in configuration.
15. WHATSAPP-FIRST
WhatsApp is the initial student-facing interface.
The architecture should therefore optimize for conversational interaction rather than assuming a web dashboard.
The student's experience should be simple:
Student sends message
        ↓
WaxPrep receives message
        ↓
Identity is resolved
        ↓
Context is assembled
        ↓
AI reasons
        ↓
AI may use tools
        ↓
Response is validated
        ↓
Response is delivered
        ↓
Student continues conversation
The infrastructure must handle WhatsApp realities such as:
message ordering;
retries;
duplicate webhooks;
rapid multi-message bursts;
delivery failures;
response limits;
chunking;
typing indicators where supported.
16. THE CORE PRODUCT LOOP
Before advanced systems exist, WaxPrep must be able to complete the simplest useful loop:
Student
  ↓
WhatsApp
  ↓
Webhook
  ↓
Backend
  ↓
Identity
  ↓
Conversation Context
  ↓
AI
  ↓
Response
  ↓
WhatsApp
  ↓
Student
This loop is more important than advanced dashboards, payment systems, analytics, or commercialization.
17. SECURITY IS PART OF THE ARCHITECTURE
Security is not something added after the tutor is finished.
The system must be designed around:
student isolation;
least privilege;
authentication;
authorization;
secret management;
input validation;
webhook verification;
replay protection;
rate limiting;
safe tool access;
data minimization;
controlled provider access.
18. SAFETY EXCEPTION
There is one important exception to the general anti-hardcoding principle.
WaxPrep may use deterministic, human-reviewed safety mechanisms for situations such as:
self-harm;
abuse;
immediate danger.
These mechanisms exist for duty of care.
They are not intended to control ordinary tutoring.
The safety system may:
Detect serious safety signal
        ↓
Activate safety handling
        ↓
Provide approved safety response
        ↓
Log appropriate event
        ↓
Escalate where appropriate
This exception must remain narrow.
It must never become an excuse for hardcoding ordinary educational behavior.
19. PRIVACY BY DESIGN
WaxPrep should collect the minimum information necessary to operate effectively.
The system should not treat every piece of conversation as permanent memory.
Information should have:
a purpose;
a retention rationale;
an ownership boundary;
an appropriate lifecycle.
The system must never allow one student's information to leak into another student's context.
20. NO PREMATURE BUSINESS COMPLEXITY
WaxPrep is currently focused on building the tutor.
Therefore the architecture intentionally does NOT prioritize:
dashboards;
student analytics interfaces;
student data export interfaces;
payment systems;
subscriptions;
billing;
revenue systems;
cost-observation dashboards;
commercial analytics;
large administrative portals.
These may eventually become necessary.
They are not the foundation.
The tutoring engine comes first.
21. WHAT SUCCESS LOOKS LIKE
Success is not:
"We have many features."
Success is:
"A student can have a natural, useful, safe, context-aware tutoring conversation with WaxPrep, and the system can progressively become better at understanding that student without replacing the AI's judgment with hardcoded rules."
22. THE FOUNDING RULE
When architecture becomes complicated, return to the central question:
Are we building infrastructure around an AI tutor, or are we secretly building a deterministic tutoring program with an AI inside it?
WaxPrep must remain the former.
23. FINAL PRINCIPLE
WaxPrep is built around a simple relationship:
Infrastructure gives the AI:
    identity
    memory
    context
    evidence
    retrieval
    tools
    verification
    safety
    persistence
    communication
    measurement

The AI provides:
    reasoning
    judgment
    teaching
    adaptation
    conversation
    pedagogy
The architecture should make the AI more capable without unnecessarily making the AI less free to reason.
Newborn AI
Give the AI the capabilities, evidence, context, and boundaries it needs.
Do not replace its educational judgment with a pile of predetermined rules.