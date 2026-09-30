from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import re
import secrets
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from uuid import uuid4

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get('SIMTRADE_DB', ROOT / 'simtrade-python.sqlite'))
HOST = os.environ.get('HOST', '127.0.0.1')
PORT = int(os.environ.get('PORT', '4173'))
INITIAL_BALANCE = 1000.0
SESSION_LIFETIME = 7 * 24 * 60 * 60
COOKIE_NAME = 'simtrade_session'
ADMIN_CODE_HASH = '666eb03d334a5fc2a1dca9e8e1adee6fc4863a45b6f6e4be7c1d30da096928ac'
QUOTE_TTL = 30
QUOTE_LOCK = threading.Lock()
RATE_LOCK = threading.Lock()
QUOTE_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
AUTH_ATTEMPTS: dict[str, tuple[float, int]] = {}
ASSET_SEEDS = [
    {'symbol': 'AAPL', 'name': 'Apple Inc.', 'type': 'ACTION'},
    {'symbol': 'MSFT', 'name': 'Microsoft Corporation', 'type': 'ACTION'},
    {'symbol': 'NVDA', 'name': 'NVIDIA Corporation', 'type': 'ACTION'},
    {'symbol': 'AMZN', 'name': 'Amazon.com, Inc.', 'type': 'ACTION'},
    {'symbol': 'TSLA', 'name': 'Tesla, Inc.', 'type': 'ACTION'},
    {'symbol': 'SPY', 'name': 'SPDR S&P 500 ETF', 'type': 'ETF'},
    {'symbol': 'BTC-USD', 'name': 'Bitcoin / USD', 'type': 'CRYPTO'},
    {'symbol': 'ETH-USD', 'name': 'Ethereum / USD', 'type': 'CRYPTO'},
    {'symbol': 'BNB-USD', 'name': 'BNB', 'type': 'CRYPTO'},
    {'symbol': 'XRP-USD', 'name': 'XRP', 'type': 'CRYPTO'},
    {'symbol': 'SOL-USD', 'name': 'Solana', 'type': 'CRYPTO'},
    {'symbol': 'ADA-USD', 'name': 'Cardano', 'type': 'CRYPTO'},
    {'symbol': 'DOGE-USD', 'name': 'Dogecoin', 'type': 'CRYPTO'},
    {'symbol': 'DOT-USD', 'name': 'Polkadot', 'type': 'CRYPTO'},
    {'symbol': 'LTC-USD', 'name': 'Litecoin', 'type': 'CRYPTO'},
    {'symbol': 'BCH-USD', 'name': 'Bitcoin Cash', 'type': 'CRYPTO'},
    {'symbol': 'LINK-USD', 'name': 'Chainlink', 'type': 'CRYPTO'},
    {'symbol': 'AVAX-USD', 'name': 'Avalanche', 'type': 'CRYPTO'},
    {'symbol': 'TRX-USD', 'name': 'TRON', 'type': 'CRYPTO'},
    {'symbol': 'SHIB-USD', 'name': 'Shiba Inu', 'type': 'CRYPTO'},
    {'symbol': 'XLM-USD', 'name': 'Stellar', 'type': 'CRYPTO'},
    {'symbol': 'ATOM-USD', 'name': 'Cosmos Hub', 'type': 'CRYPTO'},
    {'symbol': 'UNI-USD', 'name': 'Uniswap', 'type': 'CRYPTO'},
    {'symbol': 'ETC-USD', 'name': 'Ethereum Classic', 'type': 'CRYPTO'},
    {'symbol': 'ICP-USD', 'name': 'Internet Computer', 'type': 'CRYPTO'},
    {'symbol': 'FIL-USD', 'name': 'Filecoin', 'type': 'CRYPTO'},
    {'symbol': 'NEAR-USD', 'name': 'NEAR Protocol', 'type': 'CRYPTO'},
    {'symbol': 'APT-USD', 'name': 'Aptos', 'type': 'CRYPTO'},
    {'symbol': 'OP-USD', 'name': 'Optimism', 'type': 'CRYPTO'},
    {'symbol': 'ARB-USD', 'name': 'Arbitrum', 'type': 'CRYPTO'},
    {'symbol': 'HBAR-USD', 'name': 'Hedera', 'type': 'CRYPTO'},
    {'symbol': 'VET-USD', 'name': 'VeChain', 'type': 'CRYPTO'},
    {'symbol': 'ALGO-USD', 'name': 'Algorand', 'type': 'CRYPTO'},
    {'symbol': 'AAVE-USD', 'name': 'Aave', 'type': 'CRYPTO'},
]


class ApiError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


def connect_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=10, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute('PRAGMA foreign_keys = ON')
    return connection


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect_db() as connection:
        connection.executescript('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                is_public INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS market_assets (
                symbol TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS wallets (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                cash_available REAL NOT NULL,
                cash_reserved REAL NOT NULL DEFAULT 0,
                currency TEXT NOT NULL DEFAULT 'EUR'
            );
            CREATE TABLE IF NOT EXISTS positions (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                symbol TEXT NOT NULL,
                quantity REAL NOT NULL,
                average_entry_price REAL NOT NULL,
                realized_pnl REAL NOT NULL DEFAULT 0,
                total_fees REAL NOT NULL DEFAULT 0,
                PRIMARY KEY (user_id, symbol)
            );
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                type TEXT NOT NULL,
                quantity REAL NOT NULL,
                trigger_price REAL,
                status TEXT NOT NULL,
                reserved REAL NOT NULL DEFAULT 0,
                fill_price REAL,
                fee REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                filled_at TEXT
            );
            CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id, created_at DESC);
            CREATE TABLE IF NOT EXISTS trades (
                id TEXT PRIMARY KEY,
                order_id TEXT NOT NULL REFERENCES orders(id),
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                quantity REAL NOT NULL,
                execution_price REAL NOT NULL,
                gross_value REAL NOT NULL,
                fee REAL NOT NULL,
                pnl REAL NOT NULL DEFAULT 0,
                executed_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS trades_user_idx ON trades(user_id, executed_at DESC);
            CREATE TABLE IF NOT EXISTS follows (
                follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                followed_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (follower_id, followed_id),
                CHECK (follower_id != followed_id)
            );
            CREATE INDEX IF NOT EXISTS follows_followed_idx ON follows(followed_id, created_at DESC);
            CREATE TABLE IF NOT EXISTS ledger_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                type TEXT NOT NULL,
                amount REAL NOT NULL,
                balance_before REAL NOT NULL,
                balance_after REAL NOT NULL,
                reference_id TEXT,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
        ''')
        user_columns = {row['name'] for row in connection.execute('PRAGMA table_info(users)')}
        if 'is_public' not in user_columns:
            connection.execute('ALTER TABLE users ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0')
        session_columns = {row['name'] for row in connection.execute('PRAGMA table_info(sessions)')}
        if 'is_admin' not in session_columns:
            connection.execute('ALTER TABLE sessions ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0')
        connection.executemany(
            'INSERT OR IGNORE INTO market_assets (symbol, name, type) VALUES (?, ?, ?)',
            [(item['symbol'], item['name'], item['type']) for item in ASSET_SEEDS],
        )


def get_assets() -> list[dict[str, str]]:
    with connect_db() as connection:
        rows = connection.execute(
            'SELECT symbol, name, type FROM market_assets WHERE enabled = 1 ORDER BY type, name'
        ).fetchall()
    return [{'symbol': row['symbol'], 'name': row['name'], 'type': row['type']} for row in rows]


def configure_logging() -> None:
    log_dir = Path(os.environ.get('SIMTRADE_LOG_DIR', ROOT / 'logs'))
    log_dir.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s %(levelname)s %(message)s',
        handlers=[logging.FileHandler(log_dir / 'server.log', encoding='utf-8'), logging.StreamHandler()],
        force=True,
    )


def digest(value: str) -> str:
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def password_digest(password: str, salt_hex: str) -> str:
    password_bytes = password.encode('utf-8')
    salt = bytes.fromhex(salt_hex)
    return hashlib.scrypt(password_bytes, salt=salt, n=2**14, r=8, p=1, dklen=64).hex()


def client_user(user: sqlite3.Row | dict[str, Any], is_admin: bool | None = None) -> dict[str, Any]:
    try:
        session_admin = bool(user['is_admin'])
    except (IndexError, KeyError):
        session_admin = False
    return {
        'id': user['id'], 'email': user['email'], 'displayName': user['display_name'],
        'isPublic': bool(user['is_public']), 'isAdmin': session_admin if is_admin is None else is_admin,
    }


def add_ledger(connection: sqlite3.Connection, user_id: int, entry_type: str, amount: float,
               before: float, after: float, reference_id: str | None = None) -> None:
    connection.execute('''
        INSERT INTO ledger_entries (user_id, type, amount, balance_before, balance_after, reference_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (user_id, entry_type, amount, before, after, reference_id, time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())))


def fee_for(gross: float) -> float:
    return max(1.0, gross * 0.001)


def quantity_from_eur(amount: float, unit_price: float) -> float:
    if not math.isfinite(amount) or not math.isfinite(unit_price) or amount <= 0 or unit_price <= 0:
        raise ApiError(400, 'Montant EUR ou cours invalide.')
    return math.floor((amount / unit_price) * 100_000_000) / 100_000_000


def yahoo_chart(symbol: str) -> dict[str, Any]:
    cached = QUOTE_CACHE.get(symbol)
    if cached and time.monotonic() - cached[0] < QUOTE_TTL:
        return cached[1]
    query = urllib.parse.urlencode({'range': '1d', 'interval': '1m'})
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol, safe="")}?{query}'
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 SIMTRADE-Demo/1.0'})
    try:
        with urllib.request.urlopen(request, timeout=9) as response:
            payload = json.loads(response.read().decode('utf-8'))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise ApiError(503, 'Source de marché momentanément indisponible.') from error
    result = (payload.get('chart', {}).get('result') or [None])[0]
    if not result:
        raise ApiError(503, 'Cours indisponible pour cet instrument.')
    quote = (result.get('indicators', {}).get('quote') or [{}])[0]
    timestamps = result.get('timestamp') or []
    closes = quote.get('close') or []
    history = [{'time': stamp * 1000, 'price': price} for stamp, price in zip(timestamps, closes) if isinstance(price, (float, int))]
    metadata = result.get('meta') or {}
    price = metadata.get('regularMarketPrice') or (history[-1]['price'] if history else None)
    previous = metadata.get('chartPreviousClose') or metadata.get('previousClose')
    if not isinstance(price, (int, float)) or price <= 0 or not isinstance(previous, (int, float)) or previous <= 0:
        raise ApiError(503, 'La source a renvoyé une cotation incomplète.')
    value = {
        'price': float(price),
        'previousClose': float(previous),
        'high': float(metadata.get('regularMarketDayHigh') or max([point['price'] for point in history] or [price])),
        'low': float(metadata.get('regularMarketDayLow') or min([point['price'] for point in history] or [price])),
        'volume': int(metadata.get('regularMarketVolume') or 0),
        'currency': metadata.get('currency') or 'USD',
        'marketTime': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(metadata.get('regularMarketTime') or int(time.time()))),
        'history': history[-48:],
    }
    with QUOTE_LOCK:
        QUOTE_CACHE[symbol] = (time.monotonic(), value)
    return value


def quote_for(asset: dict[str, str], usd_per_eur: float) -> dict[str, Any]:
    raw = yahoo_chart(asset['symbol'])
    divisor = usd_per_eur if raw['currency'] == 'USD' else 1.0
    price = raw['price'] / divisor
    previous = raw['previousClose'] / divisor
    return {
        **asset,
        'price': price,
        'previousClose': previous,
        'change': price - previous,
        'changePercent': (price / previous - 1) * 100,
        'high': raw['high'] / divisor,
        'low': raw['low'] / divisor,
        'volume': raw['volume'],
        'currency': 'EUR',
        'marketTime': raw['marketTime'],
        'history': [{'time': point['time'], 'price': point['price'] / divisor} for point in raw['history']],
        'available': True,
        'stale': False,
    }


def get_quotes() -> dict[str, Any]:
    assets = get_assets()
    try:
        fx = yahoo_chart('EURUSD=X')
        usd_per_eur = fx['price']
        if usd_per_eur <= 0:
            raise ApiError(503, 'Taux EUR/USD indisponible.')
    except ApiError:
        return {'provider': 'Yahoo Finance', 'fetchedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'items': [
            {'symbol': item['symbol'], 'name': item['name'], 'type': item['type'], 'available': False, 'error': 'Taux de conversion EUR/USD indisponible.'}
            for item in assets
        ]}
    with ThreadPoolExecutor(max_workers=min(8, len(assets))) as pool:
        futures = [pool.submit(quote_for, item, usd_per_eur) for item in assets]
    items: list[dict[str, Any]] = []
    for asset, future in zip(assets, futures):
        try:
            items.append(future.result())
        except ApiError as error:
            items.append({'symbol': asset['symbol'], 'name': asset['name'], 'type': asset['type'], 'available': False, 'error': str(error)})
    return {
        'provider': 'Yahoo Finance',
        'fetchedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'fxRate': usd_per_eur,
        'items': items,
    }


def update_position(connection: sqlite3.Connection, user_id: int, symbol: str, side: str,
                    quantity: float, price: float, fee: float) -> float:
    current = connection.execute('SELECT * FROM positions WHERE user_id = ? AND symbol = ?', (user_id, symbol)).fetchone()
    if side == 'BUY':
        if current:
            next_quantity = current['quantity'] + quantity
            average = (current['average_entry_price'] * current['quantity'] + price * quantity + fee) / next_quantity
            connection.execute('UPDATE positions SET quantity = ?, average_entry_price = ?, total_fees = total_fees + ? WHERE user_id = ? AND symbol = ?',
                               (next_quantity, average, fee, user_id, symbol))
        else:
            connection.execute('INSERT INTO positions (user_id, symbol, quantity, average_entry_price, total_fees) VALUES (?, ?, ?, ?, ?)',
                               (user_id, symbol, quantity, (price * quantity + fee) / quantity, fee))
        return 0.0
    if not current or current['quantity'] + 1e-7 < quantity:
        raise ApiError(422, 'Position virtuelle insuffisante.')
    pnl = (price - current['average_entry_price']) * quantity - fee
    remaining = current['quantity'] - quantity
    if remaining < 1e-7:
        connection.execute('DELETE FROM positions WHERE user_id = ? AND symbol = ?', (user_id, symbol))
    else:
        connection.execute('UPDATE positions SET quantity = ?, realized_pnl = realized_pnl + ?, total_fees = total_fees + ? WHERE user_id = ? AND symbol = ?',
                           (remaining, pnl, fee, user_id, symbol))
    return pnl


def record_filled_order(connection: sqlite3.Connection, user_id: int, order: dict[str, Any], price: float,
                        pending: bool = False) -> None:
    gross = price * order['quantity']
    fee = fee_for(gross)
    wallet = connection.execute('SELECT * FROM wallets WHERE user_id = ?', (user_id,)).fetchone()
    reserve = order['reserved'] if pending else 0.0
    if order['side'] == 'BUY' and gross + fee > wallet['cash_available'] + reserve + 0.0001:
        raise ApiError(422, 'Solde virtuel insuffisant.')
    before = wallet['cash_available']
    if order['side'] == 'BUY':
        if pending:
            released = reserve
            after_release = before + released
            add_ledger(connection, user_id, 'RELEASE_RESERVATION', released, before, after_release, order['id'])
            after_buy = after_release - gross
            add_ledger(connection, user_id, 'BUY', -gross, after_release, after_buy, order['id'])
            after_fee = after_buy - fee
            add_ledger(connection, user_id, 'FEE', -fee, after_buy, after_fee, order['id'])
            final_balance = after_fee
        else:
            after_buy = before - gross
            add_ledger(connection, user_id, 'BUY', -gross, before, after_buy, order['id'])
            final_balance = after_buy - fee
            add_ledger(connection, user_id, 'FEE', -fee, after_buy, final_balance, order['id'])
        connection.execute('UPDATE wallets SET cash_available = ?, cash_reserved = cash_reserved - ? WHERE user_id = ?',
                           (final_balance, reserve, user_id))
    else:
        after_sale = before + gross
        final_balance = after_sale - fee
        connection.execute('UPDATE wallets SET cash_available = ? WHERE user_id = ?', (final_balance, user_id))
        add_ledger(connection, user_id, 'SELL', gross, before, after_sale, order['id'])
        add_ledger(connection, user_id, 'FEE', -fee, after_sale, final_balance, order['id'])
    pnl = update_position(connection, user_id, order['symbol'], order['side'], order['quantity'], price, fee)
    filled_at = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    connection.execute("UPDATE orders SET status = 'FILLED', reserved = 0, fill_price = ?, fee = ?, filled_at = ? WHERE id = ?",
                       (price, fee, filled_at, order['id']))
    connection.execute('''
        INSERT INTO trades (id, order_id, user_id, symbol, side, quantity, execution_price, gross_value, fee, pnl, executed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (str(uuid4()), order['id'], user_id, order['symbol'], order['side'], order['quantity'], price, gross, fee, pnl, filled_at))


def process_pending_orders(items: list[dict[str, Any]]) -> None:
    quotes = {item['symbol']: item for item in items if item.get('available') and not item.get('stale')}
    with connect_db() as connection:
        pending = connection.execute("SELECT * FROM orders WHERE status = 'OPEN'").fetchall()
    for row in pending:
        order = dict(row)
        quote = quotes.get(order['symbol'])
        if not quote:
            continue
        trigger = order['trigger_price']
        hit = (order['type'] == 'LIMIT' and (quote['price'] <= trigger if order['side'] == 'BUY' else quote['price'] >= trigger))
        hit = hit or (order['type'] == 'STOP_LOSS' and quote['price'] <= trigger)
        hit = hit or (order['type'] == 'TAKE_PROFIT' and quote['price'] >= trigger)
        if not hit:
            continue
        with connect_db() as connection:
            connection.execute('BEGIN IMMEDIATE')
            current = connection.execute("SELECT * FROM orders WHERE id = ? AND status = 'OPEN'", (order['id'],)).fetchone()
            if not current:
                connection.execute('ROLLBACK')
                continue
            current_order = dict(current)
            price = quote['price'] if current_order['type'] == 'LIMIT' else quote['price'] * 0.9996
            try:
                record_filled_order(connection, current_order['user_id'], current_order, price, pending=True)
                connection.execute('COMMIT')
            except ApiError:
                connection.execute('ROLLBACK')
                connection.execute('BEGIN IMMEDIATE')
                wallet = connection.execute('SELECT * FROM wallets WHERE user_id = ?', (current_order['user_id'],)).fetchone()
                if current_order['reserved']:
                    after = wallet['cash_available'] + current_order['reserved']
                    connection.execute('UPDATE wallets SET cash_available = ?, cash_reserved = cash_reserved - ? WHERE user_id = ?',
                                       (after, current_order['reserved'], current_order['user_id']))
                    add_ledger(connection, current_order['user_id'], 'RELEASE_RESERVATION', current_order['reserved'],
                               wallet['cash_available'], after, current_order['id'])
                connection.execute("UPDATE orders SET status = 'REJECTED', reserved = 0 WHERE id = ?", (current_order['id'],))
                connection.execute('COMMIT')


def portfolio_for(user_id: int) -> dict[str, Any]:
    with connect_db() as connection:
        wallet = connection.execute('SELECT cash_available, cash_reserved, currency FROM wallets WHERE user_id = ?', (user_id,)).fetchone()
        positions = connection.execute('SELECT symbol, quantity, average_entry_price, realized_pnl, total_fees FROM positions WHERE user_id = ? ORDER BY symbol', (user_id,)).fetchall()
        orders = connection.execute('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', (user_id,)).fetchall()
        trades = connection.execute('SELECT * FROM trades WHERE user_id = ? ORDER BY executed_at DESC LIMIT 500', (user_id,)).fetchall()
    return {
        'wallet': {'cashAvailable': wallet['cash_available'], 'cashReserved': wallet['cash_reserved'], 'currency': wallet['currency']},
        'positions': [{'symbol': row['symbol'], 'quantity': row['quantity'], 'average': row['average_entry_price'], 'realized': row['realized_pnl'], 'totalFees': row['total_fees']} for row in positions],
        'orders': [{'id': row['id'], 'symbol': row['symbol'], 'side': row['side'], 'type': row['type'], 'quantity': row['quantity'], 'trigger': row['trigger_price'], 'status': row['status'], 'reserved': row['reserved'], 'fillPrice': row['fill_price'], 'fee': row['fee'], 'date': row['created_at'], 'filledAt': row['filled_at']} for row in orders],
        'trades': [{'id': row['id'], 'orderId': row['order_id'], 'symbol': row['symbol'], 'side': row['side'], 'quantity': row['quantity'], 'price': row['execution_price'], 'gross': row['gross_value'], 'fee': row['fee'], 'pnl': row['pnl'], 'date': row['executed_at']} for row in trades],
    }


def session_user(handler: BaseHTTPRequestHandler) -> sqlite3.Row | None:
    cookie = SimpleCookie()
    cookie.load(handler.headers.get('Cookie', ''))
    morsel = cookie.get(COOKIE_NAME)
    if not morsel:
        return None
    with connect_db() as connection:
        return connection.execute('''
            SELECT users.id, users.email, users.display_name, users.is_public, sessions.is_admin FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ? AND sessions.expires_at > ?
        ''', (digest(morsel.value), int(time.time()))).fetchone()


def limited(client: str) -> bool:
    now = time.monotonic()
    with RATE_LOCK:
        started, count = AUTH_ATTEMPTS.get(client, (now, 0))
        if now - started > 900:
            AUTH_ATTEMPTS[client] = (now, 1)
            return False
        AUTH_ATTEMPTS[client] = (started, count + 1)
        return count + 1 > 12


class SimtradeHandler(BaseHTTPRequestHandler):
    server_version = 'SIMTRADE-Python/1.0'
    public_files = {'/', '/index.html', '/styles.css', '/mobile.css', '/app.js'}

    def _headers(self) -> None:
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")

    def _json(self, status: int, value: dict[str, Any], headers: dict[str, str] | None = None) -> None:
        body = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self._headers()
        for key, header_value in (headers or {}).items():
            self.send_header(key, header_value)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status: int, message: str) -> None:
        self._json(status, {'error': message})

    def _body(self) -> dict[str, Any]:
        length = int(self.headers.get('Content-Length', '0'))
        if length > 10_000:
            raise ApiError(413, 'Requête trop volumineuse.')
        if length <= 0:
            return {}
        try:
            value = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise ApiError(400, 'JSON invalide.') from error
        if not isinstance(value, dict):
            raise ApiError(400, 'Objet JSON attendu.')
        return value

    def _session_cookie(self, token: str, max_age: int) -> str:
        secure = '; Secure' if os.environ.get('HTTPS') == '1' else ''
        return f'{COOKIE_NAME}={token}; HttpOnly; Path=/; SameSite=Strict; Max-Age={max_age}{secure}'

    def _require_user(self) -> sqlite3.Row:
        user = session_user(self)
        if not user:
            raise ApiError(401, 'Session expirée.')
        return user

    def _require_admin(self) -> sqlite3.Row:
        user = self._require_user()
        if not user['is_admin']:
            raise ApiError(403, 'Accès administrateur requis.')
        return user

    def do_GET(self) -> None:
        path = urllib.parse.urlsplit(self.path).path
        try:
            if path == '/api/health':
                return self._json(200, {'status': 'ok', 'provider': 'Yahoo Finance', 'storage': 'SQLite', 'currency': 'EUR'})
            if path == '/api/auth/me':
                user = session_user(self)
                return self._json(200, {'user': client_user(user)}) if user else self._json(401, {'user': None})
            if path == '/api/admin/overview':
                self._require_admin()
                with connect_db() as connection:
                    stats = connection.execute('''
                        SELECT
                            (SELECT COUNT(*) FROM users) AS users,
                            (SELECT COUNT(*) FROM sessions WHERE expires_at > ?) AS sessions,
                            (SELECT COUNT(*) FROM orders) AS orders,
                            (SELECT COUNT(*) FROM trades) AS trades,
                            (SELECT COUNT(*) FROM market_assets WHERE enabled = 1 AND type = 'CRYPTO') AS cryptos
                    ''', (int(time.time()),)).fetchone()
                    accounts = connection.execute('''
                        SELECT users.id, users.display_name, users.created_at, users.is_public,
                               wallets.cash_available FROM users
                        JOIN wallets ON wallets.user_id = users.id
                        ORDER BY users.created_at DESC LIMIT 25
                    ''').fetchall()
                return self._json(200, {
                    'stats': dict(stats),
                    'accounts': [{'id': row['id'], 'displayName': row['display_name'], 'createdAt': row['created_at'],
                                  'isPublic': bool(row['is_public']), 'cashAvailable': row['cash_available']} for row in accounts],
                    'cryptos': [asset for asset in get_assets() if asset['type'] == 'CRYPTO'],
                })
            if path == '/api/quotes':
                quotes = get_quotes()
                process_pending_orders(quotes['items'])
                return self._json(200, quotes)
            if path == '/api/portfolio':
                user = self._require_user()
                return self._json(200, portfolio_for(user['id']))
            if path == '/api/community/people':
                user = self._require_user()
                with connect_db() as connection:
                    rows = connection.execute('''
                        SELECT users.id, users.display_name, COUNT(trades.id) AS trade_count,
                               COALESCE(SUM(CASE WHEN trades.side = 'SELL' THEN trades.pnl ELSE 0 END), 0) AS realized_pnl,
                               MAX(trades.executed_at) AS last_activity
                        FROM users LEFT JOIN trades ON trades.user_id = users.id
                        WHERE users.is_public = 1 AND users.id != ?
                        GROUP BY users.id, users.display_name
                        ORDER BY last_activity DESC, users.display_name COLLATE NOCASE
                    ''', (user['id'],)).fetchall()
                    followed = {row['followed_id'] for row in connection.execute('SELECT followed_id FROM follows WHERE follower_id = ?', (user['id'],))}
                people = []
                for row in rows:
                    with connect_db() as connection:
                        recent = connection.execute('''
                            SELECT symbol, side, quantity, execution_price, fee, pnl, executed_at
                            FROM trades WHERE user_id = ? ORDER BY executed_at DESC LIMIT 3
                        ''', (row['id'],)).fetchall()
                    people.append({
                        'id': row['id'], 'displayName': row['display_name'],
                        'tradeCount': row['trade_count'], 'realizedPnl': row['realized_pnl'],
                        'lastActivity': row['last_activity'], 'isFollowing': row['id'] in followed,
                        'recentTrades': [{'symbol': trade['symbol'], 'side': trade['side'], 'quantity': trade['quantity'],
                                          'price': trade['execution_price'], 'fee': trade['fee'], 'pnl': trade['pnl'],
                                          'date': trade['executed_at']} for trade in recent]
                    })
                return self._json(200, {'people': people, 'followingCount': len(followed), 'myProfilePublic': bool(user['is_public'])})
            if path == '/api/community/feed':
                user = self._require_user()
                with connect_db() as connection:
                    rows = connection.execute('''
                        SELECT users.id AS user_id, users.display_name, trades.symbol, trades.side,
                               trades.quantity, trades.execution_price, trades.fee, trades.pnl, trades.executed_at
                        FROM follows
                        JOIN users ON users.id = follows.followed_id AND users.is_public = 1
                        JOIN trades ON trades.user_id = users.id
                        WHERE follows.follower_id = ?
                        ORDER BY trades.executed_at DESC LIMIT 100
                    ''', (user['id'],)).fetchall()
                activity = [{'userId': row['user_id'], 'displayName': row['display_name'], 'symbol': row['symbol'],
                             'side': row['side'], 'quantity': row['quantity'], 'price': row['execution_price'],
                             'fee': row['fee'], 'pnl': row['pnl'], 'date': row['executed_at']} for row in rows]
                return self._json(200, {'activity': activity})
            if path in self.public_files:
                return self._static(path)
            return self._error(404, 'Route introuvable.')
        except ApiError as error:
            self._error(error.status, str(error))
        except Exception:
            self.log_error('GET %s failed', path)
            self._error(500, 'Erreur interne du service local.')

    def do_POST(self) -> None:
        path = urllib.parse.urlsplit(self.path).path
        try:
            if path == '/api/admin/unlock':
                return self._unlock_admin()
            cash_match = re.fullmatch(r'/api/admin/users/(\d+)/cash', path)
            if cash_match:
                return self._add_admin_cash(int(cash_match.group(1)))
            if path == '/api/auth/register':
                return self._register()
            if path == '/api/auth/login':
                return self._login()
            if path == '/api/auth/logout':
                return self._logout()
            if path == '/api/orders':
                return self._create_order()
            if path.startswith('/api/orders/') and path.endswith('/cancel'):
                order_id = urllib.parse.unquote(path[len('/api/orders/'):-len('/cancel')].strip('/'))
                return self._cancel_order(order_id)
            if path == '/api/demo/reset':
                return self._reset_demo()
            follow_match = re.fullmatch(r'/api/follows/(\d+)', path)
            if follow_match:
                return self._set_follow(int(follow_match.group(1)), True)
            return self._error(404, 'Route API introuvable.')
        except ApiError as error:
            self._error(error.status, str(error))
        except Exception:
            self.log_error('POST %s failed', path)
            self._error(500, 'Erreur interne du service local.')

    def do_DELETE(self) -> None:
        path = urllib.parse.urlsplit(self.path).path
        try:
            follow_match = re.fullmatch(r'/api/follows/(\d+)', path)
            if follow_match:
                return self._set_follow(int(follow_match.group(1)), False)
            return self._error(404, 'Route API introuvable.')
        except ApiError as error:
            self._error(error.status, str(error))
        except Exception:
            self.log_error('DELETE %s failed', path)
            self._error(500, 'Erreur interne du service local.')

    def do_PATCH(self) -> None:
        path = urllib.parse.urlsplit(self.path).path
        try:
            if path != '/api/users/me':
                return self._error(404, 'Route API introuvable.')
            user = self._require_user()
            body = self._body()
            is_public = body.get('isPublic')
            if not isinstance(is_public, bool):
                raise ApiError(400, 'Le réglage de partage doit être vrai ou faux.')
            with connect_db() as connection:
                connection.execute('UPDATE users SET is_public = ? WHERE id = ?', (int(is_public), user['id']))
                if not is_public:
                    connection.execute('DELETE FROM follows WHERE followed_id = ?', (user['id'],))
                updated = connection.execute('SELECT id, email, display_name, is_public FROM users WHERE id = ?', (user['id'],)).fetchone()
            return self._json(200, {'user': client_user(updated, is_admin=bool(user['is_admin']))})
        except ApiError as error:
            self._error(error.status, str(error))
        except Exception:
            self.log_error('PATCH %s failed', path)
            self._error(500, 'Erreur interne du service local.')

    def _register(self) -> None:
        client = self.client_address[0]
        if limited(client):
            raise ApiError(429, 'Trop de tentatives. Réessaie dans quelques minutes.')
        body = self._body()
        email = str(body.get('email', '')).strip().lower()
        name = str(body.get('displayName', '')).strip()[:50]
        password = str(body.get('password', ''))
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
            raise ApiError(400, 'Adresse e-mail invalide.')
        if len(name) < 2:
            raise ApiError(400, 'Saisis un nom d’au moins deux caractères.')
        if not 10 <= len(password) <= 128:
            raise ApiError(400, 'Le mot de passe doit contenir entre 10 et 128 caractères.')
        salt = secrets.token_bytes(16).hex()
        token = secrets.token_urlsafe(32)
        now = int(time.time())
        with connect_db() as connection:
            connection.execute('BEGIN IMMEDIATE')
            try:
                cursor = connection.execute('INSERT INTO users (email, display_name, password_salt, password_hash) VALUES (?, ?, ?, ?)',
                                            (email, name, salt, password_digest(password, salt)))
                user_id = cursor.lastrowid
                connection.execute('INSERT INTO wallets (user_id, cash_available, cash_reserved, currency) VALUES (?, ?, 0, ?)',
                                   (user_id, INITIAL_BALANCE, 'EUR'))
                add_ledger(connection, user_id, 'DEMO_INITIAL_BALANCE', INITIAL_BALANCE, 0, INITIAL_BALANCE)
                connection.execute('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
                                   (digest(token), user_id, now + SESSION_LIFETIME))
                connection.execute('COMMIT')
            except sqlite3.IntegrityError as error:
                connection.execute('ROLLBACK')
                raise ApiError(409, 'Un compte utilise déjà cette adresse e-mail.') from error
        connection.close()
        self._json(201, {'user': {'id': user_id, 'email': email, 'displayName': name, 'isPublic': False, 'isAdmin': False}},
                   {'Set-Cookie': self._session_cookie(token, SESSION_LIFETIME)})

    def _unlock_admin(self) -> None:
        user = self._require_user()
        if limited(self.client_address[0]):
            raise ApiError(429, 'Trop de tentatives. Réessaie dans quelques minutes.')
        code = str(self._body().get('code', ''))
        candidate = hashlib.sha256(code.encode('utf-8')).hexdigest()
        if not secrets.compare_digest(candidate, ADMIN_CODE_HASH):
            raise ApiError(403, 'Code administrateur incorrect.')
        cookie = SimpleCookie()
        cookie.load(self.headers.get('Cookie', ''))
        token = cookie.get(COOKIE_NAME)
        if not token:
            raise ApiError(401, 'Session expirée.')
        with connect_db() as connection:
            cursor = connection.execute(
                'UPDATE sessions SET is_admin = 1 WHERE token_hash = ? AND user_id = ? AND expires_at > ?',
                (digest(token.value), user['id'], int(time.time())),
            )
            if cursor.rowcount != 1:
                raise ApiError(401, 'Session expirée.')
        return self._json(200, {'user': client_user(self._require_user())})

    def _add_admin_cash(self, target_user_id: int) -> None:
        admin = self._require_admin()
        amount = self._body().get('amount')
        if not isinstance(amount, (int, float)) or isinstance(amount, bool) or not math.isfinite(amount):
            raise ApiError(400, 'Saisis un montant valide.')
        amount = round(float(amount), 2)
        if amount <= 0 or amount > 1_000_000:
            raise ApiError(400, 'Le montant doit être supérieur à 0 et inférieur ou égal à 1 000 000 EUR.')

        with connect_db() as connection:
            connection.execute('BEGIN IMMEDIATE')
            try:
                target = connection.execute('''
                    SELECT users.display_name, wallets.cash_available FROM users
                    JOIN wallets ON wallets.user_id = users.id WHERE users.id = ?
                ''', (target_user_id,)).fetchone()
                if not target:
                    raise ApiError(404, 'Compte introuvable.')
                before = float(target['cash_available'])
                after = round(before + amount, 2)
                connection.execute('UPDATE wallets SET cash_available = ? WHERE user_id = ?', (after, target_user_id))
                add_ledger(connection, target_user_id, 'ADMIN_CREDIT', amount, before, after, f'admin-user:{admin["id"]}')
                connection.execute('COMMIT')
            except Exception:
                connection.execute('ROLLBACK')
                raise
        return self._json(200, {
            'success': True, 'amount': amount,
            'user': {'id': target_user_id, 'displayName': target['display_name'], 'cashAvailable': after},
        })

    def _login(self) -> None:
        client = self.client_address[0]
        if limited(client):
            raise ApiError(429, 'Trop de tentatives. Réessaie dans quelques minutes.')
        body = self._body()
        email = str(body.get('email', '')).strip().lower()
        password = str(body.get('password', ''))
        if len(password) > 128:
            raise ApiError(401, 'Adresse e-mail ou mot de passe incorrect.')
        with connect_db() as connection:
            user = connection.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
        salt = user['password_salt'] if user else '00' * 16
        candidate = password_digest(password, salt)
        expected = user['password_hash'] if user else '00' * 64
        if not user or not secrets.compare_digest(candidate, expected):
            raise ApiError(401, 'Adresse e-mail ou mot de passe incorrect.')
        token = secrets.token_urlsafe(32)
        with connect_db() as connection:
            connection.execute('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
                               (digest(token), user['id'], int(time.time()) + SESSION_LIFETIME))
            connection.execute('DELETE FROM sessions WHERE expires_at <= ?', (int(time.time()),))
        self._json(200, {'user': client_user(user)}, {'Set-Cookie': self._session_cookie(token, SESSION_LIFETIME)})

    def _logout(self) -> None:
        cookie = SimpleCookie()
        cookie.load(self.headers.get('Cookie', ''))
        morsel = cookie.get(COOKIE_NAME)
        if morsel:
            with connect_db() as connection:
                connection.execute('DELETE FROM sessions WHERE token_hash = ?', (digest(morsel.value),))
        self._json(200, {'success': True}, {'Set-Cookie': self._session_cookie('', 0)})

    def _create_order(self) -> None:
        user = self._require_user()
        body = self._body()
        symbol = str(body.get('symbol', '')).upper()
        side = str(body.get('side', '')).upper()
        order_type = str(body.get('type', '')).upper()
        quantity = body.get('quantity')
        amount_eur = body.get('amountEUR')
        trigger = body.get('trigger')
        selected = next((item for item in get_assets() if item['symbol'] == symbol), None)
        if not selected:
            raise ApiError(404, 'Instrument inconnu.')
        if side not in {'BUY', 'SELL'}:
            raise ApiError(400, 'Sens d’ordre invalide.')
        if order_type not in {'MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT'} or (side == 'BUY' and order_type not in {'MARKET', 'LIMIT'}):
            raise ApiError(400, 'Type d’ordre invalide.')
        crypto_purchase = selected['type'] == 'CRYPTO' and side == 'BUY'
        if crypto_purchase:
            if not isinstance(amount_eur, (int, float)) or isinstance(amount_eur, bool) or not math.isfinite(amount_eur):
                raise ApiError(400, 'Saisissez un montant en EUR valide.')
            amount_eur = round(float(amount_eur), 2)
            if amount_eur <= 0 or amount_eur > 1_000_000:
                raise ApiError(400, 'Le montant doit être compris entre 0,01 et 1 000 000 EUR.')
        elif not isinstance(quantity, (int, float)) or isinstance(quantity, bool) or not math.isfinite(quantity) or quantity <= 0 or quantity > 1_000_000:
            raise ApiError(400, 'Quantité invalide.')
        if order_type != 'MARKET' and (not isinstance(trigger, (int, float)) or isinstance(trigger, bool) or trigger <= 0):
            raise ApiError(400, 'Prix déclencheur invalide.')
        quotes = get_quotes()
        quote = next((item for item in quotes['items'] if item['symbol'] == symbol and item.get('available') and not item.get('stale')), None)
        if not quote:
            raise ApiError(503, 'Cours EUR indisponible; aucun ordre n’a été créé.')
        current = quote['price']
        trigger_value = None if order_type == 'MARKET' else float(trigger)
        if crypto_purchase:
            reference_price = current * 1.0004 if order_type == 'MARKET' else trigger_value
            quantity = quantity_from_eur(amount_eur, reference_price)
            if quantity <= 0:
                raise ApiError(400, 'Montant trop faible pour acheter cette fraction de crypto.')
            if quantity > 1_000_000_000_000:
                raise ApiError(400, 'Quantité crypto calculée trop élevée.')
        immediate = order_type == 'MARKET'
        immediate |= order_type == 'LIMIT' and (current <= trigger_value if side == 'BUY' else current >= trigger_value)
        immediate |= order_type == 'STOP_LOSS' and current <= trigger_value
        immediate |= order_type == 'TAKE_PROFIT' and current >= trigger_value
        price = current * (1.0004 if side == 'BUY' else 0.9996) if order_type == 'MARKET' else current * (1 if order_type == 'LIMIT' else 0.9996)
        order_id = f'ORD-{uuid4()}'
        order = {'id': order_id, 'symbol': symbol, 'side': side, 'type': order_type,
                 'quantity': float(quantity), 'trigger_price': trigger_value, 'reserved': 0.0}
        with connect_db() as connection:
            connection.execute('BEGIN IMMEDIATE')
            try:
                wallet = connection.execute('SELECT * FROM wallets WHERE user_id = ?', (user['id'],)).fetchone()
                held = connection.execute('SELECT quantity FROM positions WHERE user_id = ? AND symbol = ?', (user['id'], symbol)).fetchone()
                reserved = connection.execute("SELECT COALESCE(SUM(quantity), 0) AS quantity FROM orders WHERE user_id = ? AND symbol = ? AND side = 'SELL' AND status = 'OPEN'", (user['id'], symbol)).fetchone()['quantity']
                if side == 'SELL' and quantity > (held['quantity'] if held else 0) - reserved + 1e-7:
                    raise ApiError(422, 'Position virtuelle insuffisante.')
                reserve = trigger_value * quantity + fee_for(trigger_value * quantity) if not immediate and side == 'BUY' else 0.0
                if reserve > wallet['cash_available'] + 0.0001:
                    raise ApiError(422, 'Solde virtuel insuffisant pour cet ordre.')
                order['reserved'] = reserve
                created = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                connection.execute('''
                    INSERT INTO orders (id, user_id, symbol, side, type, quantity, trigger_price, status, reserved, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (order_id, user['id'], symbol, side, order_type, quantity, trigger_value, 'PENDING' if immediate else 'OPEN', reserve, created))
                if reserve:
                    after = wallet['cash_available'] - reserve
                    connection.execute('UPDATE wallets SET cash_available = ?, cash_reserved = cash_reserved + ? WHERE user_id = ?', (after, reserve, user['id']))
                    add_ledger(connection, user['id'], 'RESERVE', -reserve, wallet['cash_available'], after, order_id)
                if immediate:
                    record_filled_order(connection, user['id'], order, price)
                connection.execute('COMMIT')
            except Exception:
                connection.execute('ROLLBACK')
                raise
        portfolio = portfolio_for(user['id'])
        result_order = next(item for item in portfolio['orders'] if item['id'] == order_id)
        self._json(201, {'order': result_order, 'portfolio': portfolio})

    def _cancel_order(self, order_id: str) -> None:
        user = self._require_user()
        with connect_db() as connection:
            connection.execute('BEGIN IMMEDIATE')
            order = connection.execute("SELECT * FROM orders WHERE id = ? AND user_id = ? AND status = 'OPEN'", (order_id, user['id'])).fetchone()
            if not order:
                connection.execute('ROLLBACK')
                raise ApiError(404, 'Ordre ouvert introuvable.')
            if order['reserved']:
                wallet = connection.execute('SELECT * FROM wallets WHERE user_id = ?', (user['id'],)).fetchone()
                after = wallet['cash_available'] + order['reserved']
                connection.execute('UPDATE wallets SET cash_available = ?, cash_reserved = cash_reserved - ? WHERE user_id = ?',
                                   (after, order['reserved'], user['id']))
                add_ledger(connection, user['id'], 'RELEASE_RESERVATION', order['reserved'], wallet['cash_available'], after, order_id)
            connection.execute("UPDATE orders SET status = 'CANCELLED', reserved = 0 WHERE id = ?", (order_id,))
            connection.execute('COMMIT')
        self._json(200, {'success': True, 'portfolio': portfolio_for(user['id'])})

    def _set_follow(self, followed_id: int, should_follow: bool) -> None:
        user = self._require_user()
        if followed_id == user['id']:
            raise ApiError(400, 'Tu ne peux pas suivre ton propre profil.')
        with connect_db() as connection:
            target = connection.execute('SELECT id, is_public FROM users WHERE id = ?', (followed_id,)).fetchone()
            if not target:
                raise ApiError(404, 'Profil introuvable.')
            if should_follow and not target['is_public']:
                raise ApiError(404, 'Ce profil n’est pas public.')
            if should_follow:
                connection.execute('INSERT OR IGNORE INTO follows (follower_id, followed_id) VALUES (?, ?)', (user['id'], followed_id))
            else:
                connection.execute('DELETE FROM follows WHERE follower_id = ? AND followed_id = ?', (user['id'], followed_id))
        self._json(200, {'following': should_follow, 'personId': followed_id})

    def _reset_demo(self) -> None:
        user = self._require_user()
        with connect_db() as connection:
            connection.execute('BEGIN IMMEDIATE')
            connection.execute('DELETE FROM trades WHERE user_id = ?', (user['id'],))
            connection.execute('DELETE FROM orders WHERE user_id = ?', (user['id'],))
            connection.execute('DELETE FROM positions WHERE user_id = ?', (user['id'],))
            connection.execute('DELETE FROM ledger_entries WHERE user_id = ?', (user['id'],))
            connection.execute("UPDATE wallets SET cash_available = ?, cash_reserved = 0, currency = 'EUR' WHERE user_id = ?", (INITIAL_BALANCE, user['id']))
            add_ledger(connection, user['id'], 'RESET', INITIAL_BALANCE, 0, INITIAL_BALANCE)
            connection.execute('COMMIT')
        self._json(200, {'success': True, 'portfolio': portfolio_for(user['id'])})

    def _static(self, path: str) -> None:
        name = 'index.html' if path == '/' else path.lstrip('/')
        file_path = ROOT / name
        if not file_path.is_file():
            return self._error(404, 'Fichier introuvable.')
        content_type = {'index.html': 'text/html; charset=utf-8', 'styles.css': 'text/css; charset=utf-8', 'mobile.css': 'text/css; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8'}[name]
        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-cache' if name == 'index.html' else 'public, max-age=300')
        self._headers()
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format_string: str, *args: Any) -> None:
        message = format_string % args
        if self.path in message:
            message = message.replace(self.path, urllib.parse.urlsplit(self.path).path)
        logging.info('%s - %s', self.client_address[0], message)


class LocalServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main() -> None:
    configure_logging()
    server = None
    try:
        logging.info('Initialisation de la base SQLite : %s.', DB_PATH)
        init_db()
        logging.info('Écoute HTTP demandée sur %s:%s.', HOST, PORT)
        server = LocalServer((HOST, PORT), SimtradeHandler)
        logging.info('SIMTRADE prêt sur http://%s:%s.', HOST, PORT)
        server.serve_forever()
    except KeyboardInterrupt:
        logging.info('Arrêt du serveur demandé.')
    except Exception:
        logging.exception('Échec du démarrage ou erreur fatale du serveur.')
        raise
    finally:
        if server is not None:
            server.server_close()


if __name__ == '__main__':
    main()
