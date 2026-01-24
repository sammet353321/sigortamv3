-- Make tanzim_tarihi nullable in policeler table
ALTER TABLE public.policeler ALTER COLUMN tanzim_tarihi DROP NOT NULL;
