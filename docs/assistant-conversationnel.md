# Assistant conversationnel — Atlas MVP

L’assistant **propose** modules et connecteurs. Il **n’exécute jamais** de contrôle : seul le parcours mission + Policy Guard peut autoriser une exécution.

## Providers

| Mode | Env | Comportement |
|------|-----|----------------|
| **mock** (défaut) | `ATLAS_LLM_PROVIDER=mock` | Mots-clés déterministes, hors réseau |
| **api** (opt-in) | `ATLAS_LLM_PROVIDER=api` + `ATLAS_LLM_API_URL` + `ATLAS_LLM_API_KEY` | Chat completions ; repli mock si échec |

**Aucun secret LLM dans git** — uniquement `.env` local / secrets d’environnement.

## Plafonds par tenant (plan)

- `Plan.llmTokenCapMonthly` (défaut seed : 200 000)
- `Plan.llmEuroCapCentsMonthly` (défaut seed : 500 = 5,00 € estimés)
- Estimation € : `ATLAS_LLM_EURO_CENTS_PER_1M_TOKENS` (défaut 50)

Au-delà → réponse « plafond atteint », **aucune** exécution.

## Journalisation

Table `LlmUsageLog` + audit `llm.turn` / `llm.capped` :

- provider, model, tokens, € estimés, intent, empreinte message, longueur
- **pas** de prompt/réponse complets, **pas** de clé API

## API

- `POST /v1/conversation` — tour assistant (`executed: false`, `jobEnqueued: false`) ; **exige** une autorisation signée via `SignatureProvider.sign` (stub mock)
- `GET /v1/ux-needs` — catalogue (sans LLM)
- `GET /v1/assistant/usage` — consommation vs plafonds

## Gate signature (chat)

Avant tout appel LLM, l’assistant appelle `SignatureProvider.sign({ purpose: "chat", … })`.

| Statut stub | Comportement |
|-------------|--------------|
| `signed` | Réponse LLM autorisée (toujours `executed: false`) |
| `pending` / `rejected` | Pas d’appel LLM ; `intent: signature_required` |

Hook démo / CI : `ATLAS_CHAT_SIGNATURE_STUB=signed|pending|rejected` (défaut code = `pending`). **Pas de Pragma Sign réel** — même `MockSignatureProvider` que les missions (`createEnvelope` inchangé).

## Non-bypass

Tests `assistant.nobypass.test.ts` : une demande « lance / bypass » ne passe pas le Policy Guard ; `stripExecution` ignore `requestedExecution` du provider.  
Tests `assistant.chat-signature.test.ts` : gate signature avant réponse LLM.

## Hors scope

OIDC, e-sign eIDAS / Pragma Sign réel, hiérarchie A réelle — non concernés.
