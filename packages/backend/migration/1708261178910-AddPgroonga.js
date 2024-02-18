export class AddPgroonga1708261178910 {
    name = 'AddPgroonga1708261178910'

    async up(queryRunner) {
				await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgroonga;`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP EXTENSION pgroonga CASCADE;`);
    }

}
