-- DropForeignKey
ALTER TABLE `ArticleImage` DROP FOREIGN KEY `ArticleImage_ArticleId_fkey`;

-- DropForeignKey
ALTER TABLE `ArticleTag` DROP FOREIGN KEY `ArticleTag_articleId_fkey`;

-- DropIndex
DROP INDEX `ArticleImage_ArticleId_fkey` ON `ArticleImage`;

-- AddForeignKey
ALTER TABLE `ArticleImage` ADD CONSTRAINT `ArticleImage_ArticleId_fkey` FOREIGN KEY (`ArticleId`) REFERENCES `Article`(`articleId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ArticleTag` ADD CONSTRAINT `ArticleTag_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `Article`(`articleId`) ON DELETE CASCADE ON UPDATE CASCADE;
