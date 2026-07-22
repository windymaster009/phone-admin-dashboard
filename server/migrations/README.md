# Database migrations

Migration files are applied in filename order and recorded in the MongoDB
`phoneflow_migrations` collection.

Create new files with this format:

```text
YYYYMMDDNNNN-short-description.js
```

Every file must export:

```js
export const id = 'YYYYMMDDNNNN'
export const description = 'Describe the database change'

export async function up(db) {
  // Apply the change using the native MongoDB Db instance.
}

export async function down(db) {
  // Safely undo only what up() changed.
}
```

Never edit an applied migration. The runner stores a SHA-256 checksum and will
stop if an applied file changes. Add another migration for every later change.

Commands:

```bash
npm run migrate
npm run migrate:status
npm run migrate:down
```

`migrate:down` rolls back only the most recently applied migration.
