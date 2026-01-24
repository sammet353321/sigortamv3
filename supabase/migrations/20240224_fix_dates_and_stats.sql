-- 1. Fix Normal Policies: tanzim_tarihi = tarih - 1 year
-- Assuming 'tarih' holds the END DATE (e.g. 2026)
-- We want tanzim_tarihi to be 2025.
update public.policeler
set tanzim_tarihi = tarih - interval '1 year'
where durum != 'İPTAL' 
  and tanzim_tarihi = tarih; -- Only update if they are currently same (meaning incorrect)

-- 2. Fix Cancelled Policies: tanzim_tarihi = tarih
-- Assuming 'tarih' holds the CANCEL DATE (e.g. 2025)
-- We want tanzim_tarihi to be 2025 (Same).
update public.policeler
set tanzim_tarihi = tarih
where durum = 'İPTAL'
  and tanzim_tarihi != tarih; -- Fix if they are different

-- 3. Force Refresh Stats
select public.refresh_admin_stats();
