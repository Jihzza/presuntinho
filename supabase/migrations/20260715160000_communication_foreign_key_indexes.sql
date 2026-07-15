-- Keep account deletion and event/outbox joins index-backed. These columns
-- gained foreign keys in the communications reliability migrations, but the
-- initial release intentionally prioritised the dispatch access paths.

create index if not exists call_events_actor_idx
  on public.call_events (actor)
  where actor is not null;

create index if not exists communication_push_outbox_sender_idx
  on public.communication_push_outbox (sender);

create index if not exists communication_push_outbox_target_idx
  on public.communication_push_outbox (target);

create index if not exists call_handoffs_from_installation_idx
  on public.call_handoffs (account, from_installation_id);

create index if not exists call_handoffs_target_installation_idx
  on public.call_handoffs (account, target_installation_id);

create index if not exists chat_conversations_disappearing_updated_by_idx
  on public.chat_conversations (disappearing_updated_by)
  where disappearing_updated_by is not null;

create index if not exists chat_disappearing_events_actor_idx
  on public.chat_disappearing_events (actor_id)
  where actor_id is not null;

create index if not exists chat_reminders_message_idx
  on public.chat_reminders (message_id);

comment on index public.call_events_actor_idx is
  'Supports account FK maintenance and account-scoped call audit joins.';
comment on index public.communication_push_outbox_sender_idx is
  'Supports account FK maintenance for durable communication notifications.';
comment on index public.communication_push_outbox_target_idx is
  'Supports account FK maintenance and target delivery diagnostics.';
comment on index public.call_handoffs_from_installation_idx is
  'Supports installation FK maintenance across completed handoff history.';
comment on index public.call_handoffs_target_installation_idx is
  'Supports installation FK maintenance across every handoff status.';
comment on index public.chat_conversations_disappearing_updated_by_idx is
  'Supports account FK maintenance for shared disappearing-message settings.';
comment on index public.chat_disappearing_events_actor_idx is
  'Supports account FK maintenance across disappearing-message audit history.';
comment on index public.chat_reminders_message_idx is
  'Supports message FK maintenance and expiry-driven reminder cancellation.';
