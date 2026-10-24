Connect the website's bot conversations to our internal system (Algo Quant ERP).

GOAL
Our staff system must see, live, every visitor who talks to any bot on this site: the workshop advisor chat (/api/chat/workshop), the course-proposal chat (/api/chat/proposal) and the elevator (/elevator: the 6 qualification questions, "اسأل أي سؤال" free-text chat, and the handoff form). The ERP pulls a feed from this site every 10 seconds, and optionally receives a push. Do NOT change any visible UI, bot prompt, wording or behaviour for visitors. Recording must never break or slow a chat: wrap every new call in try/catch and only log errors.

1) SECRET
Add a secret named ERP_SYNC_TOKEN (I will paste its value). It authenticates the ERP in both directions.

2) NEW TABLE public.site_conversations (migration)
One row per visitor session per bot.
  id uuid primary key default gen_random_uuid()
  session_id text not null
  channel text not null check (channel in ('workshop','proposal','elevator'))
  lang text not null default 'ar'
  page text
  status text not null default 'active' check (status in ('active','completed'))
  messages jsonb not null default '[]'    -- [{ "role": "user"|"assistant", "content": text, "at": ISO timestamp }]
  visitor_name text, visitor_contact text, contact_method text, visitor_note text
  answers jsonb                           -- elevator answers, see step 4
  recommended_floor int, secondary_floor int, recommendation_title text, recommendation_reason text
  lead_table text                         -- 'workshop_leads' | 'course_proposals' | 'leads'
  lead_id uuid
  started_at timestamptz not null default now()
  last_activity_at timestamptz not null default now()
  updated_at timestamptz not null default now()
  unique (session_id, channel)
Index on (updated_at, id). A BEFORE UPDATE trigger sets updated_at = clock_timestamp() on every update.
Enable RLS. No anon/authenticated insert, update or select policies (only the server writes, with supabaseAdmin). Admin read policy with has_role(auth.uid(),'admin') like the other tables.

3) SERVER HELPER src/lib/site-conversations.server.ts
recordSiteConversation({ sessionId, channel, lang?, page?, messages?, visitor?: { name?, contact?, contactMethod?, note? }, answers?, recommendation?: { floor?, secondaryFloor?, title?, reason? }, lead?: { table, id }, status? })
- Reads the existing row for (session_id, channel) with supabaseAdmin, merges, then upserts on (session_id, channel).
- messages, when given, is the FULL transcript so far and replaces the stored one. Give each message an "at": keep the stored "at" of a message at the same index with the same role and content, otherwise use the current time. Keep at most the last 200 messages, each content cut to 4000 characters.
- Visitor fields, answers, recommendation and lead are only overwritten with non-empty values (never clear what we already have). answers are merged key by key.
- status 'completed' is sticky (never goes back to 'active').
- Always set last_activity_at = now().
- If no lead is given, look up workshop_leads (channel workshop) or course_proposals (channel proposal) by session_id and, if a row exists, set lead_table/lead_id to it.
- After saving, call pushToErp(row) (step 6).
- The whole function catches and logs its own errors and never throws.

4) HOOK IT IN (no visible changes)
a. src/routes/api/chat.$bot.ts: after the reply is generated (next to persistConversation), call recordSiteConversation with channel = bot, lang, page (see d), messages = nextMessages, visitor = the name/whatsapp that extractPartial finds. For the workshop bot also pass recommendation from routeFloor(profile): floor = floorId, secondaryFloor = secondaryFloorId, title = that floor's display name from the floors data, reason = the human-readable reason text for reasonKey if one exists. When saveCompletion succeeds call it again with lead = { table: 'workshop_leads' or 'course_proposals', id: recordId }, visitor from the summary (full_name, whatsapp, contact_method) and status 'completed'.
b. Elevator session id: add id: string to SessionState. createSession() sets id = crypto.randomUUID(); a session restored from sessionStorage without an id gets one. reset() therefore starts a new id.
c. Elevator questions: add a createServerFn logElevatorProgress({ sessionId, answers, recommendedFloor, secondaryFloor, reason }) validated with zod, which calls recordSiteConversation with channel 'elevator', page '/elevator'. Call it (fire-and-forget on the client, errors ignored) after every qualify answer and after finishQualify. answers must use these keys and the Arabic LABEL the visitor chose, not the internal option value: profession, goal (free text as typed), pain_type, intent, has_work, tool_level. recommendation title = the floor's display name, reason = recommend().why.
d. The ChatWindow client adds page: window.location.pathname to the /api/chat body; the server passes it through.
e. src/routes/api/ask-algo.ts: the client sends session_id = the elevator session id. The server keeps slicing the last 8 turns for the model exactly as now, but records the FULL list the client sent plus the new assistant reply as messages, with channel 'elevator', page '/elevator', and the answers it received (same key mapping as c).
f. Handoff form (src/lib/elevator-leads.functions.ts): accept sessionId in the payload. Generate the lead id in the server function (crypto.randomUUID()) and insert it explicitly into leads (anon cannot select after insert). Then call recordSiteConversation with channel 'elevator', visitor { name, contact, contactMethod, note }, lead { table: 'leads', id }, status 'completed'.

5) FEED FOR THE ERP (server routes, no CORS headers needed)
Both require the header Authorization: Bearer <ERP_SYNC_TOKEN>. Compare in constant time (compare SHA-256 digests with crypto.timingSafeEqual). Wrong or missing token -> 401 {"error":"unauthorized"}. Secret not set -> 503.

GET /api/erp/ping  ->  { "ok": true, "version": 1, "conversations": <total row count> }

GET /api/erp/conversations?cursor=<opaque>&limit=<1..200, default 100>
- Returns rows ordered by updated_at ASC, id ASC, strictly after the cursor: (updated_at > T) OR (updated_at = T AND id > ID).
- The cursor is base64url of "<updated_at>|<id>" of the last returned row. Use the updated_at string exactly as Postgres returns it (microseconds included); do not round-trip it through a JS Date, which drops microseconds.
- Settle window: only return rows whose updated_at is older than 5 seconds, so a row whose transaction has not committed yet can never be skipped.
- Response: { "conversations": [...], "next_cursor": string (the incoming cursor when nothing new; null only when there was no cursor and no rows), "has_more": boolean }
- Each conversation:
  {
    "id": "<site_conversations.id>",
    "session_id": "...",
    "channel": "workshop" | "proposal" | "elevator",
    "lang": "ar" | "en",
    "page": "/workshop-advisor" | null,
    "status": "active" | "completed",
    "started_at": ISO, "last_activity_at": ISO, "updated_at": ISO,
    "messages": [ { "role": "user" | "assistant", "content": "...", "at": ISO | null } ],
    "visitor": { "name": ..., "contact": ..., "contact_method": ..., "note": ... },
    "answers": { "profession": ..., "goal": ..., "pain_type": ..., "intent": ..., "has_work": ..., "tool_level": ... } | null,
    "recommendation": { "floor": int|null, "secondary_floor": int|null, "title": text|null, "reason": text|null } | null,
    "lead": { "table": "workshop_leads" | "course_proposals" | "leads", "id": "<uuid>", "fields": { every column of that lead row except transcript } } | null
  }
  Load the lead rows in bulk (one query per lead table with .in('id', ids)), not one query per conversation.

6) OPTIONAL INSTANT PUSH
pushToErp(row): read the settings row with key 'erp_push_url'. If it is missing or empty, do nothing. Otherwise POST { "conversation": <the same JSON as in the feed> } to that URL with headers Content-Type: application/json and Authorization: Bearer <ERP_SYNC_TOKEN>, timeout 2500 ms, and ignore any error. Do not create the erp_push_url row now; we add it later when the ERP has a public address.

7) OLD WEBHOOK
settings.webhook_url points to an expired localtunnel address (bitter-days-travel.loca.lt) and every call to it has failed. Delete that settings row; the new feed replaces it. Keep the fireWebhook code as it is.

8) BACKFILL ONCE
Copy the existing history into site_conversations so the ERP imports it:
- Every conversation_logs row -> channel = bot_type, same session_id, messages with "at": null, started_at = created_at, last_activity_at = updated_at. Link lead_table/lead_id to the workshop_leads / course_proposals row with the same session_id if one exists, and take visitor_name/visitor_contact from its full_name/whatsapp; status 'completed' if such a row exists.
- Every row of public.leads (the elevator handoff form) -> channel 'elevator', session_id = 'lead-' || id, visitor fields from name/contact/contact_method/note, answers from its profession/goal/pain_type/intent/has_work/tool_level columns, recommended_floor/secondary_floor, lead_table 'leads', lead_id = id, status 'completed', started_at = coalesce(started_at, created_at), last_activity_at = created_at.

9) TESTS
Add vitest tests for: the message "at" merge, cursor encode/decode, and the feed's auth check (401 without or with a wrong token).

When everything works, publish the site.
