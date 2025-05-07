-- AlterTable
ALTER TABLE `Article` ADD COLUMN `articleStatus` VARCHAR(191) NOT NULL DEFAULT 'publish',
    ADD COLUMN `publishedAt` DATETIME(3) NULL;
