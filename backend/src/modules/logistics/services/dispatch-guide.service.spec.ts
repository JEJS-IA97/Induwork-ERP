import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DispatchGuideService } from './dispatch-guide.service';
import { DispatchGuideStatus, DispatchType } from '@prisma/client';

describe('DispatchGuideService', () => {
  let service: DispatchGuideService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      order: {
        findFirst: jest.fn(),
      },
      customer: {
        findFirst: jest.fn(),
      },
      dispatchGuide: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      inventoryStock: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      stockMovement: {
        create: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    service = new DispatchGuideService(prisma);
  });

  describe('create', () => {
    it('throws NotFoundException if associated order does not exist in tenant', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          {
            dispatchType: DispatchType.VENTA,
            orderId: 'non-existent-order',
            items: [{ productId: 'p1', quantity: 2, unitPrice: 1000 }],
          },
          'tenant-1',
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if stock is insufficient for a VENTA dispatch', async () => {
      prisma.dispatchGuide.findFirst.mockResolvedValue(null); // No prior guide
      prisma.dispatchGuide.create.mockResolvedValue({ id: 'guide-1' });

      // Available stock is 1, but 5 requested
      prisma.inventoryStock.findFirst.mockResolvedValue({
        id: 'stock-1',
        currentStock: 1,
        warehouseLocation: 'BODEGA_CENTRAL',
      });

      await expect(
        service.create(
          {
            dispatchType: DispatchType.VENTA,
            items: [{ productId: 'p1', quantity: 5, unitPrice: 1000 }],
          },
          'tenant-1',
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('issue', () => {
    it('rejects issuing a guide that is not in DRAFT status', async () => {
      prisma.dispatchGuide.findFirst.mockResolvedValue({
        id: 'guide-1',
        status: DispatchGuideStatus.ISSUED,
      });

      await expect(service.issue('guide-1', 'tenant-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('successfully issues a DRAFT guide', async () => {
      prisma.dispatchGuide.findFirst.mockResolvedValue({
        id: 'guide-1',
        status: DispatchGuideStatus.DRAFT,
      });
      prisma.dispatchGuide.update.mockResolvedValue({
        id: 'guide-1',
        status: DispatchGuideStatus.ISSUED,
      });

      const res = await service.issue('guide-1', 'tenant-1');
      expect(res.status).toBe(DispatchGuideStatus.ISSUED);
    });
  });
});
