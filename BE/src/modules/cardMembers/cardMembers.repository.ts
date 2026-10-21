import { prisma as database, type DatabaseClient } from '../database';
export class CardMembersRepository {
	constructor(private readonly prismaService: DatabaseClient = database) {}

	async listUserIds(
		cardId: string,
		client: DatabaseClient = this.prismaService,
	): Promise<string[]> {
		const members = await client.cardMembers.findMany({
			where: { cardId },
			select: { userId: true },
		});
		return members.map((member) => member.userId);
	}

	async addMemberToCard(
		cardId: string,
		userId: string,
		client: DatabaseClient = this.prismaService,
	) {
		return client.cardMembers.create({
			data: {
				cardId: cardId,
				userId: userId,
			},
		});
	}

	async findMemberOnCard(
		cardId: string,
		userId: string,
		client: DatabaseClient = this.prismaService,
	) {
		return client.cardMembers.findFirst({
			where: {
				cardId: cardId,
				userId: userId,
			},
		});
	}

	async removeMemberFromCard(
		cardId: string,
		userId: string,
		client: DatabaseClient = this.prismaService,
	) {
		return client.cardMembers.deleteMany({
			where: {
				cardId: cardId,
				userId: userId,
			},
		});
	}
}
