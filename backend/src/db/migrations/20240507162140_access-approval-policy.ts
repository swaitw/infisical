import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AccessApprovalPolicy))) {
    await knex.schema.createTable(TableName.AccessApprovalPolicy, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.integer("approvals").defaultTo(1).notNullable();
      t.string("secretPath");

      t.uuid("envId").notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.AccessApprovalPolicy);
  }

  if (!(await knex.schema.hasTable(TableName.AccessApprovalPolicyApprover))) {
    await knex.schema.createTable(TableName.AccessApprovalPolicyApprover, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("approverId").notNullable();
      t.foreign("approverId").references("id").inTable(TableName.ProjectMembership).onDelete("CASCADE");

      t.uuid("policyId").notNullable();
      t.foreign("policyId").references("id").inTable(TableName.AccessApprovalPolicy).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.AccessApprovalPolicyApprover);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.AccessApprovalPolicyApprover);
  await knex.schema.dropTableIfExists(TableName.AccessApprovalPolicy);

  await dropOnUpdateTrigger(knex, TableName.AccessApprovalPolicyApprover);
  await dropOnUpdateTrigger(knex, TableName.AccessApprovalPolicy);
}
