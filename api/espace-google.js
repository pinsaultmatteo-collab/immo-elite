/**
 * /api/espace-google — connexion de l'espace coach à Google Agenda (OAuth 2.0).
 *   GET ?start=1          part vers la page d'autorisation Google (Mattéo connecté en coach)
 *   GET ?code=…&state=…   retour de Google : enregistre l'accès, puis renvoie vers Réglages
 * Adresse à déclarer chez Google (URI de redirection autorisé) : https://espace.immoelite-formation.fr/api/espace-google
 */
import { handleGoogleGet } from "./_lib/espace/handler.js";

export async function GET(request) {
  return handleGoogleGet(request);
}
