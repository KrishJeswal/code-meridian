-- rls_auto_enable() backs the dashboard-created `ensure_rls` event trigger.
-- As a SECURITY DEFINER function in an exposed schema it was callable by
-- anon and authenticated over /rest/v1/rpc. Event triggers don't need
-- EXECUTE granted to fire, so revoking it changes nothing about the trigger.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
