/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class TranslationProviderSettings1788644532294 {
    name = 'TranslationProviderSettings1788644532294';

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "translationProvider" character varying(16) NOT NULL DEFAULT 'deepl'`);
        await queryRunner.query('ALTER TABLE "meta" ADD "openaiApiKey" character varying(1024)');
    }

    async down(queryRunner) {
        await queryRunner.query('ALTER TABLE "meta" DROP COLUMN "openaiApiKey"');
        await queryRunner.query('ALTER TABLE "meta" DROP COLUMN "translationProvider"');
    }
}
