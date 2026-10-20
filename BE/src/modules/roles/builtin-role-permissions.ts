import {
	AdminPermissionEnum,
	BoardPermissionEnum,
	CardPermissionEnum,
	ListPermissionEnum,
	ProjectPermissionEnum,
	UserPermissionEnum,
} from '../../common/enums/permissions';
import { BoardRoleEnum, ProjectRoleEnum, UserRoleEnum } from '../../common/enums/roles';

export const BUILTIN_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
	[UserRoleEnum.ADMIN]: [
		...Object.values(AdminPermissionEnum),
		...Object.values(UserPermissionEnum),
		...Object.values(ProjectPermissionEnum),
		...Object.values(BoardPermissionEnum),
		...Object.values(ListPermissionEnum),
		...Object.values(CardPermissionEnum),
	],
	[UserRoleEnum.USER]: [
		ProjectPermissionEnum.CREATE_PROJECT,
		ProjectPermissionEnum.GET_PROJECT,
	],
	[ProjectRoleEnum.PROJECT_ADMIN]: [
		...Object.values(ProjectPermissionEnum),
		...Object.values(BoardPermissionEnum),
		...Object.values(ListPermissionEnum),
		...Object.values(CardPermissionEnum),
	],
	[ProjectRoleEnum.PROJECT_MEMBER]: [
		ProjectPermissionEnum.GET_PROJECT,
		ProjectPermissionEnum.CREATE_PROJECT,
		ProjectPermissionEnum.INVITE_MEMBER,
		BoardPermissionEnum.CREATE_BOARD,
		BoardPermissionEnum.GET_BOARD,
		...Object.values(ListPermissionEnum),
		...Object.values(CardPermissionEnum),
	],
	[ProjectRoleEnum.PROJECT_VIEWER]: [
		ProjectPermissionEnum.GET_PROJECT,
		BoardPermissionEnum.GET_BOARD,
		ListPermissionEnum.GET_LIST,
		CardPermissionEnum.GET_CARD,
	],
	[BoardRoleEnum.BOARD_ADMIN]: [
		...Object.values(BoardPermissionEnum),
		...Object.values(ListPermissionEnum),
		...Object.values(CardPermissionEnum),
	],
	[BoardRoleEnum.BOARD_MEMBER]: [
		BoardPermissionEnum.GET_BOARD,
		BoardPermissionEnum.INVITE_MEMBER,
		...Object.values(ListPermissionEnum),
		...Object.values(CardPermissionEnum),
	],
	[BoardRoleEnum.BOARD_VIEWER]: [
		BoardPermissionEnum.GET_BOARD,
		ListPermissionEnum.GET_LIST,
		CardPermissionEnum.GET_CARD,
	],
};

export const BUILTIN_PERMISSION_NAMES = [
	...new Set(Object.values(BUILTIN_ROLE_PERMISSIONS).flat()),
];
