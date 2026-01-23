
-- Enable RLS on storage.objects (if not already enabled, though it usually is)
alter table storage.objects enable row level security;

-- Drop existing policies if any to avoid conflicts
drop policy if exists "Allow authenticated uploads" on storage.objects;
drop policy if exists "Allow authenticated updates" on storage.objects;
drop policy if exists "Allow public read" on storage.objects;

-- Create policies for chat-media bucket
create policy "Allow authenticated uploads"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'chat-media' );

create policy "Allow authenticated updates"
on storage.objects for update
to authenticated
using ( bucket_id = 'chat-media' );

create policy "Allow public read"
on storage.objects for select
to public
using ( bucket_id = 'chat-media' );
