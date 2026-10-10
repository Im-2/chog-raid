-- Raid outcomes renamed: dead -> defeated, exhausted -> out_of_moves.
alter table raids drop constraint if exists raids_status_check;
update raids set status = 'defeated' where status = 'dead';
update raids set status = 'out_of_moves' where status = 'exhausted';
alter table raids add constraint raids_status_check
  check (status in ('active', 'abandoned', 'breach', 'defeated', 'out_of_moves'));
