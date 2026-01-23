
-- Create policy (will fail if exists, but that's better than permission error on ALTER)
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'storage' 
    and tablename = 'objects' 
    and policyname = 'Allow authenticated uploads'
  ) then
    create policy "Allow authenticated uploads"
    on storage.objects for insert
    to authenticated
    with check ( bucket_id = 'chat-media' );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'storage' 
    and tablename = 'objects' 
    and policyname = 'Allow public read'
  ) then
    create policy "Allow public read"
    on storage.objects for select
    to public
    using ( bucket_id = 'chat-media' );
  end if;
end
$$;
