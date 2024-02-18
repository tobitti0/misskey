

export class AddPgroongaIndexesCW1708261701760 {
    name = 'AddPgroongaIndexesCW1708261701760'

    async up(queryRunner) {
        await queryRunner.query(`CREATE INDEX "IDX_5077ad89c766ffec81492d7afd" ON "note" USING "pgroonga" ("cw" pgroonga_varchar_full_text_search_ops_v2 ) `);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_5077ad89c766ffec81492d7afd"`);
    }

}
