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
```

Then restart the service:

```bash
sudo systemctl restart hazorasp-textil
```

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
