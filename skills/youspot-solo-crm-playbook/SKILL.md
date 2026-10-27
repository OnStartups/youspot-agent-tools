---
name: youspot-solo-crm-playbook
description: "Run a personal CRM for a solo consultant, founder, or creator with YouSpot. Use for relationship reviews, meeting briefs, warm introductions, interaction notes, and dated follow-ups grounded in connected or imported data."
license: MIT
metadata:
  author: YouSpot, Inc.
  homepage: https://youspot.com/docs
  repository: https://github.com/OnStartups/youspot-agent-tools
  version: "1.2.0"
---

# The solo CRM playbook

Help one person keep track of relationships, conversations, and promised next steps. Ground recommendations in their connected or imported YouSpot data. Do not invent relationship strength, correspondence, or commitments.

## Start with the member's question

Ask which outcome they want if it is unclear: a daily review, a meeting brief, a warm introduction, or a follow-up after a conversation. Use the `youspot-mcp` skill for connection and authentication. Discover the current session's tools and schemas before executing this workflow.

## Daily relationship review

1. Start with `what_needs_attention`. Respect the response's readiness and evidence rather than presenting an incomplete sync as a complete review.
2. For a named person or company, use `search_graph_objects` and `get_graph_object`. Use `search_connections` for imported LinkedIn contacts. Distinguish missing imports from an empty search.
3. Propose a short list of next actions. For each, include the person, supporting source, reason to act, and a proposed date. Mark suggestions as suggestions, not promises the member already made.

## Before a meeting

Read the relevant calendar event if Calendar is connected. Resolve the attendee to an existing CRM record, asking when names are ambiguous. Summarize the last known interaction, relevant notes, and open next steps with source links or IDs. Say which sources were unavailable rather than filling in history.

## After a conversation

1. Resolve the person's existing object ID before creating any new record.
2. Confirm the interaction summary, channel, direction, and occurrence time before `record_interaction`.
3. If a next step was agreed, confirm the action and date before `set_follow_up`. Resolve relative dates in the member's timezone and supply the required ISO 8601 value.
4. Report the records actually saved. If a call fails, say what remains unsaved; do not claim the whole workflow succeeded.

A dated follow-up does not itself send a message. Drafting and sending require separate tool actions and approval. When reviewing due follow-ups, follow the live tool schema's retrieval guidance; do not invent a dedicated due-date query tool.

## Boundaries

Connected integrations and imports determine what is available. The graph does not establish that every mailbox, calendar, or network has been loaded. Cite evidence for a proposed introduction and never promise that someone will introduce the member. Ask before creating duplicates, merging people, deleting records, or sending messages. Tool execution may use the member's credits.

## References

- Product docs: https://youspot.com/docs
- MCP setup: https://youspot.com/docs/mcp.md
- Public skill source: https://github.com/OnStartups/youspot-agent-tools
