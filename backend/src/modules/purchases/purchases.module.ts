import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { PurchaseOrdersService } from './services/purchase-orders.service';
import { GoodsReceiptsService } from './services/goods-receipts.service';
import { ThreeWayMatchingService } from './services/three-way-matching.service';
import { ReorderingService } from './services/reordering.service';
import { PurchasesController } from './purchases.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PurchasesController],
  providers: [
    PurchaseOrdersService,
    GoodsReceiptsService,
    ThreeWayMatchingService,
    ReorderingService,
  ],
  exports: [
    PurchaseOrdersService,
    ReorderingService,
  ],
})
export class PurchasesModule {}
