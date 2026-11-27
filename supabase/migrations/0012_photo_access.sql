-- ---------------------------------------------------------------------------
-- Who may read a profile photo.
--
-- 0005 created the bucket private and then granted this:
--
--   create policy profile_photos_read on storage.objects
--     for select to authenticated
--     using (bucket_id = 'profile-photos');
--
-- Which is every object in the bucket, to every signed-in account. The bucket
-- not being public bought nothing, because the policy handed it back. Paths
-- are `<uid>/avatar.jpg`, so they are not even guesswork: any profile id —
-- and ids travel in the feed — gives you the path to that person's photo.
--
-- That covers people who hid, deleted their account, or blocked the person
-- asking. A photo should stop being readable when any of those happen, and it
-- did not.
--
-- Three ways in now, and nothing else:
--
--   1. It is yours. The folder is named after the uploader, so this is a
--      string comparison and holds even for a profile that is hidden or
--      deleted — you can still see your own picture.
--
--   2. The profile is discoverable, not deleted, and has not blocked you.
--      This is the feed case, and it tracks the feed: hide yourself and your
--      photo goes with you.
--
--   3. You are matched. Without this, hiding yourself would blank your photo
--      inside conversations you are already having — the remediation review
--      raised that as a question and it is a defect, not a question. A match
--      is a relationship the other person opted into, so it outlives their
--      appearing in the deck. Blocks still override it.
--
-- `photo_path` has to equal the object name for cases 2 and 3, so a stale or
-- renamed object is not readable through a profile that no longer points at
-- it. Verified against the uploader: `uploadProfilePhoto` writes
-- `<uid>/avatar.<ext>` as both the storage path and `profiles.photo_path`.
--
-- Safe to run twice.
-- ---------------------------------------------------------------------------

begin;

drop policy if exists profile_photos_read on storage.objects;

create policy profile_photos_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and (
      -- 1. Your own folder.
      (storage.foldername(name))[1] = (select auth.uid())::text

      -- 2. A profile you could meet.
      or exists (
        select 1
        from profiles p
        where p.id::text = (storage.foldername(objects.name))[1]
          and p.photo_path = objects.name
          and p.deleted_at is null
          and p.is_discoverable
          and not is_blocked((select auth.uid()), p.id)
      )

      -- 3. Someone you matched with, whether or not they are still in the
      --    deck. Blocks are checked here too: blocking is meant to work after
      --    a match, which is when it matters most.
      or exists (
        select 1
        from profiles p
        join matches m
          on (m.user_a = p.id and m.user_b = (select auth.uid()))
          or (m.user_b = p.id and m.user_a = (select auth.uid()))
        where p.id::text = (storage.foldername(objects.name))[1]
          and p.photo_path = objects.name
          and p.deleted_at is null
          and not is_blocked((select auth.uid()), p.id)
      )
    )
  );

commit;
