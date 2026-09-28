CREATE UNIQUE INDEX "inventory_stocks_tenantId_productId_warehouseLocation_variantId_null_key"
ON "inventory_stocks" ("tenantId", "productId", "warehouseLocation")
WHERE "variantId" IS NULL;
