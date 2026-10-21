import { z } from 'zod';

export const BoardsResponseDTOSchema = z.object({
	projectId: z.string(),
	id: z.string(),
	name: z.string(),
	description: z.string().optional(),
	background: z.string().optional(),
	status: z.string(),
	membersCount: z.number(),
	listsCount: z.number(),
});

export const UserBoardResponseDTOSchema = BoardsResponseDTOSchema.extend({
	roleId: z.string(),
	roleName: z.string(),
	projectName: z.string(),
	projectStatus: z.string(),
});
