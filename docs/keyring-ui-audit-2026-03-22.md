# GNOME / Keyring UI Audit — 2026-03-22

## Scope

- `renderer/src/pages/Keyring.tsx`
- `renderer/src/context/KeyringContext.tsx`
- `renderer/src/pages/Settings.tsx`
- `renderer/src/pages/Wallets.tsx`
- `renderer/src/pages/Dashboard.tsx`
- `main/ipcHandlers/index.ts`
- `backend/services/keyringUiService.ts`
- `src/core/keyringManager.ts`
- `backend/services/walletStore.ts`
- `backend/services/walletService.ts`

## Inventory of visible data surfaces

### Keyring page

- Active keyring service card.
- Stored aliases metric card.
- Backend metric card.
- Store secret form.
- Stored aliases list.
- Reveal secret panel.
- Switch keyring form.
- Activity feed.

### Settings page

- RPC Endpoint panel (`GNOMAN_RPC_URL`).

### Wallets / Dashboard surfaces with keyring-adjacent claims

- Dashboard “Hidden Vaults” stat card.
- Wallet generation/import descriptions and hidden-wallet checkboxes.
- Wallet properties visibility field.

## Field mapping matrix

| UI component | Field label | Source object | Source property | Transform / formatter | Expected output | Actual output after fix |
| --- | --- | --- | --- | --- | --- | --- |
| Keyring metric card | Active keyring service | `keyring:list` response | `displayName` | backend display-name lookup in `getKeyringBackendDisplayName()` | GNOME/KWallet/macOS/etc. label matching active backend | Renders active backend display name from current manager backend |
| Keyring metric card | Stored aliases | `keyring:list` response | `secrets.length` | integer count | number of secrets in active backend | Count matches backend snapshot |
| Keyring metric card | Backend | `keyring:backends` response | active entry `displayName` | active backend lookup | same backend shown by current manager | Matches active backend list entry |
| Stored aliases list | alias row title | `keyring:list` response | `secrets[].alias` | lexical sort | exact stored alias | Alias renders exact key name |
| Stored aliases list | masked value | `keyring:list` response | `secrets[].maskedValue` | `maskSecretValue()` | masked secret, never plaintext | Non-empty masked preview rendered for every stored secret |
| Reveal panel | Alias | local form state | `revealTarget` | none | selected / typed alias | Field tracks alias input |
| Reveal panel | Revealed secret | `keyring:get` response | raw secret string | no transform after explicit reveal | plaintext only after reveal action | Correct plaintext shown only after explicit reveal |
| Store secret form | Backend (optional) | local form state / `keyring:backends` | `service` + backend list | optional switch via IPC before mutation | operation runs against selected backend | Save targets requested backend and refreshes same backend |
| Settings RPC panel | backend label in description | `keyring:backends` response | active backend `displayName` | active backend lookup | active backend name, not hardcoded vendor | Dynamic label shown |
| Dashboard stat | Hidden Vaults hint | wallet metadata semantics | `hidden` flag | copy only | must describe actual persistence semantics | Label states local encrypted classification |
| Wallet forms / properties | hidden wallet labels | wallet metadata semantics | `hidden` flag | copy only | must describe encrypted local vault, not keyring | Labels now match persisted wallet storage behavior |

## Trace: storage/provider -> model/viewmodel -> UI

### Keyring page

1. `src/core/keyringManager.ts` selects and operates the active backend (`system`, `file`, `memory`).
2. `backend/services/keyringUiService.ts` converts backend state into UI-safe summaries:
   - current backend -> display name
   - raw secret value -> masked preview
   - optional service override -> backend switch before mutation/read
3. `main/ipcHandlers/index.ts` exposes the summary and mutation handlers over Electron IPC.
4. `renderer/src/context/KeyringContext.tsx` refreshes from IPC and stores `summary`.
5. `renderer/src/pages/Keyring.tsx` binds `summary` into cards, alias rows, reveal panel, and switch form.

### Settings RPC panel

1. `src/core/keyringManager.ts` / `keyring:backends` determines the active backend.
2. `renderer/src/pages/Settings.tsx` resolves the active backend display name.
3. The description text now reflects the actual backend instead of a hardcoded KWallet label.

### Wallet hidden-state labels

1. `backend/services/walletStore.ts` persists wallet records in `.gnoman/wallets.db`.
2. `backend/services/walletService.ts` exposes `hidden` as metadata only; it does not move wallet secrets into the keyring.
3. `renderer/src/pages/Wallets.tsx` and `renderer/src/pages/Dashboard.tsx` now describe the hidden flag as UI classification on encrypted local storage, which matches the underlying persistence layer.

## Defects and root causes

1. **Blank masked-value field for every stored alias**
   - Root cause: `KeyringContext.refresh()` discarded raw values and set `maskedValue: null` for all entries.
   - Fix: introduced `keyringUiService` summary mapping with deterministic masking before UI binding.

2. **Wrong active-service label**
   - Root cause: `KeyringContext.refresh()` hardcoded `backend: 'system', service: 'system'`.
   - Fix: IPC summary now returns the actual active backend and display name.

3. **Backend-targeted create/reveal/delete operations ignored selected backend**
   - Root cause: renderer passed `service`, but IPC handlers/context methods dropped it.
   - Fix: optional `service` now switches the manager backend before mutation/read, then refreshes the same backend.

4. **Stale UI after backend switch / save**
   - Root cause: refresh logic reloaded a hardcoded system summary.
   - Fix: refresh optionally switches to the requested backend, then reloads the authoritative summary.

5. **Incorrect masking/security copy**
   - Root cause: UI claimed “multi-step confirmation” though reveal was single-action.
   - Fix: copy now states explicit reveal from the panel.

6. **Incorrect vendor/backend label in Settings**
   - Root cause: settings text hardcoded `KWallet`, which is wrong for GNOME / Secret Service and other platforms.
   - Fix: settings description resolves the active backend display name dynamically.

7. **Incorrect hidden-wallet persistence claims**
   - Root cause: wallet/dashboard copy claimed hidden wallets were stored in keyring isolation, but persistence is actually the encrypted local wallet vault.
   - Fix: updated labels/descriptions to match `walletStore` / `walletService` persistence semantics.

## Regression coverage

- `tests/keyringUiService.test.ts`
  - verifies backend -> UI summary mapping
  - verifies masked values are populated
  - verifies service override switches backend before store/reveal/delete

## Certification

### Certified correct in audited scope

- Keyring list/detail/backend labels now map to the active backend and underlying stored values.
- Masked rows render masked values rather than blanks.
- Backend-targeted operations persist and reload from the correct backend.
- GNOME/KWallet/system backend labels are no longer hardcoded incorrectly.
- Hidden-wallet labels now match actual persistence semantics.

### Residual limitation

- No browser/Electron screenshot or interactive desktop session was available in this environment, so visual verification was completed by code-path trace plus automated regression tests rather than a live GNOME desktop run.
