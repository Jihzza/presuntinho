-- Structural assertions for communication FK indexes. Caller owns the
-- surrounding BEGIN/ROLLBACK and applies the migration first.

do $communication_fk_indexes$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_indexdef(index_class.oid)
    into v_definition
  from pg_catalog.pg_class index_class
  where index_class.oid = to_regclass('public.call_events_actor_idx');
  if v_definition is null
     or v_definition not like '% ON public.call_events USING btree (actor)%'
     or v_definition not like '%WHERE (actor IS NOT NULL)%' then
    raise exception 'call_events actor FK index is missing or malformed';
  end if;

  select pg_catalog.pg_get_indexdef(index_class.oid)
    into v_definition
  from pg_catalog.pg_class index_class
  where index_class.oid = to_regclass('public.communication_push_outbox_sender_idx');
  if v_definition is null
     or v_definition not like '% ON public.communication_push_outbox USING btree (sender)%' then
    raise exception 'communication outbox sender FK index is missing or malformed';
  end if;

  select pg_catalog.pg_get_indexdef(index_class.oid)
    into v_definition
  from pg_catalog.pg_class index_class
  where index_class.oid = to_regclass('public.communication_push_outbox_target_idx');
  if v_definition is null
     or v_definition not like '% ON public.communication_push_outbox USING btree (target)%' then
    raise exception 'communication outbox target FK index is missing or malformed';
  end if;
end;
$communication_fk_indexes$;
