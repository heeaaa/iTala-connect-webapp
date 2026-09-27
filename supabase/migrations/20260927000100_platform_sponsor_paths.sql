-- Platform sponsors (PRD S-01): every stored path stays inside the platform
-- folder as a single plain file name ending in .png, .jpg or .webp, the same
-- rule event images follow (20260926000700). No "..", no other folders, no SVG.
alter table public.platform_sponsors add constraint platform_sponsors_image_platform_folder
  check (image_path ~ '^platform/[A-Za-z0-9_-]+\.(png|jpg|webp)$');
