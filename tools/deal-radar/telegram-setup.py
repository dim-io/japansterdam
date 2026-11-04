"""Bind a bot to the user's private chat; never save or print its token."""
import getpass
import json
import re
import secrets
import urllib.request


def main():
    token = getpass.getpass('Telegram-bottoken (blijft verborgen): ').strip()
    if not re.fullmatch(r'\d+:[A-Za-z0-9_-]+', token):
        raise ValueError('Dit lijkt geen bottoken.')

    def api(method, payload=None):
        req = urllib.request.Request(
            'https://api.telegram.org/bot' + token + '/' + method,
            data=json.dumps(payload or {}).encode(),
            headers={'Content-Type': 'application/json'},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                result = json.load(response)
        except Exception:
            raise ValueError('Telegram is niet bereikbaar of de botgegevens kloppen niet.') from None
        if not result.get('ok'):
            raise ValueError('Telegram heeft het verzoek niet bevestigd.')
        return result['result']

    username = api('getMe')['username']
    if api('getWebhookInfo').get('url'):
        raise ValueError('Deze bot heeft al een webhook. Gebruik een aparte radarbot.')
    nonce = secrets.token_hex(12)
    print('Open je eigen bot en druk op Start:')
    print(f'https://t.me/{username}?start={nonce}')
    input('Druk hier op Enter nadat je in Telegram op Start hebt gedrukt. ')
    updates = api('getUpdates', {'timeout': 15, 'allowed_updates': ['message']})
    messages = [u.get('message', {}) for u in updates]
    matches = [m for m in messages if m.get('text') == '/start ' + nonce and m.get('chat', {}).get('type') == 'private']
    if len(matches) != 1:
        raise ValueError('Geen unieke persoonlijke Start-bevestiging gevonden. Probeer de setup opnieuw.')
    chat_id = str(matches[0]['chat']['id'])
    api('sendMessage', {'chat_id': chat_id, 'text': 'Japansterdam-radar: Telegram is gekoppeld. De scanner wordt pas actief na het aansluiten van de advertentiefeed en het inschakelen van het uurschema.'})
    print('TELEGRAM_CHAT_ID=' + chat_id)
    print('Sla deze chat-ID en je bottoken op als GitHub Actions-secrets. Er is lokaal niets opgeslagen.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyboardInterrupt, EOFError) as error:
        print(str(error) or 'Setup afgebroken.')
        raise SystemExit(1)
