import crypto from "node:crypto";
const [secret, role] = process.argv.slice(2);
const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const h = b({ alg: "HS256", typ: "JWT" }), p = b({ role, iss: "supabase", iat: 1700000000, exp: 2000000000 });
process.stdout.write(`${h}.${p}.` + crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url"));
