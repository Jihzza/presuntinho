-- Structural assertion for 20260715161000_chat_conversations_creator_index.sql.
-- The caller owns the surrounding BEGIN/ROLLBACK and applies the migration first.

do $chat_conversations_creator_index$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_indexdef(index_class.oid)
    into v_definition
  from pg_catalog.pg_class index_class
  where index_class.oid = to_regclass('public.chat_conversations_created_by_idx');

  if v_definition is null
     or v_definition not like '% ON public.chat_conversations USING btree (created_by)%' then
    raise exception 'chat conversation creator FK index is missing or malformed';
  end if;
end;
$chat_conversations_creator_index$;
