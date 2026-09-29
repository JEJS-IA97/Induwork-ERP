import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BomService } from './bom.service';

describe('BomService', () => {
  let service: BomService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      product: {
        findFirst: jest.fn(),
      },
      billOfMaterials: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
      inventoryStock: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      stockMovement: {
        create: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    service = new BomService(prisma);
  });

  describe('create', () => {
    it('rejects circular self-referencing BOM where parent is a component', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod-1', name: 'Bomba' });

      await expect(
        service.create(
          {
            parentProductId: 'prod-1',
            code: 'BOM-1',
            name: 'Kit Bomba',
            components: [
              { componentProductId: 'prod-1', quantity: 1 },
            ],
          },
          'tenant-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects if parent product does not exist in tenant', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          {
            parentProductId: 'prod-999',
            code: 'BOM-1',
            name: 'Kit Bomba',
            components: [
              { componentProductId: 'comp-1', quantity: 2 },
            ],
          },
          'tenant-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('checkKitAvailability', () => {
    it('calculates the maximum assembleable kits based on the bottleneck component stock', async () => {
      prisma.billOfMaterials.findFirst.mockResolvedValue({
        id: 'bom-1',
        code: 'BOM-PUMP',
        name: 'Kit Bomba 5HP',
        components: [
          {
            componentProductId: 'motor-id',
            componentProduct: { name: 'Motor 5HP', sku: 'MOT-5HP' },
            quantity: 1, // Requires 1 per kit
          },
          {
            componentProductId: 'valve-id',
            componentProduct: { name: 'Válvula Check', sku: 'VALV-1' },
            quantity: 4, // Requires 4 per kit
          },
        ],
      });

      // Motor stock = 10 (can make 10)
      // Valve stock = 12 (can make floor(12 / 4) = 3) -> Bottleneck is 3!
      prisma.inventoryStock.findFirst
        .mockResolvedValueOnce({ currentStock: 10 })
        .mockResolvedValueOnce({ currentStock: 12 });

      const result = await service.checkKitAvailability('bom-1', 'tenant-1', 'BODEGA_CENTRAL');

      expect(result.maxAssembleableKits).toBe(3);
      expect(result.components).toHaveLength(2);
      expect(result.components[0].maxKitsPossible).toBe(10);
      expect(result.components[1].maxKitsPossible).toBe(3);
    });
  });
});
