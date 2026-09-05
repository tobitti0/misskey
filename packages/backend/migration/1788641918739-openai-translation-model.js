/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class OpenaiTranslationModel1788641918739 {
    name = 'OpenaiTranslationModel1788641918739';

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "openaiTranslationModel" character varying(128) NOT NULL DEFAULT 'gpt-5.4-mini'`);
    }

    async down(queryRunner) {
        await queryRunner.query('ALTER TABLE "meta" DROP COLUMN "openaiTranslationModel"');
    }
}
