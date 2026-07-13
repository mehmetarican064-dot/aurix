-- ESKİ / YANLIŞ şema denemesi — CANLI DB ile uyumsuz.
-- Canlıda firmalar.dogrulanmis kullanılır; durum sütunu yoktur.
-- Bu dosyayı SQL Editor’de çalıştırmayın.
-- Temizlik ve notlar için: 003_align_client_schema_notes.sql
--
-- İstemci (js/supabase.js) doğrudan count kullanır; aurix_istatistikler RPC yoktur.

SELECT '002_firmalar_is_talepleri.sql atlandı — canlı şema ile uyumsuz. 003 kullanın.' AS uyari;
