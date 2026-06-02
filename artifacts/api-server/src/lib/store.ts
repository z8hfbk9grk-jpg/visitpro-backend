export interface Reservation {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  bien: string;
  date: string;
  heure: string;
  createdAt: string;
}

export interface Agent {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  agence: string;
  createdAt: string;
}

export interface Bien {
  id: string;
  agentId: string;
  titre: string;
  adresse: string;
  type: string;
  prix: number;
  surface: number;
  description: string;
  createdAt: string;
}

export const reservations: Reservation[] = [];
export const agents: Agent[] = [];
export const biens: Bien[] = [
  {
    id: "bien-1",
    agentId: "agent-1",
    titre: "Appartement T3 Paris 11e",
    adresse: "12 rue de la Roquette, 75011 Paris",
    type: "appartement",
    prix: 450000,
    surface: 68,
    description: "Bel appartement lumineux avec parquet et double vitrage.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "bien-2",
    agentId: "agent-1",
    titre: "Studio Montmartre",
    adresse: "5 rue Lepic, 75018 Paris",
    type: "studio",
    prix: 220000,
    surface: 28,
    description: "Studio idéalement situé à deux pas du Sacré-Cœur.",
    createdAt: new Date().toISOString(),
  },
];

let counter = 1000;
export function nextId(prefix: string): string {
  return `${prefix}-${++counter}`;
}
