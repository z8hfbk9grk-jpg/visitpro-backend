# 🏠 Agent de prospection Airbnb

Agent de prospection pour conciergerie Airbnb, secteur **Val d'Europe / Disneyland Paris / Meaux**.
Il est autonome : il ne touche pas à l'API VisitPro qui se trouve dans le même dépôt.

## Ce que fait l'agent

1. **Vous collez** le lien d'une annonce Airbnb (et si possible son texte) sur une page web privée.
   L'agent ne va jamais lire Airbnb tout seul (pas de scraping).
2. **Claude note l'annonce** sur 10 : photos, description, nombre d'avis, prix, disponibilités.
   La note mesure le *potentiel d'optimisation* : **10 = annonce très perfectible = meilleur prospect**.
   Il liste aussi les points faibles.
3. **Claude cherche le propriétaire** sur le web public (site, page Facebook pro, Google Maps,
   LinkedIn, annuaires d'entreprises). Il ne garde que les **coordonnées professionnelles publiques**,
   avec le lien de la page où il les a trouvées.
4. **Claude rédige un message d'approche** personnalisé. Un lien de désinscription est ajouté en bas.
5. **Chaque matin**, vous recevez un email récapitulatif, classé par note.

> L'agent **n'envoie rien aux propriétaires**. C'est vous qui relisez et envoyez chaque message.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `src/server.ts` | La page web (mot de passe, ajout des annonces, page de désinscription) |
| `src/cron.ts` | La tournée du matin (analyse, nettoyage RGPD, email) |
| `src/pipeline.ts` | Le traitement d'une annonce, étape par étape |
| `src/claude.ts` | Les échanges avec Claude (recherche web, note, message) |
| `src/db.ts` | La base de données Neon (tables créées automatiquement) |
| `src/email.ts`, `src/recap.ts` | Le récapitulatif par email |
| `src/pages.ts`, `src/html.ts` | L'apparence des pages |
| `.env.example` | La liste des réglages à saisir dans Render |

---

## Mise en route (environ 30 minutes, sans terminal)

### Étape 1 : créer les comptes et récupérer les clés

Notez chaque clé dans un endroit sûr. Ne la mettez **jamais** dans GitHub.

1. **Neon** (base de données) : sur [neon.tech](https://neon.tech), créez un projet (région Europe, Francfort).
   Cliquez sur **Connect** et copiez la *connection string* (elle commence par `postgresql://`).
   → c'est votre `DATABASE_URL`. Vous pouvez réutiliser la base de VisitPro : l'agent crée ses propres
   tables (`prospects` et `liste_opposition`) sans toucher aux autres.
2. **Claude** : sur [console.anthropic.com](https://console.anthropic.com), rubrique **API Keys**,
   créez une clé → `ANTHROPIC_API_KEY`. Ajoutez quelques euros de crédit dans **Billing**.
   La recherche web est autorisée par défaut ; si elle a été désactivée, réactivez-la dans les paramètres de la console.
3. **Resend** (envoi d'emails) : sur [resend.com](https://resend.com), créez une clé API → `RESEND_API_KEY`.
   - Pour tester tout de suite : `EMAIL_FROM` = `onboarding@resend.dev`, et `EMAIL_TO` = l'adresse
     de votre compte Resend (c'est la seule adresse autorisée dans ce mode).
   - Pour la suite : ajoutez votre nom de domaine dans **Domains** et suivez les instructions,
     puis utilisez une adresse de ce domaine dans `EMAIL_FROM`.

### Étape 2 : créer les services sur Render

Le fichier `render.yaml` à la racine du dépôt décrit deux nouveaux services :

- **prospection-agent** : la page web (offre gratuite) ;
- **prospection-agent-matin** : la tâche planifiée du matin (offre *Starter* : Render facture les
  tâches planifiées à la minute d'exécution, environ 1 $ par mois pour quelques minutes par jour).

1. Dans Render : **New → Blueprint**, choisissez le dépôt `visitpro-backend` et la branche voulue.
2. Render affiche la liste des services. Votre API `visitpro-api` existante apparaît aussi : elle n'est pas modifiée.
3. Render vous demande les valeurs marquées comme secrètes. Remplissez-les à l'aide du tableau ci-dessous.
4. Cliquez sur **Apply**. La première construction prend 2 à 3 minutes.

> Si vous préférez créer les services à la main : **New → Web Service**, puis **New → Cron Job**, avec
> *Root Directory* = `prospection-agent`, *Build Command* = `npm ci && npm run build`,
> *Start Command* = `npm start` (web) ou `npm run cron` (tâche), *Schedule* = `0 5 * * *`.

| Variable | Web | Matin | Valeur |
|---|:-:|:-:|---|
| `DATABASE_URL` | ✅ | ✅ | La connection string Neon |
| `ANTHROPIC_API_KEY` | ✅ | ✅ | Votre clé Claude |
| `RESEND_API_KEY` | ✅ | ✅ | Votre clé Resend |
| `EMAIL_FROM` | ✅ | ✅ | Expéditeur, ex. `Agent <prospection@mondomaine.fr>` |
| `EMAIL_TO` | ✅ | ✅ | Votre adresse (plusieurs possibles, séparées par des virgules) |
| `ADMIN_PASSWORD` | ✅ | | Mot de passe de la page web (long !) |
| `PUBLIC_URL` | | ✅ | L'adresse de la page web, ex. `https://prospection-agent.onrender.com` |
| `CONCIERGERIE_NOM` | ✅ | ✅ | Nom de votre conciergerie |
| `CONCIERGERIE_SIGNATURE` | ✅ | ✅ | Ex. `Julie Martin – Conciergerie du Val – 06 12 34 56 78` |
| `CONCIERGERIE_PITCH` | ✅ | ✅ | Une phrase qui présente vos services |

Réglages facultatifs (valeurs par défaut entre parenthèses) : `MAX_ANNONCES_PAR_JOUR` (20),
`DUREE_CONSERVATION_JOURS` (90), `CLAUDE_MODEL` (`claude-opus-5-5`).

`PUBLIC_URL` sert à fabriquer le lien de désinscription. Vous connaissez l'adresse une fois le service
web créé (elle s'affiche en haut de sa page Render) : ajoutez-la ensuite au service *Matin*,
onglet **Environment**.

### Étape 3 : premier essai

1. Ouvrez l'adresse du service web. Le navigateur demande un identifiant et un mot de passe :
   identifiant = ce que vous voulez, mot de passe = `ADMIN_PASSWORD`.
2. Collez le lien d'une annonce et son texte (sur l'annonce : tout sélectionner, copier, coller).
   Plus le texte est complet (prix, nombre d'avis, note, nombre de photos, prénom de l'hôte), plus la note est juste.
3. Cliquez sur **▶ Analyser maintenant**. Comptez 1 à 2 minutes par annonce ; la page se met à jour toute seule.
4. Cliquez sur **✉ Envoyer le récap maintenant** pour vérifier que l'email arrive.
5. Pour tester la tâche du matin sans attendre : page Render du service *Matin* → **Trigger Run**.

### En cas de problème

- La page affiche une erreur ou ne démarre pas : onglet **Logs** du service sur Render. Le message
  indique en général la variable manquante.
- Une annonce reste en ❌ Erreur : l'erreur s'affiche sur sa fiche ; cliquez sur **↻ Ré-analyser**.
- La version gratuite de Render met la page en veille après 15 minutes sans visite :
  le premier chargement peut prendre environ 1 minute. C'est normal.

---

## Coûts estimés

- **Claude** : chaque annonce = une recherche web (jusqu'à 6 requêtes, 0,01 $ chacune) + une analyse.
  Comptez de l'ordre de **0,10 à 0,30 $ par annonce**. `MAX_ANNONCES_PAR_JOUR` limite la dépense.
  Pour réduire le coût, mettez `CLAUDE_MODEL` = `claude-sonnet-5-5` (moins cher, un peu moins fin).
- **Render** : page web gratuite ; tâche du matin environ 1 $/mois.
- **Neon** et **Resend** : les offres gratuites suffisent.

---

## RGPD : ce qui est en place et ce qui reste à votre charge

**Prévu dans l'agent :**

- Seules les coordonnées **professionnelles et publiques** sont conservées, avec leur source.
  Claude a pour consigne d'écarter tout ce qui est personnel, et le code supprime toute coordonnée
  qui n'est pas marquée comme professionnelle ou n'a pas de source.
- Airbnb n'est jamais interrogé automatiquement.
- Chaque message contient l'origine des coordonnées et un **lien de désinscription**.
  Un clic sur ce lien supprime aussitôt la fiche et inscrit la personne sur une **liste d'opposition**.
  Cette liste ne garde qu'une empreinte chiffrée, pas la donnée elle-même. La personne ne pourra plus
  être ajoutée ni recontactée.
- Les fiches sont **supprimées automatiquement** après `DUREE_CONSERVATION_JOURS` jours.
- La page de gestion est protégée par mot de passe et n'est pas indexée par les moteurs de recherche.

**À votre charge :**

- **Particuliers** : beaucoup d'hôtes Airbnb sont des particuliers. Leur envoyer un email de prospection
  sans leur accord préalable est interdit (règle CNIL). L'agent signale ces cas avec ⚠️. Contactez seulement
  les professionnels (conciergeries, SCI, sociétés, loueurs déclarés avec une page professionnelle).
- **Téléphone** : avant d'appeler un numéro, vérifiez qu'il n'est pas inscrit sur Bloctel.
- Envoyez les messages depuis votre adresse professionnelle et répondez aux demandes d'accès ou de
  suppression sous un mois.
- Inscrivez ce traitement dans votre registre des traitements (modèle simple sur cnil.fr).

Ce guide ne remplace pas un conseil juridique. En cas de doute, consultez les fiches
« prospection commerciale » de la CNIL.
