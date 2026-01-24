-- Refresh stats for 2024, 2025, 2026 to ensure all data is up to date with new structure
select public.refresh_admin_stats(2024);
select public.refresh_admin_stats(2025);
select public.refresh_admin_stats(2026);
