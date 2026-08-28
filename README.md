# Porto SDK

[![validation](https://github.com/gruncellka/porto-sdk-typescript/actions/workflows/validation.yml/badge.svg)](https://github.com/gruncellka/porto-sdk-typescript/actions/workflows/validation.yml)
[![codecov](https://codecov.io/gh/gruncellka/porto-sdk-typescript/branch/main/graph/badge.svg)](https://codecov.io/gh/gruncellka/porto-sdk-typescript)

Cross-provider postal SDK for TypeScript.

Supported providers: Deutsche Post, Ukrposhta, La Poste, and Swiss Post.

## Install

```bash
npm install @gruncellka/porto-sdk
```

`porto-data` ships as a runtime dependency (products, pricing, restrictions, formats). You do not install it separately.

## Quick start

`PortoClient` is the entry point. `client.provider(...)` returns a `ProviderClient` for one postal operator. `options()`, `resolve()`, `price()`, and `restrictions.check()` need no credentials. `mark()` does.

```typescript
import { PortoClient } from "@gruncellka/porto-sdk";

const client = new PortoClient();
const dp = client.provider("deutschepost");
```

## Discover options

List available products for a destination, weight, and optional envelope. Each `ProductOption` includes the services available with that product.

```typescript
const options = dp.options({ countryCode: "DE", weight: 20, envelopeId: "DL" });
const product = options.find((row) => row.id === "standardbrief")!;
```

```text
{
  id: "standardbrief",
  amount: 95,
  currency: "EUR",
  services: [
    { id: "einschreiben", kind: "registered", name: "Einschreiben", amount: 265, currency: "EUR" },
    { id: "einschreiben_rueckschein", kind: "registered_return_receipt", name: "Einschreiben Rückschein", amount: 485, currency: "EUR" },
    ...
  ]
}
```

## Resolve

When one product matches the weight, `resolve` can omit `productId`. Otherwise choose a product from discovery. Select services by `ServiceOption.kind`. If several options share the same kind, also pass the selected service ID.

```typescript
const returnReceipt = product.services.find((svc) => svc.kind === "registered_return_receipt")!;
const porto = await dp.resolve({
    countryCode: "DE",
    weight: 20,
    envelopeId: "DL",
    productId: product.id,
    services: [returnReceipt.kind!],
});
```

```text
{
  amount: 580,
  currency: "EUR",
  components: [
    { kind: "product", id: "standardbrief", amount: 95 },
    { kind: "service", id: "einschreiben_rueckschein", amount: 485 }
  ]
}
// 95 + 485 = 580
```

When several `ServiceOption`s share a kind (for example `registered`), pass that option’s `id` as `serviceIds` (`PORTO_SERVICE_AMBIGUOUS` otherwise):

```typescript
const service = product.services.find((svc) => svc.id === "einschreiben")!;
const registeredPorto = await dp.resolve({
    countryCode: "DE",
    weight: 20,
    envelopeId: "DL",
    productId: product.id,
    services: [service.kind!],
    serviceIds: [service.id],
});
```

`price()` returns the same amount, currency, and components for the same selection. It is not required after `resolve()`.

## Restrictions

`resolve()` attaches country-level restrictions on `Porto.restrictions`. At country precision, regional restrictions produce `impact: "warn"`. Use `restrictions.check()` with a region code for a more precise result:

```typescript
const toUkraine = await dp.resolve({ countryCode: "UA", weight: 20 });
```

```text
toUkraine.restrictions → { impact: "warn", legal: [...], routing: [] }
```

```typescript
const kherson = dp.restrictions.check("UA", "UA-65");
```

```text
{
  impact: "warn",
  legal: [
    {
      impact: "warn",
      countryCode: "UA",
      regionCode: "UA-65",
      partial: true,
      reason: "Regional legal restrictions apply.",
      description: "Applicable jurisdictional measures cover part of this region.",
      jurisdictions: [
        { jurisdiction: "EU", reference: "https://eur-lex.europa.eu/eli/reg/2022/1903/oj", effectiveFrom: "2022-10-06" }
      ]
    }
  ],
  routing: []
}
```

## Mark

`mark()` uses the resolved Porto and does not re-price it.

The **provider** is the operator you chose. A **wire** is the execution integration (for example Internetmarke). Adapters stay internal — omit `wire` when the default integration applies. Pass credentials per call on `ExecutionParameters`; per-call values override runtime defaults.

```typescript
const mark = await dp.mark(
    { porto },
    { credentials: { username: "***", password: "***" } },
);
```

```text
{
  id: "…",
  provider: "deutschepost",
  wire: "internetmarke",
  content: "https://…",
  contentType: "application/pdf",
  amount: 580,
  currency: "EUR",
}
```

## Browser

```typescript
import { PortoClient } from "@gruncellka/porto-sdk/browser";
```

## CLI

`identify` (envelope format and dimensions), `resolve`, `price`, `mark`, `track`, `config {check,init}`, `auth {login,status,logout}`. Human-readable by default; `--json` for machines. Credentials via environment or `porto auth login` (`~/.porto/config.json`).

## Porto ecosystem

- [porto-sdk-python](https://github.com/gruncellka/porto-sdk-python) software development kit
- [porto-data](https://github.com/gruncellka/porto-data) — runtime postal data
- [porto-features](https://github.com/gruncellka/porto-features) — shared behavioral contract

---

🔳 gruncellka
