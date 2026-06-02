# VisitPro — API Documentation

**URL de base :** `https://9699b504-9af4-47d3-b897-b6259f7336a2-00-1v704rlp4aqu4.kirk.replit.dev`

Toutes les routes commencent par `/api`.  
Les routes marquées 🔒 nécessitent un header `Authorization: Bearer <token>`.

---

## Authentification

Le token s'obtient lors de la création de compte ou lors du login. Il doit être envoyé dans le header HTTP :
```
Authorization: Bearer <votre_token>
```

---

## 👤 Agents

### Créer un compte agent
```http
POST /api/agents
Content-Type: application/json

{
  "nom": "Dupont",
  "prenom": "Marie",
  "email": "marie@agence.fr",
  "telephone": "0611223344",
  "agence": "ImmoSud",
  "motDePasse": "monMotDePasse"
}
```
**Réponse 201 :**
```json
{
  "agent": { "id": "abc-123", "nom": "Dupont", "prenom": "Marie", "email": "marie@agence.fr", "telephone": "0611223344", "agence": "ImmoSud", "createdAt": "2026-06-02T20:00:00Z" },
  "token": "votre_token_ici"
}
```

---

### Lister tous les agents 🔒
```http
GET /api/agents?page=1&limite=20
Authorization: Bearer <token>
```
**Réponse 200 :**
```json
{
  "total": 5,
  "page": 1,
  "limite": 20,
  "totalPages": 1,
  "data": [ { "id": "...", "nom": "Dupont", "prenom": "Marie", ... } ]
}
```

---

### Récupérer un agent par ID
```http
GET /api/agents/abc-123
```
**Réponse 200 :**
```json
{ "id": "abc-123", "nom": "Dupont", "prenom": "Marie", "email": "marie@agence.fr", "agence": "ImmoSud", "createdAt": "..." }
```

---

### Stats d'un agent
```http
GET /api/agents/abc-123/stats
```
**Réponse 200 :**
```json
{
  "agent": { "id": "abc-123", "nom": "Dupont", ... },
  "stats": {
    "nbBiens": 3,
    "nbReservations": 12,
    "reservationsParBien": [
      { "titre": "Studio Lyon", "nbReservations": 5 },
      { "titre": "Villa Bordeaux", "nbReservations": 7 }
    ]
  }
}
```

---

## 🔑 Authentification

### Se connecter
```http
POST /api/login
Content-Type: application/json

{
  "email": "marie@agence.fr",
  "motDePasse": "monMotDePasse"
}
```
**Réponse 200 :**
```json
{
  "agent": { "id": "...", "nom": "Dupont", ... },
  "token": "votre_token_ici"
}
```

---

### Se déconnecter 🔒
```http
POST /api/logout
Authorization: Bearer <token>
```
**Réponse 200 :**
```json
{ "message": "Déconnexion réussie" }
```

---

### Mon profil 🔒
```http
GET /api/me
Authorization: Bearer <token>
```
**Réponse 200 :**
```json
{ "id": "...", "nom": "Dupont", "prenom": "Marie", "email": "marie@agence.fr", "agence": "ImmoSud", "createdAt": "..." }
```

---

### Modifier mon profil 🔒
```http
PUT /api/me
Authorization: Bearer <token>
Content-Type: application/json

{
  "telephone": "0699887766",
  "agence": "Nouvelle Agence"
}
```
> Champs modifiables : `nom`, `prenom`, `telephone`, `agence` (tous optionnels)

**Réponse 200 :** agent mis à jour (sans mot de passe)

---

### Changer mon mot de passe 🔒
```http
PUT /api/me/mot-de-passe
Authorization: Bearer <token>
Content-Type: application/json

{
  "motDePasseActuel": "ancienMotDePasse",
  "motDePasseNouveau": "nouveauMotDePasse"
}
```
**Réponse 200 :**
```json
{ "message": "Mot de passe mis à jour", "token": "nouveau_token" }
```
> ⚠️ L'ancien token est révoqué. Utiliser le nouveau token retourné.

---

## 🏠 Biens immobiliers

Types valides : `appartement` · `maison` · `studio` · `bureau` · `terrain`

### Publier un bien 🔒
```http
POST /api/biens
Authorization: Bearer <token>
Content-Type: application/json

{
  "titre": "Studio Lyon Centre",
  "adresse": "10 rue Victor Hugo, 69001 Lyon",
  "type": "studio",
  "prix": 120000,
  "surface": 28,
  "description": "Studio lumineux, idéalement situé."
}
```
**Réponse 201 :**
```json
{ "id": "xyz-456", "agentId": "abc-123", "titre": "Studio Lyon Centre", "adresse": "...", "type": "studio", "prix": 120000, "surface": 28, "description": "...", "createdAt": "..." }
```

---

### Lister et filtrer les biens
```http
GET /api/biens
```

**Paramètres optionnels :**

| Paramètre | Exemple | Description |
|---|---|---|
| `agentId` | `?agentId=abc-123` | Biens d'un agent précis |
| `type` | `?type=appartement` | Filtrer par type |
| `prixMin` | `?prixMin=100000` | Prix minimum (€) |
| `prixMax` | `?prixMax=500000` | Prix maximum (€) |
| `surfaceMin` | `?surfaceMin=50` | Surface minimum (m²) |
| `surfaceMax` | `?surfaceMax=200` | Surface maximum (m²) |
| `q` | `?q=lyon` | Recherche dans titre, adresse, description |
| `tri` | `?tri=prix_asc` | `prix_asc`, `prix_desc`, `surface_asc`, `surface_desc`, `recent` |
| `page` | `?page=2` | Numéro de page (défaut : 1) |
| `limite` | `?limite=10` | Résultats par page (défaut : 20, max : 100) |

**Exemples :**
```http
GET /api/biens?type=appartement&prixMin=200000&prixMax=600000&tri=prix_asc
GET /api/biens?q=paris&surfaceMin=60&page=1&limite=10
```

**Réponse 200 :**
```json
{
  "total": 12,
  "page": 1,
  "limite": 20,
  "totalPages": 1,
  "filtres": { "type": "appartement", "prixMin": 200000, "prixMax": 600000, ... },
  "data": [ { "id": "...", "titre": "...", "adresse": "...", ... } ]
}
```

---

### Récupérer un bien par ID
```http
GET /api/biens/xyz-456
```
**Réponse 200 :**
```json
{ "id": "xyz-456", "titre": "Studio Lyon Centre", "adresse": "...", "type": "studio", "prix": 120000, "surface": 28, "createdAt": "..." }
```

---

### Réservations d'un bien 🔒
```http
GET /api/biens/xyz-456/reservations?page=1&limite=20
Authorization: Bearer <token>
```
**Réponse 200 :**
```json
{
  "bien": { "id": "xyz-456", "titre": "Studio Lyon Centre" },
  "total": 3,
  "page": 1,
  "totalPages": 1,
  "data": [ { "id": "...", "nom": "Martin", "prenom": "Julie", ... } ]
}
```

---

### Modifier un bien 🔒
```http
PUT /api/biens/xyz-456
Authorization: Bearer <token>
Content-Type: application/json

{
  "prix": 115000,
  "description": "Prix revu à la baisse."
}
```
> Tous les champs sont optionnels. Seul l'agent propriétaire peut modifier.

**Réponse 200 :** bien mis à jour

---

### Supprimer un bien 🔒
```http
DELETE /api/biens/xyz-456
Authorization: Bearer <token>
```
**Réponse 200 :**
```json
{ "message": "Bien supprimé", "bien": { ... } }
```

---

## 📅 Réservations de visites

### Créer une réservation *(public — depuis le formulaire client)*
```http
POST /api/reservations
Content-Type: application/json

{
  "nom": "Martin",
  "prenom": "Julie",
  "email": "julie.martin@email.fr",
  "telephone": "0600112233",
  "bien": "Studio Lyon Centre",
  "date": "2026-06-15",
  "heure": "10:00"
}
```
> `date` au format `AAAA-MM-JJ` · `heure` au format `HH:MM`

**Réponse 201 :**
```json
{ "id": "res-789", "nom": "Martin", "prenom": "Julie", "email": "julie.martin@email.fr", "telephone": "0600112233", "bien": "Studio Lyon Centre", "date": "2026-06-15", "heure": "10:00", "createdAt": "..." }
```

---

### Lister les réservations 🔒
```http
GET /api/reservations
Authorization: Bearer <token>
```

**Paramètres optionnels :**

| Paramètre | Exemple | Description |
|---|---|---|
| `bienId` | `?bienId=Studio Lyon` | Filtrer par nom exact du bien |
| `nom` | `?nom=martin` | Recherche dans nom et prénom |
| `email` | `?email=julie` | Recherche dans l'email |
| `q` | `?q=lyon` | Recherche globale (nom, prénom, email, bien) |
| `page` | `?page=1` | Numéro de page |
| `limite` | `?limite=50` | Résultats par page (défaut : 50, max : 100) |

**Exemples :**
```http
GET /api/reservations?nom=martin
GET /api/reservations?q=studio&page=1&limite=10
```

**Réponse 200 :**
```json
{
  "total": 4,
  "page": 1,
  "limite": 50,
  "totalPages": 1,
  "filtres": { "nom": "martin", "q": null, "email": null, "bienId": null },
  "data": [ { "id": "...", "nom": "Martin", "prenom": "Julie", ... } ]
}
```

---

### Récupérer une réservation par ID 🔒
```http
GET /api/reservations/res-789
Authorization: Bearer <token>
```
**Réponse 200 :** objet réservation complet

---

### Replanifier une réservation 🔒
```http
PATCH /api/reservations/res-789
Authorization: Bearer <token>
Content-Type: application/json

{
  "date": "2026-07-20",
  "heure": "14:30"
}
```
> Champs modifiables : `date`, `heure`, `bien` (tous optionnels)

**Réponse 200 :** réservation mise à jour

---

### Annuler une réservation 🔒
```http
DELETE /api/reservations/res-789
Authorization: Bearer <token>
```
**Réponse 200 :**
```json
{ "message": "Réservation annulée", "reservation": { ... } }
```

---

## 📊 Statistiques globales

### Dashboard global
```http
GET /api/stats
```
**Réponse 200 :**
```json
{
  "agents": 5,
  "biens": 12,
  "reservations": 34,
  "biensParType": [
    { "type": "appartement", "count": 6 },
    { "type": "maison", "count": 3 },
    { "type": "studio", "count": 2 },
    { "type": "bureau", "count": 1 }
  ],
  "topBiens": [
    { "bien": "Appartement Haussmannien", "nbReservations": 8 },
    { "bien": "Studio Lyon", "nbReservations": 5 }
  ]
}
```

---

## 🩺 Santé du serveur

```http
GET /api/health
```
**Réponse 200 :**
```json
{ "status": "ok" }
```

---

## Codes d'erreur

| Code | Signification |
|---|---|
| `400` | Données invalides (champ manquant, format incorrect) |
| `401` | Non authentifié ou token expiré |
| `404` | Ressource introuvable |
| `409` | Conflit (ex : email déjà utilisé) |
| `500` | Erreur interne du serveur |

**Exemple d'erreur 400 :**
```json
{
  "error": "Données invalides",
  "details": [
    { "path": ["email"], "message": "Email invalide" },
    { "path": ["date"], "message": "Format date invalide (AAAA-MM-JJ)" }
  ]
}
```

---

## Exemple JavaScript complet — connexion + appel API

```javascript
const API = "https://9699b504-9af4-47d3-b897-b6259f7336a2-00-1v704rlp4aqu4.kirk.replit.dev";

// 1. Connexion
const { agent, token } = await fetch(`${API}/api/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "marie@agence.fr", motDePasse: "monMotDePasse" }),
}).then(r => r.json());

localStorage.setItem("visitpro_token", token);

// 2. Appel authentifié
const biens = await fetch(`${API}/api/biens?type=appartement&prixMax=400000`, {
  headers: { "Authorization": `Bearer ${token}` },
}).then(r => r.json());

// 3. Créer une réservation (sans token)
await fetch(`${API}/api/reservations`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    nom: "Martin", prenom: "Julie",
    email: "julie@email.fr", telephone: "0600112233",
    bien: "Appartement Haussmannien",
    date: "2026-06-15", heure: "10:00",
  }),
});
```
