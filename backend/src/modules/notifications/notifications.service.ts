import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMyNotifications(userId: string, tenantId: string) {
    return this.prisma.notification.findMany({
      where: { userId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAsRead(id: string, userId: string, tenantId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId, tenantId },
    });

    if (!notification) {
      throw new NotFoundException('Notificación no encontrada.');
    }

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async create(createNotificationDto: CreateNotificationDto, tenantId: string) {
    return this.prisma.notification.create({
      data: {
        tenantId,
        userId: createNotificationDto.userId,
        title: createNotificationDto.title,
        message: createNotificationDto.message,
      },
    });
  }
}
