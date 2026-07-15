-- Structural assertions for the remaining communication FK indexes.
-- The caller owns the surrounding BEGIN/ROLLBACK and applies the migration first.

do $remaining_communication_fk_indexes$
declare
  v_name text;
  v_fragment text;
  v_definition text;
begin
  for v_name, v_fragment in
    select * from (values
      ('call_deliveries_subscription_idx', '% ON public.call_deliveries USING btree (subscription_id)%'),
      ('chat_reactions_account_idx', '% ON public.chat_reactions USING btree (account_id)%'),
      ('couple_heart_sessions_last_tapper_idx', '% ON public.couple_heart_sessions USING btree (last_tapper)%'),
      ('couple_heart_taps_couple_idx', '% ON public.couple_heart_taps USING btree (couple_id)%'),
      ('couple_heart_taps_tapper_idx', '% ON public.couple_heart_taps USING btree (tapper)%')
    ) expected(index_name, definition_fragment)
  loop
    select pg_catalog.pg_get_indexdef(to_regclass('public.' || v_name))
      into v_definition;

    if v_definition is null or v_definition not like v_fragment then
      raise exception 'communication FK index % is missing or malformed', v_name;
    end if;
  end loop;
end;
$remaining_communication_fk_indexes$;
