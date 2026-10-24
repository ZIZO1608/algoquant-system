# Website chats (algoquant.vip bot conversations)

Every visitor who talks to a bot on the public website (Lovable project "AlgoQuant") shows up on the
**Website chats** page (`/site-chats`) for every employee, live, with the transcript, the elevator answers,
the bot's recommendation and the visitor's contact details once they leave them.

## How the data gets here

```
algoquant.vip (Lovable + Supabase)                      Algo Quant API
  site_conversations table  ── GET /api/erp/conversations ──►  sync job, every 10 s (pull)
  (one row per session+bot)  ── POST /api/v1/webhooks/site-chat ─►  optional instant push
```

- **Pull** is the main path. It works while Algo Quant runs on a laptop with no public address, and a
  cursor makes it catch up on everything the site recorded while the laptop was off.
- **Push** is optional: once the API has a public address, the site's `settings.erp_push_url` row can point
  at `<public address>/api/v1/webhooks/site-chat` and each message arrives within a second.
- Both use one shared token: `SettingsSiteChat.token` here, the `ERP_SYNC_TOKEN` secret on the site.
  Both paths are idempotent (keyed by the site's row id) and an older copy never overwrites a newer one.
- The site-side work is described, as a prompt for Lovable, in [lovable-site-chat-prompt.md](lovable-site-chat-prompt.md).
  That prompt is also the feed contract: field names, cursor rules, the 5-second settle window.

## What happens to a conversation

| Event | Result |
|---|---|
| A new conversation arrives (activity in the last 30 min) | `site_chat:update` with `isNew` to the `staff` socket room → toast for everyone not on the page, row flashes on the page |
| Any update | `site_chat:update` → list and open transcript refresh; sidebar badge counts visitors active in the last 5 min |
| The visitor leaves a contact | A CRM lead (source `bot`, `sourceSystem` = `<channel>_bot`, `externalLeadId` = the site's lead row id) is created or linked; a returning phone number links the existing lead and adds a `site_chat` activity; every active employee gets a `site_chat_contact` notification |
| Older than 30 min when it arrives (first import, laptop was off) | Stored and linked quietly: no toast, no notification |

## Code

| Part | File |
|---|---|
| Models | `SiteConversation`, `SettingsSiteChat` in `backend/prisma/schema.prisma` |
| Normalise, store, link lead, list/detail/stats | `backend/src/services/site-chat.service.ts` |
| Settings, pull loop, push handler | `backend/src/services/site-chat-sync.service.ts` |
| Routes | `backend/src/routes/site-chats.routes.ts` (all employees), `settings.routes.ts` (`/settings/site-chat*`, admin), `webhook.routes.ts` (`POST /webhooks/site-chat`) |
| Page | `src/pages/SiteChats.jsx` (`?id=`, `?filter=`, `?channel=` in the URL) |
| Settings section | `src/pages/settings/SiteChatSettings.jsx` (`/settings?section=siteChat`) |
| Badge + toast | `src/hooks/useSiteChatStats.js`, used by `src/layouts/AppShell.jsx` |
| Labels | `src/utils/siteChats.js`; English in `src/i18n/en/siteChats.js` |
| Tests | `backend/tests/site-chat.test.ts`, `backend/tests/site-chat.integration.test.ts` |

## Connecting (admin)

1. Settings → Website chats → copy the token.
2. Paste `docs/lovable-site-chat-prompt.md` into the Lovable project; give it the token when it asks for `ERP_SYNC_TOKEN`; publish.
3. Settings → Website chats → **Test connection**, then **Turn on**.

Resetting the local database (`reset-local-data.bat`) creates a new token, so the Lovable secret must be updated after a reset.

Use `https://algoquant.vip` as the site address: `www.algoquant.vip` answers with a redirect, and a redirect to
another host drops the token.

## Cleaning on arrival

`normalizeRemoteConversation` removes the bots' hidden `<<SUMMARY_JSON>> … <<END>>` block from bot messages (its
fields already arrive in `lead.fields`) and turns elevator answers saved as option values (`owner`, `repetitive`,
… — rows from before the site sent labels) into the Arabic label the visitor saw. Visitor messages are never edited.
