from __future__ import annotations

import argparse
import ipaddress
import logging
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SSDP_ADDRESS = ('239.255.255.250', 1900)
SOAP_NAMESPACE = 'http://schemas.xmlsoap.org/soap/envelope/'


def configure_logging() -> None:
    log_dir = Path(os.environ.get('SIMTRADE_LOG_DIR', ROOT / 'logs'))
    log_dir.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s %(levelname)s %(message)s',
        handlers=[logging.FileHandler(log_dir / 'deploy_public.log', encoding='utf-8'), logging.StreamHandler()],
        force=True,
    )


def discover_gateway() -> tuple[str, str, str]:
    logging.info('Recherche du routeur UPnP sur le réseau local.')
    request = '\r\n'.join((
        'M-SEARCH * HTTP/1.1',
        f'HOST: {SSDP_ADDRESS[0]}:{SSDP_ADDRESS[1]}',
        'MAN: "ssdp:discover"',
        'MX: 2',
        'ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1',
        '',
        '',
    )).encode()
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP) as discovery:
        discovery.settimeout(3)
        discovery.sendto(request, SSDP_ADDRESS)
        try:
            response, source = discovery.recvfrom(65507)
        except socket.timeout as error:
            raise RuntimeError('Aucun routeur UPnP détecté sur le réseau local.') from error

    headers = {}
    for line in response.decode('latin-1').splitlines()[1:]:
        if ':' in line:
            key, value = line.split(':', 1)
            headers[key.strip().lower()] = value.strip()
    location = headers.get('location')
    if not location:
        raise RuntimeError('Le routeur UPnP n’a pas fourni d’adresse de description.')

    with urllib.request.urlopen(location, timeout=5) as response:
        description = ET.fromstring(response.read())
    for service in description.iter():
        if service.tag.rsplit('}', 1)[-1] != 'service':
            continue
        details = {child.tag.rsplit('}', 1)[-1]: child.text or '' for child in service}
        service_type = details.get('serviceType', '')
        if service_type.startswith('urn:schemas-upnp-org:service:WANIPConnection:') or service_type.startswith(
            'urn:schemas-upnp-org:service:WANPPPConnection:'
        ):
            control_url = urllib.parse.urljoin(location, details.get('controlURL', ''))
            return source[0], service_type, control_url
    raise RuntimeError('Aucun service WANIPConnection/WANPPPConnection trouvé sur le routeur.')


def soap_call(control_url: str, service_type: str, action: str, values: dict[str, str]) -> ET.Element:
    ET.register_namespace('s', SOAP_NAMESPACE)
    envelope = ET.Element(f'{{{SOAP_NAMESPACE}}}Envelope', {'{http://schemas.xmlsoap.org/soap/envelope/}encodingStyle': 'http://schemas.xmlsoap.org/soap/encoding/'})
    body = ET.SubElement(envelope, f'{{{SOAP_NAMESPACE}}}Body')
    action_element = ET.SubElement(body, f'{{{service_type}}}{action}')
    for key, value in values.items():
        ET.SubElement(action_element, f'{{{service_type}}}{key}').text = value
    request = urllib.request.Request(
        control_url,
        data=ET.tostring(envelope, encoding='utf-8', xml_declaration=True),
        headers={
            'Content-Type': 'text/xml; charset="utf-8"',
            'SOAPAction': f'"{service_type}#{action}"',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return ET.fromstring(response.read())
    except urllib.error.HTTPError as error:
        detail = error.read().decode('utf-8', errors='replace')
        raise RuntimeError(f'Le routeur a refusé {action} (HTTP {error.code}): {detail[:300]}') from error


def find_value(document: ET.Element, name: str) -> str:
    for element in document.iter():
        if element.tag.rsplit('}', 1)[-1] == name and element.text:
            return element.text
    raise RuntimeError(f'Réponse UPnP incomplète : {name} absent.')


def gateway_ip(router_ip: str) -> str:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as route:
        route.connect((router_ip, 1900))
        return route.getsockname()[0]


def local_ip() -> str:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as route:
        route.connect(('192.0.2.1', 9))
        return route.getsockname()[0]


def default_gateway_ip() -> str | None:
    try:
        routes = Path('/proc/net/route').read_text(encoding='ascii').splitlines()[1:]
        candidates = []
        for route in routes:
            fields = route.split()
            if len(fields) >= 7 and fields[1] == '00000000' and int(fields[3], 16) & 2:
                gateway = socket.inet_ntoa(bytes.fromhex(fields[2])[::-1])
                candidates.append((int(fields[6]), gateway))
        if candidates:
            return min(candidates)[1]
    except (OSError, ValueError, IndexError):
        pass

    try:
        result = subprocess.run(
            ['ip', '-4', 'route', 'show', 'default'], capture_output=True, text=True, timeout=2
        )
        for route in result.stdout.splitlines():
            fields = route.split()
            if fields and fields[0] == 'default' and 'via' in fields:
                return fields[fields.index('via') + 1]
    except (OSError, subprocess.SubprocessError):
        pass
    return None


def detect_public_ip() -> str | None:
    request = urllib.request.Request('https://api.ipify.org', headers={'User-Agent': 'SIMTRADE-Demo/1.0'})
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            address = response.read(64).decode('ascii').strip()
        return str(ipaddress.IPv4Address(address))
    except (OSError, UnicodeDecodeError, ValueError):
        return None


def ask_port(cli_port: int | None) -> int:
    while True:
        raw = str(cli_port) if cli_port is not None else input('Port public et local à utiliser [4173] : ').strip() or '4173'
        try:
            port = int(raw)
            if 1 <= port <= 65535:
                return port
        except ValueError:
            pass
        if cli_port is not None:
            raise SystemExit('Le port doit être un entier entre 1 et 65535.')
        print('Saisis un port entre 1 et 65535.')


def main() -> int:
    parser = argparse.ArgumentParser(description='Expose SIMTRADE via une redirection de port UPnP ou manuelle.')
    parser.add_argument('--port', type=int, help='port public et local (sinon demandé au démarrage)')
    parser.add_argument('--manual', action='store_true', help='utiliser la règle du routeur déjà configurée et ignorer UPnP')
    parser.add_argument('--public-address', help='IP publique ou nom de domaine, uniquement pour afficher le lien')
    args = parser.parse_args()
    configure_logging()
    port = ask_port(args.port)
    logging.info('Démarrage demandé : port=%s, mode=%s.', port, 'manuel' if args.manual else 'UPnP avec repli manuel')

    print('\nATTENTION : le serveur sera accessible depuis Internet en HTTP sans chiffrement.')
    print('Utilise uniquement des comptes de démonstration et des mots de passe qui ne servent nulle part ailleurs.')
    if input('Continuer et ouvrir ce port sur le routeur ? Tape OUI pour confirmer : ').strip() != 'OUI':
        logging.info('Démarrage annulé par l’utilisateur.')
        print('Annulé.')
        return 1

    manual = args.manual
    public_ip = args.public_address
    if manual:
        internal_ip = local_ip()
        router_ip = default_gateway_ip()
        public_ip = public_ip or detect_public_ip()
        logging.info('Mode manuel : IP locale=%s, passerelle=%s, IP publique=%s.', internal_ip, router_ip, public_ip)
        if router_ip:
            print(f'IP locale du routeur (passerelle) : {router_ip}')
        print(f'Mode manuel : règle TCP attendue sur {internal_ip}:{port}.')
    else:
        try:
            router_ip, service_type, control_url = discover_gateway()
            internal_ip = gateway_ip(router_ip)
            print(f'IP locale du routeur : {router_ip}')
        except (OSError, RuntimeError) as error:
            manual = True
            logging.warning('UPnP indisponible : %s', error)
            print(f'UPnP indisponible : {error}')
            print('Configure une règle TCP dans le routeur :')
            internal_ip = local_ip()
            router_ip = default_gateway_ip()
            public_ip = public_ip or detect_public_ip()
            if router_ip:
                print(f'IP locale du routeur (passerelle) : {router_ip}')
            print(f'  port externe {port} -> {internal_ip}, port interne {port}')
            print('Réserve cette adresse locale dans le routeur et autorise le port dans le pare-feu.')
            if input('Après avoir créé la règle, tape OUI pour lancer : ').strip() != 'OUI':
                logging.info('Démarrage annulé en attente de la règle manuelle.')
                print('Annulé.')
                return 1

    mapping = {
        'NewRemoteHost': '',
        'NewExternalPort': str(port),
        'NewProtocol': 'TCP',
        'NewInternalPort': str(port),
        'NewInternalClient': internal_ip,
        'NewEnabled': '1',
        'NewPortMappingDescription': 'SIMTRADE demo',
        'NewLeaseDuration': '0',
    }
    child = None
    mapping_created = False
    try:
        if not manual:
            logging.info('Création de la redirection UPnP TCP %s vers %s.', port, internal_ip)
            soap_call(control_url, service_type, 'AddPortMapping', mapping)
            mapping_created = True
            public_ip = find_value(soap_call(control_url, service_type, 'GetExternalIPAddress', {}), 'NewExternalIPAddress')
            logging.info('Redirection UPnP créée; IP publique du routeur=%s.', public_ip)
        environment = os.environ.copy()
        environment.update({'HOST': '0.0.0.0', 'PORT': str(port)})
        logging.info('Lancement de server.py sur 0.0.0.0:%s.', port)
        child = subprocess.Popen([sys.executable, str(ROOT / 'server.py')], cwd=ROOT, env=environment)

        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if child.poll() is not None:
                raise RuntimeError(f'Le serveur s’est arrêté au démarrage (code {child.returncode}).')
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/', timeout=1):
                    break
            except (urllib.error.URLError, TimeoutError):
                time.sleep(0.2)
        else:
            raise RuntimeError('Le serveur n’a pas répondu dans le délai prévu.')
        logging.info('Contrôle HTTP local réussi sur le port %s.', port)

        print('\nSIMTRADE est lancé.')
        if public_ip:
            print(f'Adresse IP publique détectée : http://{public_ip}:{port}')
        else:
            print(f'Adresse publique non détectée; utilise l’IP WAN du routeur sur le port {port}.')
        print(f'Adresse locale : http://{internal_ip}:{port}')
        print('Garde ce terminal ouvert. Ctrl+C arrête le serveur.')
        if manual:
            print(f'Pense à supprimer manuellement la règle TCP {port} dans le routeur après la démonstration.')
        else:
            print('La redirection UPnP sera retirée à l’arrêt.')
        child.wait()
    except KeyboardInterrupt:
        logging.info('Arrêt demandé par l’utilisateur.')
        print('\nArrêt demandé.')
    finally:
        if child is not None and child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        if mapping_created:
            try:
                soap_call(control_url, service_type, 'DeletePortMapping', {
                    'NewRemoteHost': '',
                    'NewExternalPort': str(port),
                    'NewProtocol': 'TCP',
                })
                logging.info('Redirection UPnP TCP %s retirée.', port)
                print('Redirection UPnP retirée.')
            except Exception as error:
                logging.exception('Impossible de retirer la redirection UPnP TCP %s.', port)
                print(f'Impossible de retirer la redirection automatiquement : {error}', file=sys.stderr)
                print(f'Supprime manuellement la règle TCP {port} dans les réglages du routeur.', file=sys.stderr)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError) as error:
        logging.exception('Échec du lancement public.')
        print(f'Erreur : {error}', file=sys.stderr)
        print('Vérifie que le port est disponible et que la redirection TCP est configurée.', file=sys.stderr)
        raise SystemExit(1)