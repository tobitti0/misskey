

export class AddPgroongaIndexesNote1708261178922 {
    name = 'AddPgroongaIndexesNote1708261178922'

    async up(queryRunner) {
        await queryRunner.query(`CREATE INDEX "IDX_f27f5d88941e57442be75ba9c8" ON "note" USING "pgroonga" ("text") `);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_f27f5d88941e57442be75ba9c8"`);
    }

}
