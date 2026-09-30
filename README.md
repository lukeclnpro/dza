# SIMTRADE

Application locale de simulation boursière. Les cotations sont récupérées auprès de Yahoo Finance et peuvent être différées ou indisponibles. Tous les achats, ventes, frais et soldes sont virtuels : aucun ordre n'est transmis à un courtier.

## Lancer

Prérequis : Python 3.10 ou plus récent. Le serveur n’utilise que la bibliothèque standard.

```sh
python3 server.py
```

Ouvrir ensuite <http://127.0.0.1:4173>. Créer un compte de démonstration ou se connecter. Le premier compte reçoit 1 000 EUR virtuels.

## Administration et cryptos

Après connexion, ouvrir **Paramètres** et saisir le code administrateur `010620242007`. L’entrée **Admin** donne accès au tableau de supervision et permet d’ajouter jusqu’à 1 000 000 EUR de cash virtuel par opération à un compte. Chaque crédit met à jour le portefeuille et ajoute une écriture `ADMIN_CREDIT` au ledger. Le code est vérifié côté serveur, limité en tentatives et conservé sous forme d’empreinte. Ne le partage pas si le site est accessible publiquement.

Le catalogue de marché est stocké dans la table `market_assets` de SQLite et initialisé au démarrage. Il comprend 28 cryptos, dont BTC, ETH, BNB, XRP, SOL, ADA, DOGE, SHIB, XLM, ATOM, UNI, NEAR, APT, OP et ARB. Les cours restent soumis à la disponibilité Yahoo Finance.

## Accès public via le routeur

Pour une démonstration temporaire sur Internet, lancer :

```sh
python3 deploy_public.py
```

Choisir le port demandé (4173 par défaut), puis taper `OUI` pour confirmer l’exposition. Il est aussi possible de préciser le port avec `python3 deploy_public.py --port 8080`. Si UPnP est disponible, le script crée la redirection TCP et la retire à l’arrêt avec Ctrl+C. Si UPnP ne répond pas, il détecte l’adresse locale de la machine, la passerelle par défaut et l’adresse IP publique, puis affiche les paramètres de la règle TCP à créer manuellement dans le routeur. Pour utiliser une règle déjà créée, lancer `python3 deploy_public.py --manual --port 6000`; l’adresse IP publique est alors détectée automatiquement et peut être remplacée avec `--public-address 203.0.113.10`. Le script ne pourra pas retirer une règle manuelle. Garder le terminal ouvert.

Cette méthode nécessite un routeur avec UPnP/IGD activé et une adresse IPv4 publique. Le CGNAT, le pare-feu du routeur ou celui du fournisseur d’accès peut empêcher l’accès; dans ce cas, configurer la redirection TCP manuellement ou utiliser un tunnel sécurisé. Le serveur actuel est en HTTP sans TLS et n’est pas conçu pour Internet : ne pas y saisir de vrais identifiants ni réutiliser des mots de passe. Ne pas laisser le port ouvert après la démonstration.

Les diagnostics sont conservés dans `logs/deploy_public.log` et `logs/server.log` (ou dans le dossier défini par `SIMTRADE_LOG_DIR`). Les requêtes sont journalisées sans corps de formulaire ni mots de passe.

## Données et sécurité

- Les comptes, sessions, permissions admin, actifs, portefeuilles, positions, ordres DEMO, transactions et écritures de ledger sont stockés dans `simtrade-python.sqlite`.
- Les mots de passe sont dérivés avec scrypt. Le jeton de session est envoyé dans un cookie HttpOnly, SameSite=Strict.
- Les cotations sont relayées par le serveur depuis Yahoo Finance, converties en EUR avec le taux EUR/USD, mises en cache 30 secondes et actualisées côté client toutes les 60 secondes. Cette source publique n'est pas une API officielle ou garantie et ses données peuvent être différées.
- Les ordres sont validés et exécutés par le serveur à partir d'une cotation récente. Le spread, le slippage et les commissions restent simulés.
- Les profils communautaires sont privés par défaut. Le partage doit être activé explicitement; seuls le nom affiché, le résultat réalisé et les transactions exécutées sont alors visibles aux comptes connectés. Les e-mails, soldes et ordres ouverts ne sont pas partagés. Aucune transaction n'est copiée entre comptes.
- Les favoris, alertes et préférences d'interface sont conservés dans le navigateur. Yahoo Finance reçoit les symboles publics demandés pour fournir les cotations; aucune donnée de compte, mot de passe ou ordre ne lui est envoyée.

Ne pas exposer ce serveur local sur Internet ni l'utiliser pour des décisions d'investissement.
