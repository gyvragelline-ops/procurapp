alter table donantes add column if not exists antecedentes text;
alter table donantes drop constraint if exists donantes_antecedentes_largo;
alter table donantes add constraint donantes_antecedentes_largo check (antecedentes is null or length(antecedentes) <= 2000);
notify pgrst, 'reload schema';
