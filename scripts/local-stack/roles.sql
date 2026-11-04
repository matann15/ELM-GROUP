create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password 'authpw';
grant anon, authenticated, service_role to authenticator;
create role supabase_auth_admin login createrole password 'gotruepw';
create role supabase_admin login superuser password 'adminpw';
create role dashboard_user nologin;
