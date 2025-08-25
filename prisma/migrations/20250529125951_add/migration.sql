-- CreateTable
CREATE TABLE `Advertisement` (
    `advertisementId` INTEGER NOT NULL AUTO_INCREMENT,
    `advertisementTitle` VARCHAR(191) NOT NULL,
    `advertisementImage` VARCHAR(191) NOT NULL,
    `redirectUrl` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `clickCount` INTEGER NOT NULL DEFAULT 0,
    `adLocation` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`advertisementId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
