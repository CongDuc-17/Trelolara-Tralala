import { z } from 'zod';

export class NewBoardMemberDto {
	id: string;
	// userId: string;
	// accepted: boolean;
	user: {
		id: string;
		name: string;
		email: string;
		avatar: string | null;
	};
	role: {
		id: string;
		name: string;
	};

	constructor(data: any) {
		this.id = data.id;
		// this.userId = data.userId;
		// this.accepted = data.accepted;
		this.user = {
			id: data.user.id,
			name: data.user.name,
			email: data.user.email,
			avatar: data.user.avatar,
		};
		this.role = {
			id: data.role.id,
			name: data.role.name,
		};
	}
}

export class BoardsResponseDto {
	projectId: string;
	id: string;
	name: string;
	description?: string;
	background?: string;
	status: string;
	membersCount: number;
	listsCount: number;

	constructor(data: {
		projectId: string;
		id: string;
		name: string;
		description?: string;
		background?: string;
		status: string;
		_count?: {
			members: number;
			lists: number;
		};
	}) {
		this.projectId = data.projectId;
		this.id = data.id;
		this.name = data.name;
		this.description = data.description;
		this.background = data.background;
		this.status = data.status;
		this.membersCount = data._count?.members ?? 0;
		this.listsCount = data._count?.lists ?? 0;
	}
}

export class UserBoardResponseDto extends BoardsResponseDto {
	roleId: string;
	roleName: string;
	projectName: string;
	projectStatus: string;

	constructor(data: {
		projectId: string;
		projectName: string;
		projectStatus: string;
		id: string;
		name: string;
		description?: string;
		background?: string;
		status: string;
		roleId: string;
		roleName: string;
		_count?: {
			members: number;
			lists: number;
		};
	}) {
		super(data);
		this.roleId = data.roleId;
		this.roleName = data.roleName;
		this.projectName = data.projectName;
		this.projectStatus = data.projectStatus;
	}
}

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
