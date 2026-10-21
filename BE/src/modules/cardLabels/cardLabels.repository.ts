import { prisma as database, type DatabaseClient } from '../database';
export class CardLabelsRepository {
	constructor(private readonly prismaService: DatabaseClient = database) {}

	async addLabelToCard(
		cardId: string,
		labelId: string,
		client: DatabaseClient = this.prismaService,
	) {
		return client.cardLabels.create({
			data: {
				cardId: cardId,
				labelId: labelId,
			},
		});
	}

	async findLabelOnCard(
		cardId: string,
		labelId: string,
		client: DatabaseClient = this.prismaService,
	) {
		return client.cardLabels.findFirst({
			where: {
				cardId: cardId,
				labelId: labelId,
			},
		});
	}
	async removeLabelFromCard(
		cardId: string,
		labelId: string,
		client: DatabaseClient = this.prismaService,
	) {
		return client.cardLabels.deleteMany({
			where: {
				cardId: cardId,
				labelId: labelId,
			},
		});
	}
}
