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

comment on index public.call_events_actor_idx is
  'Supports account FK maintenance and account-scoped call audit joins.';
comment on index public.communication_push_outbox_sender_idx is
  'Supports account FK maintenance for durable communication notifications.';
comment on index public.communication_push_outbox_target_idx is
  'Supports account FK maintenance and target delivery diagnostics.';
