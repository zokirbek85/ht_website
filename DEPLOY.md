# VPS deployment

The application deploys from the `main` branch through `.github/workflows/deploy.yml`.

## One-time VPS setup

After the deployment commit is available on GitHub, connect to the VPS and run:

```bash
git clone --branch main https://github.com/zokirbek85/ht_website.git /tmp/hazorasp-textil
cd /tmp/hazorasp-textil
sudo REPO_URL=https://github.com/zokirbek85/ht_website.git BRANCH=main bash deploy/setup-vps.sh
```

Create production secrets on the VPS. Do not commit this file:

```bash
sudo nano /var/www/hazorasp-textil/.env.local
```

Required values:

```dotenv
ADMIN_PASSWORD=choose-a-production-password
ADMIN_SESSION_SECRET=generate-a-long-random-secret
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id
```

Then restart the service:

```bash
sudo systemctl restart hazorasp-textil
```

## PTZ Analytics setup (Telegram bot + dashboard)

See `docs/ptz-architecture.md` for the full design. Quick setup:

1. **Check the VPS Node version first**: `node -v` must be **22.5 or newer** (24+ recommended) — the module
   uses the built-in `node:sqlite`, which doesn't exist on older Node. Upgrade Node on the VPS before
   deploying this feature if it's older.
2. Create a **separate** Telegram bot via [@BotFather](https://t.me/BotFather) — do not reuse the existing
   contact-form bot/token.
3. Add to `/var/www/hazorasp-textil/.env.local`:

   ```dotenv
   PTZ_BOT_TOKEN=your-new-bot-token
   PTZ_BOT_WEBHOOK_SECRET=generate-a-long-random-secret
   PTZ_ADMIN_TELEGRAM_IDS=123456789
   ```

   (`PTZ_ADMIN_TELEGRAM_IDS` bootstraps the first admin — get a numeric Telegram ID by having that person
   message [@userinfobot](https://t.me/userinfobot). Additional users can be added later at `/admin/ptz`.)
4. Restart the service, then register the webhook once (from the VPS, so it reads the same `.env.local`):

   ```bash
   sudo systemctl restart hazorasp-textil
   cd /var/www/hazorasp-textil
   set -a; source .env.local; set +a
   npm run ptz:set-webhook
   ```
5. Message the bot with `/start`, then send it an `.xlsx` report to test.

The SQLite database, uploaded Excel files and generated PDFs live under `data/ptz/` — untracked by git
(see `.gitignore`) so `git reset --hard` on every deploy never touches them, but **make sure your VPS
backup job includes `/var/www/hazorasp-textil/data/ptz/`** — it is the only copy of the import history.

## GitHub Actions SSH access

Create a dedicated Ed25519 key locally without a passphrase for the deploy automation:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/hazorasp_deploy -C "github-actions-hazorasp"
```

Install the public key on the VPS. This command asks for the VPS password once:

```bash
ssh-copy-id -i ~/.ssh/hazorasp_deploy.pub root@189.74.98.19
```

Add these repository secrets in GitHub at **Settings > Secrets and variables > Actions**:

- `VPS_HOST`: `189.74.98.19`
- `VPS_USER`: `root`
- `VPS_SSH_KEY`: contents of `~/.ssh/hazorasp_deploy`

After that, every push to `main` runs the production deploy automatically. The domain DNS A record must point `hazorasp-textil.uz` and `www.hazorasp-textil.uz` to `189.74.98.19`. Add HTTPS with Certbot after HTTP is working:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d hazorasp-textil.uz -d www.hazorasp-textil.uz
```
