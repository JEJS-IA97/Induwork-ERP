-- Secure ProductDocument visibility by default.
-- Existing documents are made private because there is no public product-document
-- endpoint in the current API and the previous default was unnecessarily permissive.
ALTER TABLE "product_documents"
ALTER COLUMN "isPublic" SET DEFAULT false;

UPDATE "product_documents"
SET "isPublic" = false
WHERE "isPublic" IS DISTINCT FROM false;
