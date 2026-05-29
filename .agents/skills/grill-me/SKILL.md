---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

If a question can be answered by exploring the codebase, explore the codebase instead.

Before asking a question whose answer depends on code, read the relevant files first. Never ask about code behavior, call sites, or dependencies that can be verified by reading the code directly. Include code evidence in the question context so the user can see what you're basing the question on.
