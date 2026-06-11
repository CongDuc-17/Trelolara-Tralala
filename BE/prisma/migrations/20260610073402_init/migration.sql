-- CreateEnum
CREATE TYPE "UserStatusEnum" AS ENUM ('active', 'locked');

-- CreateEnum
CREATE TYPE "RoleStatusEnum" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "PermissionStatusEnum" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "ProjectStatusEnum" AS ENUM ('active', 'archived', 'deleted');

-- CreateEnum
CREATE TYPE "BoardStatusEnum" AS ENUM ('active', 'archived', 'deleted');

-- CreateEnum
CREATE TYPE "ListStatusEnum" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "CardStatusEnum" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "InvitationStatusEnum" AS ENUM ('pending', 'accepted', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "InvitationTypeEnum" AS ENUM ('email', 'link');

-- CreateEnum
CREATE TYPE "NotificationTypeEnum" AS ENUM ('BOARD_INVITED', 'PROJECT_INVITED', 'CARD_ASSIGNED', 'CARD_COMMENTED', 'CARD_DUE_SOON');

-- CreateEnum
CREATE TYPE "NotificationEntityTypeEnum" AS ENUM ('PROJECT', 'BOARD', 'CARD', 'INVITATION');

-- CreateTable
CREATE TABLE "Users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "address" TEXT,
    "avatar" TEXT,
    "verify" BOOLEAN NOT NULL DEFAULT false,
    "status" "UserStatusEnum" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "salt" TEXT NOT NULL,

    CONSTRAINT "Accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Social_Accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "google_id" TEXT NOT NULL,
    "google_access_token" TEXT NOT NULL,
    "google_refresh_token" TEXT NOT NULL,

    CONSTRAINT "Social_Accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Otps" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "otp" CHAR(6) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Email_Verifications" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" CHAR(6) NOT NULL,
    "token" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Email_Verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Users_Roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    CONSTRAINT "Users_Roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Roles" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "status" "RoleStatusEnum" NOT NULL DEFAULT 'active',

    CONSTRAINT "Roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Roles_Permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "Roles_Permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permissions" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "Permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "status" "ProjectStatusEnum" NOT NULL DEFAULT 'active',

    CONSTRAINT "Projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project_Members" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_Members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Boards" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "status" "BoardStatusEnum" NOT NULL DEFAULT 'active',
    "background" TEXT,

    CONSTRAINT "Boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Board_Members" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Board_Members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lists" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "status" "ListStatusEnum" NOT NULL DEFAULT 'active',

    CONSTRAINT "Lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cards" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "list_id" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "status" "CardStatusEnum" NOT NULL DEFAULT 'active',
    "is_complete" BOOLEAN NOT NULL DEFAULT false,
    "background" TEXT,
    "due_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "Cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card_Members" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "Card_Members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Labels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card_Labels" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "label_id" TEXT NOT NULL,

    CONSTRAINT "Card_Labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checklists" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checklist_Items" (
    "id" TEXT NOT NULL,
    "checklist_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Checklist_Items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card_Comments" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_Comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card_Attachments" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Card_Attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card_Activity" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Card_Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "board_id" TEXT,
    "email" TEXT,
    "role_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "type" "InvitationTypeEnum" NOT NULL DEFAULT 'email',
    "status" "InvitationStatusEnum" NOT NULL DEFAULT 'pending',
    "created_by" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),

    CONSTRAINT "Invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "type" "NotificationTypeEnum" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "entity_type" "NotificationEntityTypeEnum",
    "entity_id" TEXT,
    "metadata" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Users_email_key" ON "Users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Accounts_user_id_key" ON "Accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Social_Accounts_user_id_key" ON "Social_Accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Social_Accounts_google_id_key" ON "Social_Accounts"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "Tokens_refresh_token_key" ON "Tokens"("refresh_token");

-- CreateIndex
CREATE UNIQUE INDEX "Otps_user_id_key" ON "Otps"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Email_Verifications_token_key" ON "Email_Verifications"("token");

-- CreateIndex
CREATE INDEX "Email_Verifications_email_idx" ON "Email_Verifications"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Users_Roles_user_id_role_id_key" ON "Users_Roles"("user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "Roles_name_key" ON "Roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Roles_Permissions_role_id_permission_id_key" ON "Roles_Permissions"("role_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "Permissions_name_key" ON "Permissions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Project_Members_project_id_user_id_key" ON "Project_Members"("project_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Board_Members_user_id_board_id_key" ON "Board_Members"("user_id", "board_id");

-- CreateIndex
CREATE UNIQUE INDEX "Card_Members_card_id_user_id_key" ON "Card_Members"("card_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Labels_board_id_name_key" ON "Labels"("board_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Card_Labels_card_id_label_id_key" ON "Card_Labels"("card_id", "label_id");

-- CreateIndex
CREATE UNIQUE INDEX "Invitations_token_key" ON "Invitations"("token");

-- CreateIndex
CREATE INDEX "Invitations_email_status_idx" ON "Invitations"("email", "status");

-- CreateIndex
CREATE INDEX "Notifications_user_id_is_read_created_at_idx" ON "Notifications"("user_id", "is_read", "created_at");

-- CreateIndex
CREATE INDEX "Notifications_user_id_created_at_idx" ON "Notifications"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "Accounts" ADD CONSTRAINT "Accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Social_Accounts" ADD CONSTRAINT "Social_Accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tokens" ADD CONSTRAINT "Tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Otps" ADD CONSTRAINT "Otps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Users_Roles" ADD CONSTRAINT "Users_Roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Users_Roles" ADD CONSTRAINT "Users_Roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roles_Permissions" ADD CONSTRAINT "Roles_Permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roles_Permissions" ADD CONSTRAINT "Roles_Permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "Permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project_Members" ADD CONSTRAINT "Project_Members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project_Members" ADD CONSTRAINT "Project_Members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project_Members" ADD CONSTRAINT "Project_Members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boards" ADD CONSTRAINT "Boards_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Board_Members" ADD CONSTRAINT "Board_Members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Board_Members" ADD CONSTRAINT "Board_Members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Board_Members" ADD CONSTRAINT "Board_Members_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "Boards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lists" ADD CONSTRAINT "Lists_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "Boards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cards" ADD CONSTRAINT "Cards_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "Lists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card_Members" ADD CONSTRAINT "Card_Members_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card_Members" ADD CONSTRAINT "Card_Members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Labels" ADD CONSTRAINT "Labels_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "Boards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card_Labels" ADD CONSTRAINT "Card_Labels_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card_Labels" ADD CONSTRAINT "Card_Labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "Labels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checklists" ADD CONSTRAINT "Checklists_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checklist_Items" ADD CONSTRAINT "Checklist_Items_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "Checklists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card_Comments" ADD CONSTRAINT "Card_Comments_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card_Comments" ADD CONSTRAINT "Card_Comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card_Attachments" ADD CONSTRAINT "Card_Attachments_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card_Attachments" ADD CONSTRAINT "Card_Attachments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card_Activity" ADD CONSTRAINT "Card_Activity_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card_Activity" ADD CONSTRAINT "Card_Activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitations" ADD CONSTRAINT "Invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitations" ADD CONSTRAINT "Invitations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitations" ADD CONSTRAINT "Invitations_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "Boards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notifications" ADD CONSTRAINT "Notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
