import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller';
import { PriceListsService } from './services/price-lists.service';
import { PromotionsService } from './services/promotions.service';
import { LoyaltyService } from './services/loyalty.service';

@Module({
  controllers: [PricingController],
  providers: [PriceListsService, PromotionsService, LoyaltyService],
  exports: [PriceListsService, PromotionsService, LoyaltyService],
})
export class PricingModule {}
