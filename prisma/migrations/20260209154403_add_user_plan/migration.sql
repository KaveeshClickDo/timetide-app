-- CreateEnum
CREATE TYPE "UserPlan" AS ENUM ('FREE', 'PRO', 'TEAM');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "plan" "UserPlan" NOT NULL DEFAULT 'FREE';
