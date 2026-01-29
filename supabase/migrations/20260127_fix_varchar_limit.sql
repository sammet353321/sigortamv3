-- Fix 'value too long' error for status or phone_number columns
-- The error code 22001 means value too long for varchar(20). 
-- This is likely happening on 'status' (if someone put a constraint) or 'phone_number' (if it includes @s.whatsapp.net which is long).
-- To be safe, we will change both to TEXT which has no practical limit.

ALTER TABLE public.whatsapp_sessions 
    ALTER COLUMN status TYPE TEXT,
    ALTER COLUMN phone_number TYPE TEXT;
