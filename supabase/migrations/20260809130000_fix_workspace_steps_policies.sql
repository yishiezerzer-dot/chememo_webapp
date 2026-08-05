-- Follow-up to 20260809120000_workspace_role_model.sql: that migration's
-- rewrite of experiment_steps_write, step_observations_insert,
-- step_deviations_insert, and protocol_steps_write replaced their pre-T2.1
-- checks (D9's owner-only write; protocol_steps' frozen-version check) with
-- a pure is_workspace_writer() check instead of adding to it, silently
-- dropping those invariants. Fixed directly in that migration's source, but
-- environments where it had already been applied (chememo-dev) need this
-- follow-up to actually pick up the corrected policies.

drop policy if exists experiment_steps_write on experiment_steps;
create policy experiment_steps_write on experiment_steps for all to authenticated
  using (
    is_workspace_writer(workspace_id, auth.uid())
    and exists (select 1 from experiments e where e.id = experiment_id and e.owner_id = auth.uid())
  )
  with check (
    is_workspace_writer(workspace_id, auth.uid())
    and exists (select 1 from experiments e where e.id = experiment_id and e.owner_id = auth.uid())
  );

drop policy if exists step_observations_insert on step_observations;
create policy step_observations_insert on step_observations for insert to authenticated
  with check (
    is_workspace_writer(workspace_id, auth.uid())
    and exists (
      select 1 from experiment_steps es join experiments e on e.id = es.experiment_id
      where es.id = experiment_step_id and e.owner_id = auth.uid()
    )
  );

drop policy if exists step_deviations_insert on step_deviations;
create policy step_deviations_insert on step_deviations for insert to authenticated
  with check (
    is_workspace_writer(workspace_id, auth.uid())
    and exists (
      select 1 from experiment_steps es join experiments e on e.id = es.experiment_id
      where es.id = experiment_step_id and e.owner_id = auth.uid()
    )
  );

drop policy if exists protocol_steps_write on protocol_steps;
create policy protocol_steps_write on protocol_steps for all to authenticated
  using (
    is_workspace_writer(workspace_id, auth.uid())
    and exists (select 1 from protocol_versions pv where pv.id = protocol_version_id and pv.frozen_at is null)
  )
  with check (
    is_workspace_writer(workspace_id, auth.uid())
    and exists (select 1 from protocol_versions pv where pv.id = protocol_version_id and pv.frozen_at is null)
  );
