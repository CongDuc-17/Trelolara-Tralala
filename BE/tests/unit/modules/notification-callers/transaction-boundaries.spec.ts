import { cardFixture } from '../cards/cards.fixture';

describe('Card assignment notification transaction boundary', () => {
	it('persists assignment and notification before delivery', async () => {
		const f = cardFixture();
		f.socket.emitNewNotification.mockImplementation(() => {
			expect(f.events).toContain('1:commit');
		});
		await f.service.addMemberToCard('card', 'recipient', 'actor');
		expect(f.state().assignments).toHaveLength(1);
		expect(f.state().notifications).toHaveLength(1);
		expect(f.root.$transaction).toHaveBeenCalledTimes(1);
	});
	it.each(['notification', 'commit'] as const)(
		'suppresses delivery and rolls back on %s failure',
		async (failure) => {
			const f = cardFixture();
			f.failures[failure] = true;
			await expect(
				f.service.addMemberToCard('card', 'recipient', 'actor'),
			).rejects.toThrow();
			expect(f.state().assignments).toEqual([]);
			expect(f.socket.emitNewNotification).not.toHaveBeenCalled();
		},
	);
});
