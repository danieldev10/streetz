-- CreateEnum
CREATE TYPE "Sexuality" AS ENUM ('STRAIGHT', 'GAY', 'LESBIAN', 'BISEXUAL', 'PANSEXUAL', 'ASEXUAL', 'QUEER', 'PREFER_NOT_TO_SAY');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "sexuality" "Sexuality";
