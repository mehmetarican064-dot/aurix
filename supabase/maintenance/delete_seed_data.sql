-- AURIX maintenance — yalnızca is_seed=true kayıtları siler
-- Üretim (is_seed=false / NULL) verisine dokunmaz.
-- Manuel çalıştırın. Otomatik deploy/migration’a eklemeyin.

BEGIN;

DELETE FROM public.is_talepleri
WHERE COALESCE(is_seed, FALSE) IS TRUE;

DELETE FROM public.firmalar
WHERE COALESCE(is_seed, FALSE) IS TRUE;

COMMIT;
