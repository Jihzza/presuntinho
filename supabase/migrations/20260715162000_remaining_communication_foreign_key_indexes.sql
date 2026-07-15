-- Cover the remaining foreign keys used by call delivery, chat reactions and
-- synchronized couple-heart activity. The existing composite indexes do not
-- lead with these FK columns, so they cannot support parent-row maintenance.

create index if not exists call_deliveries_subscription_idx
  on public.call_deliveries (subscription_id);

create index if not exists chat_reactions_account_idx
  on public.chat_reactions (account_id);

create index if not exists couple_heart_sessions_last_tapper_idx
  on public.couple_heart_sessions (last_tapper);

create index if not exists couple_heart_taps_couple_idx
  on public.couple_heart_taps (couple_id);

create index if not exists couple_heart_taps_tapper_idx
  on public.couple_heart_taps (tapper);

comment on index public.call_deliveries_subscription_idx is
  'Covers the call_deliveries.subscription_id push-subscription foreign key.';
comment on index public.chat_reactions_account_idx is
  'Covers the chat_reactions.account_id account foreign key.';
comment on index public.couple_heart_sessions_last_tapper_idx is
  'Covers the couple-heart session last-tapper account foreign key.';
comment on index public.couple_heart_taps_couple_idx is
  'Covers the couple-heart tap couple-space foreign key.';
comment on index public.couple_heart_taps_tapper_idx is
  'Covers the couple-heart tap account foreign key.';
