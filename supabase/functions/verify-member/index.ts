// Checks that the signed-in player is in the Tismtopia Discord server and records the answer in public.members.
// The game calls this right after a Discord sign-in, passing the Discord access token Supabase handed it (scope: guilds).
// The row can only be written here (service role), so a player cannot mark themselves a member.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GUILD = "732002076556787752"; // Tismtopia
const ORIGINS = ["https://dingodevyt.github.io", "http://localhost:8123"];
const cors = (req: Request) => {
  const o = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};
const reply = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
const discord = (path: string, token: string) =>
  fetch("https://discord.com/api/v10" + path, { headers: { Authorization: "Bearer " + token } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return reply(req, 405, { error: "POST only" });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: who, error: whoErr } = await admin.auth.getUser(jwt);
    if (whoErr || !who?.user) return reply(req, 401, { error: "Not signed in" });
    const user = who.user;
    const discordId = user.identities?.find((i) => i.provider === "discord")?.id
      ?? (user.user_metadata?.provider_id as string | undefined);
    if (!discordId) return reply(req, 403, { member: false, error: "Not a Discord account" });

    const body = await req.json().catch(() => ({}));
    const token = typeof body?.provider_token === "string" ? body.provider_token : "";
    if (!token || token.length > 400) return reply(req, 400, { error: "Missing Discord token" });

    // The token must belong to the same Discord account that is signed in here (not somebody else's token).
    const me = await discord("/users/@me", token);
    if (!me.ok) return reply(req, 401, { error: "Discord token rejected" });
    if (String((await me.json()).id) !== String(discordId)) return reply(req, 403, { member: false, error: "Token is for another account" });

    const guilds = await discord("/users/@me/guilds?limit=200", token);
    if (!guilds.ok) return reply(req, 502, { error: "Could not read Discord servers" });
    const list = await guilds.json();
    const member = Array.isArray(list) && list.some((g: { id?: string }) => g?.id === GUILD);

    if (member) {
      const { error } = await admin.from("members").upsert({ user_id: user.id, discord_id: String(discordId), verified_at: new Date().toISOString() });
      if (error) return reply(req, 500, { error: "Could not save membership" });
    } else {
      await admin.from("members").delete().eq("user_id", user.id);
    }
    return reply(req, 200, { member });
  } catch (_e) {
    return reply(req, 500, { error: "Unexpected error" });
  }
});
