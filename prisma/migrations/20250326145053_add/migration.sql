-- CreateTable
CREATE TABLE `ArticleContentTempStorage` (
    `articleContentTempStorageId` INTEGER NOT NULL AUTO_INCREMENT,
    `uploadedBy` VARCHAR(191) NOT NULL,
    `imageUrls` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`articleContentTempStorageId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
