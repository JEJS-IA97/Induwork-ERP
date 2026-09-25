-- CreateEnum
CREATE TYPE "PriceAdjustmentType" AS ENUM ('FIXED_PRICE', 'PERCENTAGE_DISCOUNT', 'PERCENTAGE_INCREASE');

-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('PROMO_CODE', 'AUTOMATIC_DISCOUNT', 'FREE_SHIPPING', 'BUY_X_GET_Y', 'NEXT_ORDER_COUPON', 'LOYALTY_PROGRAM');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING', 'FREE_PRODUCT');

-- CreateEnum
CREATE TYPE "CouponStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('RFQ', 'SENT', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('DRAFT', 'VALIDATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VendorBillStatus" AS ENUM ('DRAFT', 'POSTED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ThreeWayMatchStatus" AS ENUM ('MATCHED', 'DISCREPANCY', 'NOT_MATCHED');

-- CreateEnum
CREATE TYPE "DispatchType" AS ENUM ('VENTA', 'TRASLADO_INTERNO', 'CONSIGNACION', 'REPARACION_MANTENCION', 'DEVOLUCION');

-- CreateEnum
CREATE TYPE "DispatchGuideStatus" AS ENUM ('DRAFT', 'ISSUED', 'DELIVERED', 'VOID');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LotSerialType" AS ENUM ('SERIAL', 'LOT');

-- CreateEnum
CREATE TYPE "BomType" AS ENUM ('KIT', 'MANUFACTURE');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SYSTEM_ADMIN';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "priceListId" TEXT;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0.0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "appliedCouponCode" TEXT,
ADD COLUMN     "appliedPromotionName" TEXT;

-- CreateTable
CREATE TABLE "price_lists" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "adjustmentType" "PriceAdjustmentType" NOT NULL DEFAULT 'FIXED_PRICE',
    "fixedPrice" DECIMAL(14,2),
    "percentAdjustment" DECIMAL(6,2),
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_programs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" "PromotionType" NOT NULL,
    "discountType" "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
    "discountValue" DECIMAL(14,2) NOT NULL DEFAULT 0.0,
    "minOrderAmount" DECIMAL(14,2),
    "buyQuantity" INTEGER,
    "getQuantity" INTEGER,
    "rewardProductId" TEXT,
    "loyaltyTargetCount" INTEGER DEFAULT 10,
    "maxUsageCount" INTEGER,
    "currentUsageCount" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customerId" TEXT,
    "status" "CouponStatus" NOT NULL DEFAULT 'ACTIVE',
    "discountValue" DECIMAL(14,2),
    "expirationDate" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "usedInOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_programs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Programa de Puntos y Lealtad',
    "pointsPerSpent" DECIMAL(10,4) NOT NULL DEFAULT 1.0,
    "minPointsToRedeem" INTEGER NOT NULL DEFAULT 100,
    "pointsValueClp" DECIMAL(10,2) NOT NULL DEFAULT 10.0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_cards" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "currentPoints" INTEGER NOT NULL DEFAULT 0,
    "totalEarnedPoints" INTEGER NOT NULL DEFAULT 0,
    "totalSpentPoints" INTEGER NOT NULL DEFAULT 0,
    "totalPurchasesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "orderId" TEXT,
    "points" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'RFQ',
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDate" TIMESTAMP(3),
    "subtotalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0.0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0.0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0.0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 19.0,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_product_prices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "supplierSku" TEXT,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "deliveryLeadDays" INTEGER NOT NULL DEFAULT 3,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_product_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reordering_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "warehouseLocation" TEXT NOT NULL DEFAULT 'BODEGA_CENTRAL',
    "minStock" INTEGER NOT NULL DEFAULT 5,
    "maxStock" INTEGER NOT NULL DEFAULT 50,
    "qtyToOrder" INTEGER NOT NULL DEFAULT 20,
    "preferredSupplierId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reordering_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "poId" TEXT,
    "supplierId" TEXT NOT NULL,
    "warehouseLocation" TEXT NOT NULL DEFAULT 'BODEGA_CENTRAL',
    "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "validatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_items" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "lotSerialId" TEXT,
    "quantityReceived" INTEGER NOT NULL DEFAULT 1,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_bills" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "poId" TEXT,
    "receiptId" TEXT,
    "dteType" INTEGER NOT NULL DEFAULT 33,
    "status" "VendorBillStatus" NOT NULL DEFAULT 'DRAFT',
    "matchStatus" "ThreeWayMatchStatus" NOT NULL DEFAULT 'NOT_MATCHED',
    "matchDiscrepancyNotes" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "subtotalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0.0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0.0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0.0,
    "xmlUrl" TEXT,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_guides" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "guideNumber" TEXT NOT NULL,
    "dteType" INTEGER NOT NULL DEFAULT 52,
    "orderId" TEXT,
    "transferId" TEXT,
    "customerId" TEXT,
    "dispatchType" "DispatchType" NOT NULL DEFAULT 'VENTA',
    "status" "DispatchGuideStatus" NOT NULL DEFAULT 'DRAFT',
    "originWarehouse" TEXT NOT NULL DEFAULT 'BODEGA_CENTRAL',
    "destinationWarehouse" TEXT,
    "destinationAddress" TEXT,
    "carrierRut" TEXT,
    "carrierName" TEXT,
    "vehiclePlate" TEXT,
    "driverName" TEXT,
    "driverRut" TEXT,
    "xmlUrl" TEXT,
    "pdfUrl" TEXT,
    "tedBarcode" TEXT,
    "issuedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatch_guides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_guide_items" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "lotSerialId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatch_guide_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "transferNumber" TEXT NOT NULL,
    "sourceWarehouse" TEXT NOT NULL,
    "destinationWarehouse" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
    "dispatchedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "lotSerialId" TEXT,
    "quantityRequested" INTEGER NOT NULL DEFAULT 1,
    "quantitySent" INTEGER NOT NULL DEFAULT 0,
    "quantityReceived" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_lot_serials" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "lotOrSerialNumber" TEXT NOT NULL,
    "type" "LotSerialType" NOT NULL DEFAULT 'SERIAL',
    "initialQuantity" INTEGER NOT NULL DEFAULT 1,
    "currentQuantity" INTEGER NOT NULL DEFAULT 1,
    "warehouseLocation" TEXT NOT NULL DEFAULT 'BODEGA_CENTRAL',
    "expirationDate" TIMESTAMP(3),
    "warrantyEndDate" TIMESTAMP(3),
    "purchaseOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_lot_serials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_of_materials" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "parentProductId" TEXT NOT NULL,
    "parentVariantId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "BomType" NOT NULL DEFAULT 'KIT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bill_of_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_components" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "componentProductId" TEXT NOT NULL,
    "componentVariantId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bom_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_lists_tenantId_idx" ON "price_lists"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_tenantId_code_key" ON "price_lists"("tenantId", "code");

-- CreateIndex
CREATE INDEX "price_list_items_tenantId_idx" ON "price_list_items"("tenantId");

-- CreateIndex
CREATE INDEX "price_list_items_priceListId_idx" ON "price_list_items"("priceListId");

-- CreateIndex
CREATE INDEX "price_list_items_productId_idx" ON "price_list_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_items_tenantId_priceListId_productId_variantId_m_key" ON "price_list_items"("tenantId", "priceListId", "productId", "variantId", "minQuantity");

-- CreateIndex
CREATE INDEX "promotion_programs_tenantId_idx" ON "promotion_programs"("tenantId");

-- CreateIndex
CREATE INDEX "promotion_programs_tenantId_type_isActive_idx" ON "promotion_programs"("tenantId", "type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_programs_tenantId_code_key" ON "promotion_programs"("tenantId", "code");

-- CreateIndex
CREATE INDEX "coupons_tenantId_idx" ON "coupons"("tenantId");

-- CreateIndex
CREATE INDEX "coupons_customerId_idx" ON "coupons"("customerId");

-- CreateIndex
CREATE INDEX "coupons_status_idx" ON "coupons"("status");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_tenantId_code_key" ON "coupons"("tenantId", "code");

-- CreateIndex
CREATE INDEX "loyalty_programs_tenantId_idx" ON "loyalty_programs"("tenantId");

-- CreateIndex
CREATE INDEX "loyalty_cards_tenantId_idx" ON "loyalty_cards"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_cards_tenantId_customerId_key" ON "loyalty_cards"("tenantId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_cards_tenantId_cardNumber_key" ON "loyalty_cards"("tenantId", "cardNumber");

-- CreateIndex
CREATE INDEX "loyalty_transactions_tenantId_idx" ON "loyalty_transactions"("tenantId");

-- CreateIndex
CREATE INDEX "loyalty_transactions_cardId_idx" ON "loyalty_transactions"("cardId");

-- CreateIndex
CREATE INDEX "purchase_orders_tenantId_idx" ON "purchase_orders"("tenantId");

-- CreateIndex
CREATE INDEX "purchase_orders_supplierId_idx" ON "purchase_orders"("supplierId");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenantId_poNumber_key" ON "purchase_orders"("tenantId", "poNumber");

-- CreateIndex
CREATE INDEX "vendor_product_prices_tenantId_idx" ON "vendor_product_prices"("tenantId");

-- CreateIndex
CREATE INDEX "vendor_product_prices_supplierId_idx" ON "vendor_product_prices"("supplierId");

-- CreateIndex
CREATE INDEX "vendor_product_prices_productId_idx" ON "vendor_product_prices"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_product_prices_tenantId_supplierId_productId_variant_key" ON "vendor_product_prices"("tenantId", "supplierId", "productId", "variantId", "minQuantity");

-- CreateIndex
CREATE INDEX "reordering_rules_tenantId_idx" ON "reordering_rules"("tenantId");

-- CreateIndex
CREATE INDEX "reordering_rules_productId_idx" ON "reordering_rules"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "reordering_rules_tenantId_productId_variantId_warehouseLoca_key" ON "reordering_rules"("tenantId", "productId", "variantId", "warehouseLocation");

-- CreateIndex
CREATE INDEX "goods_receipts_tenantId_idx" ON "goods_receipts"("tenantId");

-- CreateIndex
CREATE INDEX "goods_receipts_poId_idx" ON "goods_receipts"("poId");

-- CreateIndex
CREATE INDEX "goods_receipts_supplierId_idx" ON "goods_receipts"("supplierId");

-- CreateIndex
CREATE INDEX "goods_receipts_status_idx" ON "goods_receipts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_tenantId_receiptNumber_key" ON "goods_receipts"("tenantId", "receiptNumber");

-- CreateIndex
CREATE INDEX "vendor_bills_tenantId_idx" ON "vendor_bills"("tenantId");

-- CreateIndex
CREATE INDEX "vendor_bills_supplierId_idx" ON "vendor_bills"("supplierId");

-- CreateIndex
CREATE INDEX "vendor_bills_status_idx" ON "vendor_bills"("status");

-- CreateIndex
CREATE INDEX "vendor_bills_matchStatus_idx" ON "vendor_bills"("matchStatus");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_bills_tenantId_supplierId_billNumber_key" ON "vendor_bills"("tenantId", "supplierId", "billNumber");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_guides_transferId_key" ON "dispatch_guides"("transferId");

-- CreateIndex
CREATE INDEX "dispatch_guides_tenantId_idx" ON "dispatch_guides"("tenantId");

-- CreateIndex
CREATE INDEX "dispatch_guides_dispatchType_idx" ON "dispatch_guides"("dispatchType");

-- CreateIndex
CREATE INDEX "dispatch_guides_status_idx" ON "dispatch_guides"("status");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_guides_tenantId_guideNumber_key" ON "dispatch_guides"("tenantId", "guideNumber");

-- CreateIndex
CREATE INDEX "stock_transfers_tenantId_idx" ON "stock_transfers"("tenantId");

-- CreateIndex
CREATE INDEX "stock_transfers_status_idx" ON "stock_transfers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_tenantId_transferNumber_key" ON "stock_transfers"("tenantId", "transferNumber");

-- CreateIndex
CREATE INDEX "product_lot_serials_tenantId_idx" ON "product_lot_serials"("tenantId");

-- CreateIndex
CREATE INDEX "product_lot_serials_productId_idx" ON "product_lot_serials"("productId");

-- CreateIndex
CREATE INDEX "product_lot_serials_lotOrSerialNumber_idx" ON "product_lot_serials"("lotOrSerialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "product_lot_serials_tenantId_productId_variantId_lotOrSeria_key" ON "product_lot_serials"("tenantId", "productId", "variantId", "lotOrSerialNumber");

-- CreateIndex
CREATE INDEX "bill_of_materials_tenantId_idx" ON "bill_of_materials"("tenantId");

-- CreateIndex
CREATE INDEX "bill_of_materials_parentProductId_idx" ON "bill_of_materials"("parentProductId");

-- CreateIndex
CREATE UNIQUE INDEX "bill_of_materials_tenantId_code_key" ON "bill_of_materials"("tenantId", "code");

-- CreateIndex
CREATE INDEX "bom_components_bomId_idx" ON "bom_components"("bomId");

-- CreateIndex
CREATE INDEX "bom_components_componentProductId_idx" ON "bom_components"("componentProductId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_programs" ADD CONSTRAINT "promotion_programs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_programId_fkey" FOREIGN KEY ("programId") REFERENCES "promotion_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_cards" ADD CONSTRAINT "loyalty_cards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_cards" ADD CONSTRAINT "loyalty_cards_programId_fkey" FOREIGN KEY ("programId") REFERENCES "loyalty_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_cards" ADD CONSTRAINT "loyalty_cards_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "loyalty_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_poId_fkey" FOREIGN KEY ("poId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_product_prices" ADD CONSTRAINT "vendor_product_prices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_product_prices" ADD CONSTRAINT "vendor_product_prices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_product_prices" ADD CONSTRAINT "vendor_product_prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_product_prices" ADD CONSTRAINT "vendor_product_prices_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reordering_rules" ADD CONSTRAINT "reordering_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reordering_rules" ADD CONSTRAINT "reordering_rules_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reordering_rules" ADD CONSTRAINT "reordering_rules_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reordering_rules" ADD CONSTRAINT "reordering_rules_preferredSupplierId_fkey" FOREIGN KEY ("preferredSupplierId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_poId_fkey" FOREIGN KEY ("poId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_lotSerialId_fkey" FOREIGN KEY ("lotSerialId") REFERENCES "product_lot_serials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_poId_fkey" FOREIGN KEY ("poId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "goods_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_guides" ADD CONSTRAINT "dispatch_guides_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_guides" ADD CONSTRAINT "dispatch_guides_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_guides" ADD CONSTRAINT "dispatch_guides_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "stock_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_guides" ADD CONSTRAINT "dispatch_guides_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_guide_items" ADD CONSTRAINT "dispatch_guide_items_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "dispatch_guides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_guide_items" ADD CONSTRAINT "dispatch_guide_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_guide_items" ADD CONSTRAINT "dispatch_guide_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_guide_items" ADD CONSTRAINT "dispatch_guide_items_lotSerialId_fkey" FOREIGN KEY ("lotSerialId") REFERENCES "product_lot_serials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_lotSerialId_fkey" FOREIGN KEY ("lotSerialId") REFERENCES "product_lot_serials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_lot_serials" ADD CONSTRAINT "product_lot_serials_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_lot_serials" ADD CONSTRAINT "product_lot_serials_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_lot_serials" ADD CONSTRAINT "product_lot_serials_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_lot_serials" ADD CONSTRAINT "product_lot_serials_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_of_materials" ADD CONSTRAINT "bill_of_materials_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_of_materials" ADD CONSTRAINT "bill_of_materials_parentProductId_fkey" FOREIGN KEY ("parentProductId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_of_materials" ADD CONSTRAINT "bill_of_materials_parentVariantId_fkey" FOREIGN KEY ("parentVariantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "bill_of_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_componentVariantId_fkey" FOREIGN KEY ("componentVariantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
