-- Keep account deletion and creator-scoped conversation joins index-backed.
-- This foreign key predates the communications v3 migrations but is exercised
-- by every direct conversation created by the messaging and calling flows.

create index if not exists chat_conversations_created_by_idx
  on public.chat_conversations (created_by);

comment on index public.chat_conversations_created_by_idx is
  'Covers the chat_conversations.created_by account foreign key.';
