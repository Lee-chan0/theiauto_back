-- AlterTable
ALTER TABLE `Category` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- CreateTable
CREATE TABLE `SubscribeUserInfo` (
    `subscribeUserInfoId` VARCHAR(191) NOT NULL,
    `subscribeUserName` VARCHAR(191) NOT NULL,
    `subscribeUserEmail` VARCHAR(191) NOT NULL,
    `subscribeType` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SubscribeUserInfo_subscribeUserEmail_key`(`subscribeUserEmail`),
    PRIMARY KEY (`subscribeUserInfoId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
