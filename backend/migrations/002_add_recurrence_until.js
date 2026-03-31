exports.up = async function(knex) {
  await knex.schema.alterTable('reminders', table => {
    table.timestamp('recurrence_until').nullable()
  })
}
exports.down = async function(knex) {
  await knex.schema.alterTable('reminders', table => {
    table.dropColumn('recurrence_until')
  })
}
