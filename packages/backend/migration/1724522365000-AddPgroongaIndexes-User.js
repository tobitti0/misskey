

export class AddPgroongaIndexesUser1724522365000 {
    name = 'AddPgroongaIndexesUser1724522365000'

    async up(queryRunner) {
				await queryRunner.query(`CREATE INDEX "IDX_065d4d8f3b5adb4a08841eae3c" ON "user" USING "pgroonga" ("name" pgroonga_varchar_full_text_search_ops_v2)`);
				await queryRunner.query(`CREATE INDEX "IDX_fcb770976ff8240af5799e3ffc" ON "user_profile" USING "pgroonga" ("description" pgroonga_varchar_full_text_search_ops_v2)`);
    }

    async down(queryRunner) {
			await queryRunner.query(`DROP INDEX "IDX_fcb770976ff8240af5799e3ffc"`);
			await queryRunner.query(`DROP INDEX "IDX_065d4d8f3b5adb4a08841eae3c"`);
    }

}
