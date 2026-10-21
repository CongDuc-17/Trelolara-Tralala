export type InvitationScope = 'project' | 'board';
export type InvitationType = 'EMAIL' | 'LINK';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED';
export interface InvitationRecord {
	id: string;
	projectId: string | null;
	boardId: string | null;
	email: string | null;
	roleId: string;
	token: string;
	type: InvitationType;
	status: InvitationStatus;
	createdBy: string;
	createdAt: Date;
	expiresAt: Date;
	acceptedAt: Date | null;
}
export interface InvitationTarget {
	scope: InvitationScope;
	id: string;
	name: string;
	status: string;
	deletedAt: Date | null;
	project?: { status: string; deletedAt: Date | null };
}
export interface InvitationDelivery {
	email: 'SENT' | 'FAILED' | 'NOT_APPLICABLE';
	notification: 'SENT' | 'FAILED' | 'NOT_APPLICABLE';
}
export interface InvitationView {
	id: string;
	token: string;
	email: string;
	projectId?: string;
	boardId?: string;
	roleId: string;
	inviterId: string;
	type: InvitationType;
	status: InvitationStatus;
	expiresAt: Date;
	delivery: InvitationDelivery;
	shareUrl?: string;
}
export interface InvitationUser {
	id: string;
	name: string;
	email: string;
	verify: boolean;
	status: string;
	deletedAt: Date | null;
}
export interface InvitationRole {
	id: string;
	name: string;
	status: string;
	deletedAt: Date | null;
}
