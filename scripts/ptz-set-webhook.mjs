// One-time (or after rotating the secret) setup: registers the Telegram
// webhook for the PTZ Analytics bot. Run with:
//   node scripts/ptz-set-webhook.mjs
// Requires PTZ_BOT_TOKEN, PTZ_BOT_WEBHOOK_SECRET and NEXT_PUBLIC_SITE_URL
// to already be set in the environment (e.g. `set -a; source .env.local; set +a`).

const token = process.env.PTZ_BOT_TOKEN;
const secret = process.env.PTZ_BOT_WEBHOOK_SECRET;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hazorasp-textil.uz";

if (!token) {
  console.error("PTZ_BOT_TOKEN is not set.");
  process.exit(1);
}

const webhookUrl = `${siteUrl.replace(/\/$/, "")}/api/ptz-bot/webhook`;

const params = new URLSearchParams({ url: webhookUrl });
if (secret) params.set("secret_token", secret);

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook?${params.toString()}`);
const data = await res.json();

console.log(JSON.stringify(data, null, 2));
if (!data.ok) process.exit(1);

console.log(`\nWebhook registered: ${webhookUrl}`);

// Command list behind Telegram's "Menu" button (the bot also shows a bottom keyboard with the same actions).
const commands = [
  { command: "start", description: "Янги ҳисобот (4 та файл юбориш)" },
  { command: "report", description: "Охирги ҳисобот: Excel + PDF" },
  { command: "dashboard", description: "Вақтинчалик web dashboard ҳаволаси" },
  { command: "today", description: "Бугунги қисқа хулоса" },
  { command: "farmers", description: "Бугун топширган фермерлар" },
  { command: "payments", description: "Тўловлар ва РКП қолдиқлари" },
  { command: "shipments", description: "Отгрузка" },
  { command: "status", description: "Тизим ҳолати" },
  { command: "cancel", description: "Жорий сессияни бекор қилиш" },
  { command: "help", description: "Ёрдам" },
  { command: "settings", description: "Созламалар (админ)" }
];
const cmdRes = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ commands })
});
const cmdData = await cmdRes.json();
console.log(cmdData.ok ? `Menu commands registered (${commands.length}).` : `setMyCommands failed: ${JSON.stringify(cmdData)}`);
if (!secret) {
  console.warn("Warning: PTZ_BOT_WEBHOOK_SECRET is not set — anyone who finds this URL could send fake updates.");
}
