-- ---------------------------------------------------------------------------
-- Storage for profile photos.
--
-- The bucket is private. A public bucket would put every member's face on a
-- guessable URL that works forever, for anyone, with no account — which is a
-- worse leak than the coordinates 0002 closed, because a photo identifies a
-- person on sight. Reads go through short-lived signed URLs instead.
--
-- Writes are confined to a folder named after the uploader's own uid, so one
-- member cannot overwrite another's picture.
-- ---------------------------------------------------------------------------

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  false,
  5 * 1024 * 1024,                                  -- 5 MB is plenty for a phone photo
  array['image/jpeg', 'image/png', 'image/webp']    -- no SVG: it can carry script
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Re-runnable.
drop policy if exists profile_photos_read   on storage.objects;
drop policy if exists profile_photos_insert on storage.objects;
drop policy if exists profile_photos_update on storage.objects;
drop policy if exists profile_photos_delete on storage.objects;

-- Any signed-in member may read: they have to see each other's cards. Not
-- anon, so a leaked path is useless without an account.
create policy profile_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'profile-photos');

-- Writes only inside your own folder: profile-photos/<your uid>/<file>.
create policy profile_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy profile_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy profile_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;
