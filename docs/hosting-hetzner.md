# Hetzner Hosting

## Recommended shape

- 1 small Ubuntu VM for the web app
- 1 attached volume if you expect lots of uploaded books and generated audio
- Optional GPU machine if you want faster Chatterbox generation for long books

## Server packages

```bash
sudo apt update
sudo apt install -y git ffmpeg nginx python3 python3-venv python3-pip
```

Install Node.js 20+ with your preferred method, then:

```bash
git clone https://github.com/Andrew21P/LinguaTalesWeb.git
cd LinguaTalesWeb
npm install
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements.txt
cp .env.example .env
npm start
```

## Reverse proxy

Point Nginx to `http://127.0.0.1:3000` and keep Node on a private port.

## Process management

Use the provided systemd unit:

- [deploy/linguatales.service](/Users/andre/LinguaTales/deploy/linguatales.service)

Copy it into `/etc/systemd/system/`, update `WorkingDirectory`, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable linguatales
sudo systemctl start linguatales
```

## Translation in production

For a real hosted version, prefer a self-hosted LibreTranslate instance and set:

```bash
LIBRETRANSLATE_URL=http://127.0.0.1:5000
LIBRETRANSLATE_API_KEY=
```

The default Google web translation path is much stronger than the old MyMemory fallback for prose, but for a serious hosted deployment you should still prefer a self-hosted translator you control.
