alter table donantes add column if not exists es_prueba boolean not null default false;
notify pgrst, 'reload schema';
