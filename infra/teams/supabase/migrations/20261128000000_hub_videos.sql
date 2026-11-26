-- The hub shows a Version's JPG pictures and MP4 videos too. Still never a script or a STEP file.
create or replace function public.is_review_path (p_path text) returns boolean
language sql immutable set search_path = '' as $$
  select lower(p_path) ~ '\.(stl|glb|pdf|png|jpe?g|mp4)$'
$$;
