
-- Drop existing policies to ensure clean state
DROP POLICY IF EXISTS "Allow authenticated uploads to chat-media" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read from chat-media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;
DROP POLICY IF EXISTS "Public can view media" ON storage.objects;

-- Create permissive policies for chat-media bucket
CREATE POLICY "Allow authenticated uploads to chat-media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "Allow public read from chat-media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'chat-media');

-- Also allow update/delete for own files just in case
CREATE POLICY "Allow users to update own media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'chat-media' AND owner = auth.uid());

CREATE POLICY "Allow users to delete own media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'chat-media' AND owner = auth.uid());
