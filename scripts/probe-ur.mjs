import pg from "pg";
import { readFileSync } from "node:fs";
const url = readFileSync(".env","utf8").match(/^DATABASE_URL=(.*)$/m)[1].replace(/sslmode=[^&]*/,"");
const c = new pg.Client({connectionString:url, ssl:{rejectUnauthorized:false}});
await c.connect();
const r = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='user_roles' ORDER BY ordinal_position");
console.log(r.rows.map(x=>x.column_name).join(","));
await c.end();
