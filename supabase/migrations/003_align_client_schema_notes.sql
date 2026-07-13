-- AURIX — canlı şema notları + istemci hizası
-- Gerçek tablolar (Dashboard’da mevcut):
--   firmalar: … dogrulanmis boolean (durum YOK)
--   is_talepleri: baslik, aciklama, kategori, sehir, durum, created_at
--
-- SPA istatistikleri RPC kullanmaz; doğrudan count sorguları atar.
-- Eski yanlış RPC denemesini temizleyin:

DROP FUNCTION IF EXISTS public.aurix_istatistikler();
